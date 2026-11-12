import { and, between, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import { describe, nextOccurrence, occurrencesBetween } from '@/domain/recurrence'
import { persist } from './ingest'
import { localDate, localDayRange } from './time'
import type { User } from './user'

export type Schedule = typeof schema.schedules.$inferSelect
export type ScheduleMeta = {
  dose?: string // "1 tablet", "5 ml"
  doseCount?: number // units removed from stock per dose (default 1)
  stock?: number
  refillAt?: number // alert when stock <= this (default: 5 days of doses)
  trackerSlug?: string // quantity routines (water) log progress into this tracker
  step?: number // quick-add amount for quantity routines (e.g. 250 ml)
  plan?: string
  url?: string
  paymentMethod?: string
  notes?: string
}

export type AgendaItem = {
  schedule: Schedule
  occurrence: Date
  status: 'done' | 'skipped' | 'pending' | 'missed'
  value: number | null
}

/** Every occurrence of every active schedule on a local day, with its check status. */
export async function dayAgenda(user: User, day: string, now = new Date()): Promise<AgendaItem[]> {
  const [start, end] = localDayRange(day, user.timezone)
  const list = await db.select().from(schema.schedules)
    .where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true)))
  const items: AgendaItem[] = []
  for (const s of list) {
    // Subscriptions/bills/renewals show up on their due date like anything else.
    for (const occ of occurrencesBetween(s.rrule, start, new Date(end.getTime() - 1), user.timezone)) {
      items.push({ schedule: s, occurrence: occ, status: 'pending', value: null })
    }
  }
  if (items.length) {
    const ids = [...new Set(items.map((i) => i.schedule.id))]
    const done = await db.select().from(schema.checks)
      .where(and(inArray(schema.checks.scheduleId, ids), between(schema.checks.occurrence, start, end)))
    const byKey = new Map(done.map((c) => [`${c.scheduleId}|${c.occurrence.getTime()}`, c]))
    for (const i of items) {
      const c = byKey.get(`${i.schedule.id}|${i.occurrence.getTime()}`)
      if (c) { i.status = c.status; i.value = c.value }
      else if (i.occurrence.getTime() + 60 * 60_000 < now.getTime() && i.schedule.kind !== 'subscription') i.status = 'missed'
    }
  }
  return items.sort((a, b) => a.occurrence.getTime() - b.occurrence.getTime())
}

/**
 * Mark an occurrence done/skipped, or clear it (status = null).
 * Medicines adjust stock; quantity routines add `value` to their tracker.
 */
export async function setCheck(
  user: User, scheduleId: string, occurrence: Date, status: 'done' | 'skipped' | null, value?: number,
) {
  const [s] = await db.select().from(schema.schedules)
    .where(and(eq(schema.schedules.id, scheduleId), eq(schema.schedules.userId, user.id)))
  if (!s) throw new Error('Schedule not found')
  const meta = s.meta as ScheduleMeta
  const [prev] = await db.select().from(schema.checks)
    .where(and(eq(schema.checks.scheduleId, scheduleId), eq(schema.checks.occurrence, occurrence)))

  if (status === null) {
    if (prev) await db.delete(schema.checks).where(eq(schema.checks.id, prev.id))
  } else {
    await db.insert(schema.checks).values({
      scheduleId, occurrence, localDate: localDate(occurrence, user.timezone), status, value: value ?? null,
    }).onConflictDoUpdate({
      target: [schema.checks.scheduleId, schema.checks.occurrence],
      set: { status, value: value ?? null, at: new Date() },
    })
  }

  // Medicine stock follows "done" transitions only.
  const wasDone = prev?.status === 'done'
  const isDone = status === 'done'
  if (s.kind === 'medicine' && typeof meta.stock === 'number' && wasDone !== isDone) {
    const delta = (meta.doseCount ?? 1) * (isDone ? -1 : 1)
    await db.update(schema.schedules)
      .set({ meta: { ...meta, stock: Math.max(0, meta.stock + delta) } })
      .where(eq(schema.schedules.id, s.id))
  }

  if (meta.trackerSlug && value && isDone) {
    await persist(user, {
      kind: 'entry', tracker: meta.trackerSlug, date: localDate(occurrence, user.timezone),
      value, source: 'manual', mode: 'add',
      defaults: { name: s.name, category: s.category, unit: s.unit ?? undefined, target: s.target ?? undefined },
    })
  }
}

export type DueItem = { schedule: Schedule; due: Date; daysLeft: number; amount: number | null; currency: string | null }

/** Next due date for subscriptions, bills and renewals. */
export async function upcomingPayments(user: User, now = new Date()): Promise<DueItem[]> {
  const list = await db.select().from(schema.schedules)
    .where(and(
      eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true),
      inArray(schema.schedules.kind, ['subscription', 'bill', 'renewal']),
    ))
  const today = localDate(now, user.timezone)
  const [todayStart] = localDayRange(today, user.timezone)
  return list
    .map((s) => {
      const due = nextOccurrence(s.rrule, new Date(todayStart.getTime() - 1), user.timezone)
      if (!due) return null
      const daysLeft = Math.round((Date.parse(`${localDate(due, user.timezone)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
      return { schedule: s, due, daysLeft, amount: s.amount, currency: s.currency }
    })
    .filter((x): x is DueItem => !!x)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
}

/** Monthly-equivalent cost of a recurring payment, from its rule. */
export function monthlyCost(s: Schedule): number {
  if (!s.amount) return 0
  const r = s.rrule
  const interval = Number(/INTERVAL=(\d+)/.exec(r)?.[1] ?? 1)
  if (r.includes('FREQ=YEARLY')) return s.amount / (12 * interval)
  if (r.includes('FREQ=MONTHLY')) return s.amount / interval
  if (r.includes('FREQ=WEEKLY')) return (s.amount * 52) / 12 / interval
  if (r.includes('FREQ=DAILY')) return (s.amount * 365) / 12 / interval
  return s.amount
}

export { describe as describeRule }

/** Quantity routines (water): add progress to the linked tracker for today. */
export async function addGoalProgress(user: User, scheduleId: string, amount: number, now = new Date()) {
  const [s] = await db.select().from(schema.schedules)
    .where(and(eq(schema.schedules.id, scheduleId), eq(schema.schedules.userId, user.id)))
  const slug = (s?.meta as ScheduleMeta | undefined)?.trackerSlug
  if (!s || !slug) throw new Error('Not a quantity routine')
  await persist(user, {
    kind: 'entry', tracker: slug, date: localDate(now, user.timezone), value: amount, source: 'manual', mode: 'add',
    defaults: { name: s.name, category: s.category, unit: s.unit ?? undefined, target: s.target ?? undefined },
  })
}
