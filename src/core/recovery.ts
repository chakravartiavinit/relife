import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { basketLines } from './basket'
import { habitSignals } from '@/domain/basket'
import { coachStats, type CoachStat } from '@/domain/coach'
import {
  recoveryView, samePreview, smallerRecoveryPreview,
  type RecoveryChoice, type RecoveryPayload, type RecoveryView,
} from '@/domain/recovery'
import type { Signal } from '@/domain/patterns'
import { addDays, localDate } from './time'
import { loadSignals } from './patterns'
import type { User } from './user'

const Q = schema.systemQuests
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type CoachQuestRow = Omit<typeof Q.$inferInsert, 'userId'>
export type RecoveryResult =
  | { status: 'accepted' | 'already_chosen'; view: RecoveryView }
  | { status: 'stale' | 'unavailable'; view: RecoveryView }
  | { status: 'not_found' }
export type PreparedRecovery = RecoveryView & { created: boolean }

const key = (day: string) => `system:recovery:${day}`
const recoveryWhere = (userId: string, day: string) => and(
  eq(schema.insights.userId, userId),
  sql`${schema.insights.payload}->>'dedupeKey' = ${key(day)}`,
)

function payloadOf(payload: typeof schema.insights.$inferSelect.payload): RecoveryPayload | null {
  const r = payload.recovery
  return r && r.localDate && Number.isInteger(r.version) ? r : null
}

async function lockUser(tx: Tx, userId: string) {
  await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).for('update')
}

async function paused(tx: Tx, userId: string, today: string) {
  const [insight] = await tx.select({ payload: schema.insights.payload }).from(schema.insights).where(recoveryWhere(userId, today)).limit(1)
  return payloadOf(insight?.payload ?? {})?.localDate === today
}

function missedView(rows: (typeof Q.$inferSelect)[]) {
  return rows.map((q) => ({ id: q.id, title: q.title, progress: q.progress, target: q.target, unit: q.unit }))
}

function previewFor(rows: (typeof Q.$inferSelect)[], signals: Signal[], stats: CoachStat[], history: (typeof Q.$inferSelect)[], today: string, user: User) {
  return smallerRecoveryPreview({
    missed: rows.map((q) => ({ id: q.id, statId: q.statId, statName: q.statName, area: q.area, unit: q.unit, op: q.op, agg: q.agg, target: q.target, progress: q.progress })),
    signals, stats, history, today, focus: user.profile.improve ?? [],
  })
}

async function recentHistory(tx: Tx, userId: string, today: string) {
  return tx.select().from(Q).where(and(eq(Q.userId, userId), gte(Q.fromDate, addDays(today, -14)))).orderBy(desc(Q.fromDate)).limit(100)
}

async function storedMissedRows(tx: Tx, userId: string, payload: RecoveryPayload) {
  return payload.missedIds.length
    ? tx.select().from(Q).where(and(eq(Q.userId, userId), inArray(Q.id, payload.missedIds)))
    : []
}

async function recoveryRows(tx: Tx, userId: string, payload: RecoveryPayload, today: string) {
  if (payload.localDate !== today || !payload.missedIds.length) return []
  const rows = await storedMissedRows(tx, userId, payload)
  return rows.filter((q) => q.kind === 'daily' && q.status === 'failed' && q.toDate === addDays(today, -1) && q.progress != null)
}

async function insertLocked(tx: Tx, user: User, rows: CoachQuestRow[]) {
  if (!rows.length) return []
  const active = await tx.select({ statId: Q.statId, fromDate: Q.fromDate, toDate: Q.toDate }).from(Q)
    .where(and(eq(Q.userId, user.id), eq(Q.status, 'active')))
  const accepted: CoachQuestRow[] = []
  for (const row of rows) {
    const overlaps = (q: { fromDate: string; toDate: string }) => q.fromDate <= row.toDate && q.toDate >= row.fromDate
    if (active.some((q) => q.statId === row.statId && overlaps(q)) || accepted.some((q) => q.statId === row.statId && overlaps(q))) continue
    let full = false
    for (let day = row.fromDate; day <= row.toDate; day = addDays(day, 1)) {
      const count = active.filter((q) => q.fromDate <= day && q.toDate >= day).length
        + accepted.filter((q) => q.fromDate <= day && q.toDate >= day).length
      if (count >= 3) { full = true; break }
    }
    if (!full) accepted.push(row)
  }
  return accepted.length
    ? tx.insert(Q).values(accepted.map((row) => ({ ...row, userId: user.id }))).onConflictDoNothing().returning()
    : []
}

/** Normal daily/emergency insertion, rechecking the recovery pause while holding the user's row lock. */
export async function insertCoachQuests(user: User, today: string, rows: CoachQuestRow[]) {
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    if (await paused(tx, user.id, today)) return []
    return insertLocked(tx, user, rows)
  })
}

/** Create or refresh today's recovery decision. Only verified failed dailies can enter it. */
export async function prepareRecovery(user: User, now: Date, signals: Signal[], stats: CoachStat[]): Promise<PreparedRecovery | null> {
  const today = localDate(now, user.timezone), yesterday = addDays(today, -1)
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    await tx.update(Q).set({ status: 'cancelled', resolvedAt: now }).where(and(eq(Q.userId, user.id), eq(Q.kind, 'penalty'), eq(Q.status, 'active')))
    await tx.update(Q).set({ status: 'unverified', resolvedAt: now }).where(and(eq(Q.userId, user.id), eq(Q.status, 'failed'), sql`${Q.progress} is null`))
    await tx.update(schema.insights).set({ status: 'done' }).where(and(
      eq(schema.insights.userId, user.id), eq(schema.insights.status, 'pending'),
      sql`${schema.insights.payload}->'recovery'->>'localDate' < ${today}`,
    ))
    const missed = await tx.select().from(Q).where(and(eq(Q.userId, user.id), eq(Q.kind, 'daily'), eq(Q.status, 'failed'), eq(Q.toDate, yesterday), sql`${Q.progress} is not null`))
    const [existing] = await tx.select().from(schema.insights).where(recoveryWhere(user.id, today)).limit(1)
    if (!missed.length) return null
    const history = await recentHistory(tx, user.id, today)
    const preview = previewFor(missed, signals, stats, history, today, user)
    if (existing) {
      const payload = payloadOf(existing.payload)
      if (!payload) return null
      if (existing.status === 'pending' && (payload.missedIds.join(',') !== missed.map((q) => q.id).sort().join(',') || !samePreview(payload.preview, preview))) {
        const next: RecoveryPayload = { ...payload, missedIds: missed.map((q) => q.id).sort(), preview, version: payload.version + 1 }
        await tx.update(schema.insights).set({ payload: { ...existing.payload, recovery: next }, updatedAt: now }).where(eq(schema.insights.id, existing.id))
        return { ...recoveryView(existing.id, next, missedView(missed)), created: false }
      }
      return { ...recoveryView(existing.id, payload, missedView(missed)), created: false }
    }
    const payload: RecoveryPayload = { localDate: today, missedIds: missed.map((q) => q.id).sort(), version: 1, preview, choice: null, questId: null }
    const [insight] = await tx.insert(schema.insights).values({
      userId: user.id, kind: 'nudge', title: 'Choose what helps today',
      body: 'Yesterday had a missed quest. New quests are paused today while you choose a smaller step, rest, or update priorities.',
      payload: { dedupeKey: key(today), recovery: payload },
    }).returning()
    return { ...recoveryView(insight.id, payload, missedView(missed)), created: true }
  })
}

export async function getRecovery(user: User, now = new Date()): Promise<RecoveryView | null> {
  const today = localDate(now, user.timezone)
  const [insight] = await db.select().from(schema.insights).where(recoveryWhere(user.id, today)).limit(1)
  const payload = insight && payloadOf(insight.payload)
  if (!insight || !payload || payload.localDate !== today) return null
  const rows = payload.missedIds.length
    ? await db.select().from(Q).where(and(eq(Q.userId, user.id), inArray(Q.id, payload.missedIds)))
    : []
  return recoveryView(insight.id, payload, missedView(rows))
}

export async function recoveryPaused(user: User, nowOrToday: Date | string = new Date()) {
  const today = typeof nowOrToday === 'string' ? nowOrToday : localDate(nowOrToday, user.timezone)
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    return paused(tx, user.id, today)
  })
}

export async function chooseRecovery(user: User, input: { insightId: string; version: number; choice: RecoveryChoice }, now = new Date()): Promise<RecoveryResult> {
  const today = localDate(now, user.timezone)
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    const [insight] = await tx.select().from(schema.insights).where(and(eq(schema.insights.id, input.insightId), eq(schema.insights.userId, user.id))).for('update')
    const payload = insight && payloadOf(insight.payload)
    if (!insight || !payload) return { status: 'not_found' }
    const view = async (p: RecoveryPayload, rows?: (typeof Q.$inferSelect)[]) =>
      recoveryView(insight.id, p, missedView(rows ?? await storedMissedRows(tx, user.id, p)))
    if (payload.localDate !== today) return { status: 'stale', view: await view(payload) }
    if (payload.choice) return { status: 'already_chosen', view: await view(payload) }
    if (insight.status !== 'pending') return { status: 'stale', view: await view(payload) }
    if (input.version !== payload.version) return { status: 'stale', view: await view(payload) }
    if (input.choice !== 'smaller') {
      const next = { ...payload, choice: input.choice }
      await tx.update(schema.insights).set({ status: 'done', payload: { ...insight.payload, recovery: next }, updatedAt: now }).where(eq(schema.insights.id, insight.id))
      return { status: 'accepted', view: await view(next) }
    }
    const rows = await recoveryRows(tx, user.id, payload, today)
    if (!rows.length) return { status: 'stale', view: await view(payload, rows) }
    const { signals: base } = await loadSignals(user, now)
    const habits = habitSignals(await basketLines(user, addDays(today, -89), today), today, user.baseCurrency)
    const signals = [...base, ...habits]
    const stats = coachStats([...base, ...habits.filter((h) => h.offer)], today)
    const history = await recentHistory(tx, user.id, today)
    const preview = previewFor(rows, signals, stats, history, today, user)
    if (!samePreview(payload.preview, preview)) {
      const next = { ...payload, preview, version: payload.version + 1 }
      await tx.update(schema.insights).set({ payload: { ...insight.payload, recovery: next }, updatedAt: now }).where(eq(schema.insights.id, insight.id))
      return { status: 'stale', view: await view(next, rows) }
    }
    if (!preview) return { status: 'unavailable', view: await view(payload, rows) }
    const [quest] = await insertLocked(tx, user, [{
      kind: 'recovery', fromDate: preview.fromDate, toDate: preview.toDate, statId: preview.statId, statName: preview.metric,
      area: preview.area, unit: preview.unit, op: preview.op, agg: preview.aggregation, target: preview.target,
      baseline: preview.baseline, rank: preview.rank, xp: preview.xp, title: preview.title,
      reason: 'An optional smaller step after a missed daily quest.', parentId: preview.parentId, ref: `recovery:${insight.id}`,
    }])
    if (!quest) return { status: 'unavailable', view: await view(payload, rows) }
    const next = { ...payload, choice: 'smaller' as const, questId: quest.id }
    await tx.update(schema.insights).set({ status: 'accepted', payload: { ...insight.payload, recovery: next }, updatedAt: now }).where(eq(schema.insights.id, insight.id))
    return { status: 'accepted', view: await view(next, rows) }
  })
}
