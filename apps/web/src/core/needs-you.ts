import { and, desc, eq, gte, inArray, ne, or, gt, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { SPEND_CATEGORIES } from './categorize'
import { localDate, localDayRange } from './time'
import type { User } from './user'
import { WAITING_ERRORS, summarize, reasonFor } from '@/domain/inbox'
import {
  NUDGE_TTL_DAYS, RESTORE_MINUTES, clearedLine, groupUncategorised, rankNeedsYou,
  type InsightLite, type NeedsYouItem,
} from '@/domain/needs-you'

/**
 * Pending insights that still count: everything except nudges older than NUDGE_TTL_DAYS.
 * The Coach list and the shell badge both use this, so they agree.
 */
export function pendingInsight(userId: string) {
  const I = schema.insights
  return and(
    eq(I.userId, userId), eq(I.status, 'pending'),
    or(ne(I.kind, 'nudge'), gt(I.createdAt, sql`now() - make_interval(days => ${NUDGE_TTL_DAYS})`)),
  )
}

/**
 * Failed raw events nobody can fix by waiting: not the ones that sort themselves out (an order not saved yet), and not
 * an item list whose order was dismissed (it can never attach). Written on the bare table name so the shell's count
 * query and this file's list share it.
 */
export const UNREAD_FILTER = sql`(raw_events.error is null or raw_events.error not in (${sql.join(WAITING_ERRORS.map((e) => sql`${e}`), sql`, `)}))
  and not (raw_events.source like '%-items' and exists (
    select 1 from raw_events o where o.user_id = raw_events.user_id and o.status = 'ignored'
      and o.source = raw_events.body->>'platform' and o.body->>'orderId' = raw_events.body->>'orderId'))`

const lite = (i: typeof schema.insights.$inferSelect): InsightLite => ({
  id: i.id, kind: i.kind, title: i.title, body: i.body, at: i.createdAt.toISOString(),
  meta: i.payload.meta, actions: i.payload.actions, review: i.payload.review,
})

/** Original message text for the "Original message" disclosure, capped so a huge body never ships to the client. */
const original = (body: unknown) => (typeof body === 'string' ? body : JSON.stringify(body, null, 2)).slice(0, 2000)

/**
 * Everything waiting for the user, ranked: pending insights (alerts, nudges, proposals, goal drafts, the weekly review,
 * the recovery choice), messages the app could not read, and payments with no category (one item per merchant). The three
 * queries mirror the SQL behind the shell badge, so the list and the count agree.
 */
export async function loadNeedsYou(user: User, now = new Date()): Promise<{ items: NeedsYouItem[]; categories: string[] }> {
  const R = schema.rawEvents, T = schema.transactions
  const [pending, failed, uncategorised, used, recovery] = await Promise.all([
    db.select().from(schema.insights).where(pendingInsight(user.id)).orderBy(desc(schema.insights.createdAt)).limit(200),
    db.select().from(R).where(and(eq(R.userId, user.id), eq(R.status, 'failed'), sql`${UNREAD_FILTER}`)).orderBy(desc(R.at)).limit(300),
    db.select({ id: T.id, merchant: T.merchant, upiId: T.upiId, amount: T.amount, currency: T.currency, at: T.at }).from(T)
      .where(and(eq(T.userId, user.id), eq(T.category, 'Uncategorized'))).limit(5000),
    // The user's own most used categories come first in the chips.
    db.select({ category: T.category, n: sql<number>`count(*)::int` }).from(T)
      .where(and(eq(T.userId, user.id), sql`${T.category} is not null`, ne(T.category, 'Uncategorized'), ne(T.category, 'Income'), ne(T.category, 'Transfers')))
      .groupBy(T.category).orderBy(desc(sql`count(*)`)).limit(8),
    import('./recovery').then((r) => r.getRecovery(user, now)),
  ])

  const items: NeedsYouItem[] = pending.map((i): NeedsYouItem => {
    const insight = lite(i)
    if (i.payload.recovery) return { kind: 'recovery', id: i.id, insight, recovery: recovery?.id === i.id ? recovery : null, at: insight.at }
    if (i.payload.goalDraft) return { kind: 'goal-draft', id: i.id, insight, draft: i.payload.goalDraft, at: insight.at }
    return { kind: i.kind, id: i.id, insight, at: insight.at }
  })
  for (const e of failed) {
    items.push({
      kind: 'unread', id: e.id, rawEventIds: [e.id], summary: summarize(e.source, e.body), reason: reasonFor(e.status, e.error),
      original: original(e.body), at: e.at.toISOString(),
    })
  }
  items.push(...groupUncategorised(uncategorised))

  const names = used.flatMap((u) => (u.category ? [u.category] : []))
  return { items: rankNeedsYou(items, now), categories: [...new Set([...names, ...SPEND_CATEGORIES.filter((c) => c !== 'Uncategorized')])] }
}

export type ClearedItem = { id: string; line: string; at: string; kind: string; undo: boolean }

/** Cards cleared today (accepted, dismissed, done), newest first, for the "All caught up" state. Undo is offered for a recent dismiss. */
export async function loadClearedToday(user: User, now = new Date()): Promise<ClearedItem[]> {
  const I = schema.insights
  const [from] = localDayRange(localDate(now, user.timezone), user.timezone)
  const rows = await db.select().from(I)
    .where(and(eq(I.userId, user.id), inArray(I.status, ['accepted', 'dismissed', 'done']), gte(I.updatedAt, from)))
    .orderBy(desc(I.updatedAt)).limit(6)
  const since = now.getTime() - RESTORE_MINUTES * 60_000
  return rows.map((i) => ({
    id: i.id, kind: i.kind, at: i.updatedAt.toISOString(),
    line: clearedLine({ kind: i.kind, title: i.title, status: i.status, actions: i.payload.actions, recoveryChoice: i.payload.recovery?.choice }),
    undo: i.status === 'dismissed' && !i.payload.recovery && i.updatedAt.getTime() >= since,
  }))
}
