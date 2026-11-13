import { and, eq, gte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { ProposedAction } from '@/db/schema'
import type { Tx } from './recovery'
import { localDate } from './time'
import { RESTORE_MINUTES } from '@/domain/needs-you'
import { validateRRule } from '@/domain/recurrence'
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

/**
 * Approve: apply proposed actions (create schedules / trackers) and mark accepted, in one transaction. The insight is
 * claimed first (pending → accepted, one winner), so a double tap or a second device cannot add everything twice.
 * Returns null when it cannot be approved here: a recovery or goal draft, or a proposal whose rule is not valid.
 */
export async function acceptInsight(user: User, id: string) {
  const [ins] = await db.select().from(schema.insights)
    .where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id)))
  if (!ins || ins.status !== 'pending') return ins
  // Recovery decisions need an explicit versioned choice in core/recovery.ts.
  if (ins.payload.recovery) return null
  // Goal drafts become goals only through the Goals form (core/goals.ts saveGoal), never by approval.
  if (ins.payload.goalDraft) return null
  // Proposed rules may omit DTSTART; anchor them to today in local time. A rule that does not validate is refused whole.
  const today = localDate(new Date(), user.timezone)
  const actions = ins.payload.actions ?? []
  const rules = actions.map((a) => (a.type === 'schedule' ? validateRRule(a.rrule, today) : ''))
  if (rules.includes(null)) return null
  return db.transaction(async (tx) => {
    const [row] = await tx.update(schema.insights).set({ status: 'accepted' })
      .where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id), eq(schema.insights.status, 'pending'))).returning()
    if (!row) { // someone else decided first
      const [now] = await tx.select().from(schema.insights).where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id)))
      return now
    }
    for (const [i, a] of actions.entries()) await applyAction(tx, user, a, rules[i]!)
    if (ins.kind === 'plan') {
      await tx.insert(schema.plans).values({ userId: user.id, goal: ins.title, insightId: ins.id })
    }
    return row
  })
}

export async function dismissInsight(user: User, id: string) {
  const [ins] = await db.select({ payload: schema.insights.payload }).from(schema.insights)
    .where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id)))
  if (ins?.payload.recovery) return false
  await db.update(schema.insights).set({ status: 'dismissed' })
    .where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id)))
  return true
}

/** Undo a dismiss: back to pending, only while it is recent. Recovery choices were never dismissable, so they stay out. */
export async function restoreInsight(user: User, id: string, now = new Date()) {
  const since = new Date(now.getTime() - RESTORE_MINUTES * 60_000)
  const rows = await db.update(schema.insights).set({ status: 'pending' })
    .where(and(
      eq(schema.insights.id, id), eq(schema.insights.userId, user.id), eq(schema.insights.status, 'dismissed'),
      gte(schema.insights.updatedAt, since), sql`not (${schema.insights.payload} ? 'recovery')`,
    )).returning({ id: schema.insights.id })
  return rows.length > 0
}

async function applyAction(tx: Tx, user: User, a: ProposedAction, rrule: string) {
  if (a.type === 'tracker') {
    // Like ensureTracker: an existing tracker with this slug is kept as it is.
    await tx.insert(schema.trackers).values({
      userId: user.id, slug: a.slug, name: a.name, category: a.category, kind: a.kind,
      unit: a.unit, target: a.target, direction: a.direction ?? 'up', aggregate: 'sum',
    }).onConflictDoNothing()
    return
  }
  await tx.insert(schema.schedules).values({
    userId: user.id, name: a.name, kind: a.kind, category: a.category, rrule,
    target: a.target ?? null, unit: a.unit ?? null, meta: { source: 'insight' },
  })
}
