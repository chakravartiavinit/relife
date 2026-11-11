import { and, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { ProposedAction } from '@/db/schema'
import { ensureTracker } from './ingest'
import { localDate } from './time'
import type { User } from './user'

type NewInsight = Omit<typeof schema.insights.$inferInsert, 'userId'>

/** Insert an insight unless one with the same dedupeKey was created in the last 7 days. */
export async function addInsight(user: User, i: NewInsight) {
  const key = i.payload?.dedupeKey
  if (key) {
    const since = new Date(Date.now() - 7 * 86_400_000)
    const recent = await db.select({ id: schema.insights.id, payload: schema.insights.payload }).from(schema.insights)
      .where(and(eq(schema.insights.userId, user.id), gte(schema.insights.createdAt, since)))
    if (recent.some((r) => r.payload.dedupeKey === key)) return null
  }
  const [row] = await db.insert(schema.insights).values({ ...i, userId: user.id }).returning()
  return row
}

/** Approve: apply proposed actions (create schedules / trackers), then mark accepted. */
export async function acceptInsight(user: User, id: string) {
  const [ins] = await db.select().from(schema.insights)
    .where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id)))
  if (!ins || ins.status !== 'pending') return ins
  // Recovery decisions need an explicit versioned choice in core/recovery.ts.
  if (ins.payload.recovery) return null
  // Goal drafts become goals only through the Goals form (core/goals.ts saveGoal), never by approval.
  if (ins.payload.goalDraft) return null
  for (const a of ins.payload.actions ?? []) await applyAction(user, a)
  if (ins.kind === 'plan') {
    await db.insert(schema.plans).values({ userId: user.id, goal: ins.title, insightId: ins.id })
  }
  const [row] = await db.update(schema.insights).set({ status: 'accepted' }).where(eq(schema.insights.id, id)).returning()
  return row
}

export async function dismissInsight(user: User, id: string) {
  const [ins] = await db.select({ payload: schema.insights.payload }).from(schema.insights)
    .where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id)))
  if (ins?.payload.recovery) return false
  await db.update(schema.insights).set({ status: 'dismissed' })
    .where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id)))
  return true
}

async function applyAction(user: User, a: ProposedAction) {
  if (a.type === 'tracker') {
    await ensureTracker(user.id, a.slug, { name: a.name, category: a.category, kind: a.kind, unit: a.unit, target: a.target, direction: a.direction })
    return
  }
  // Proposed rules may omit DTSTART; anchor them to today in local time.
  const rrule = a.rrule.includes('DTSTART')
    ? a.rrule
    : `DTSTART:${localDate(new Date(), user.timezone).replaceAll('-', '')}T000000\n${a.rrule.startsWith('RRULE:') ? a.rrule : `RRULE:${a.rrule}`}`
  await db.insert(schema.schedules).values({
    userId: user.id, name: a.name, kind: a.kind, category: a.category, rrule,
    target: a.target ?? null, unit: a.unit ?? null, meta: { source: 'insight' },
  })
}
