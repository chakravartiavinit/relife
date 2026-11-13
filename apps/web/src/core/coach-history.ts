import { and, desc, eq, inArray, lte, ne, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { NUDGE_TTL_DAYS } from '@/domain/needs-you'
import { groupOf } from '@/domain/inbox'
import type { User } from './user'

export type HistoryDecision = { id: string; kind: 'alert' | 'nudge' | 'review' | 'plan'; title: string; body: string; status: string; at: string; expired: boolean }
export type HistoryEvent = typeof schema.rawEvents.$inferSelect

/**
 * What Coach keeps after it leaves Needs you: decided insights, nudges that ran out their three days, active plans, and
 * the messages ReLife is still waiting on or that were skipped (read-only, with Try now).
 */
export async function loadCoachHistory(user: User, now = new Date()) {
  const I = schema.insights, R = schema.rawEvents
  const cutoff = new Date(now.getTime() - NUDGE_TTL_DAYS * 86_400_000)
  const [decided, plans, failed, ignored, dismissedOrders, parsed] = await Promise.all([
    db.select().from(I)
      .where(and(eq(I.userId, user.id), or(ne(I.status, 'pending'), and(eq(I.kind, 'nudge'), lte(I.createdAt, cutoff)))))
      .orderBy(desc(I.updatedAt)).limit(50),
    db.select().from(schema.plans).where(and(eq(schema.plans.userId, user.id), eq(schema.plans.status, 'active'))).orderBy(desc(schema.plans.createdAt)),
    db.select().from(R).where(and(eq(R.userId, user.id), eq(R.status, 'failed'))).orderBy(desc(R.at)).limit(100),
    db.select().from(R).where(and(eq(R.userId, user.id), eq(R.status, 'ignored'))).orderBy(desc(R.at)).limit(30),
    db.select({ key: sql<string>`${R.source} || ':' || (${R.body}->>'orderId')` }).from(R)
      .where(and(eq(R.userId, user.id), eq(R.status, 'ignored'), sql`${R.body} ? 'orderId'`)),
    db.select({ n: sql<number>`count(*)::int` }).from(R).where(and(eq(R.userId, user.id), inArray(R.status, ['parsed']))),
  ])
  // An item list whose order was dismissed can never attach: it belongs with the skipped ones.
  const dismissed = new Set(dismissedOrders.map((d) => d.key))
  const orphan = (e: HistoryEvent) => {
    const b = e.body as { platform?: string; orderId?: string } | null
    return e.source.endsWith('-items') && dismissed.has(`${b?.platform}:${b?.orderId}`)
  }
  const decisions: HistoryDecision[] = decided.map((i) => ({
    id: i.id, kind: i.kind, title: i.title, body: i.body, status: i.status, at: i.updatedAt.toISOString(),
    expired: i.status === 'pending',
  }))
  return {
    decisions,
    plans: plans.map((p) => ({ id: p.id, goal: p.goal })),
    waiting: failed.filter((e) => groupOf(e.status, e.error, orphan(e)) === 'waiting'),
    skipped: [...ignored, ...failed.filter(orphan)].sort((a, b) => b.at.getTime() - a.at.getTime()),
    orphan,
    readByItself: parsed[0]?.n ?? 0,
  }
}
