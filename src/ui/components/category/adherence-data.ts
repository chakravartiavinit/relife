import { and, between, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { Category } from '@/db/schema'
import type { Schedule, ScheduleMeta } from '@/core/schedules'
import { trackerDays } from '@/core/metrics'
import { addDays, localDate, localDayRange } from '@/core/time'
import type { User } from '@/core/user'
import { occurrencesBetween, parseSimple } from '@/domain/recurrence'
import { adherenceRate, dayStatus, scheduleStreak, type DayStatus } from '@/domain/adherence'

export type ScheduleAdherence = {
  schedule: Schedule
  days: { date: string; status: DayStatus }[] // last `stripDays`, oldest first
  streak: number
  rate: number | null // over the full window
  refillSoon: boolean
  dosesPerDay: number
}

/** Adherence for many schedules in two queries (checks + goal trackers), no N+1. */
export async function loadAdherence(
  user: User,
  opts: { category?: Category; kinds?: Schedule['kind'][]; includeInactive?: boolean } = {},
  windowDays = 60,
  stripDays = 14,
  now = new Date(),
): Promise<ScheduleAdherence[]> {
  const list = await db.select().from(schema.schedules).where(and(
    eq(schema.schedules.userId, user.id),
    opts.includeInactive ? undefined : eq(schema.schedules.active, true),
    opts.category ? eq(schema.schedules.category, opts.category) : undefined,
    opts.kinds ? inArray(schema.schedules.kind, opts.kinds) : undefined,
  )).orderBy(schema.schedules.name)
  if (!list.length) return []

  const today = localDate(now, user.timezone)
  const from = addDays(today, -(windowDays - 1))
  const [start] = localDayRange(from, user.timezone)
  const [, end] = localDayRange(today, user.timezone)

  const checks = await db.select().from(schema.checks).where(and(
    inArray(schema.checks.scheduleId, list.map((s) => s.id)),
    between(schema.checks.occurrence, start, end),
  ))
  const checkOf = new Map(checks.map((c) => [`${c.scheduleId}|${c.occurrence.getTime()}`, c.status]))

  // Quantity routines are "done" when the linked tracker reaches the target that day.
  const goalSlugs = list.map((s) => (s.meta as ScheduleMeta).trackerSlug).filter((x): x is string => !!x)
  const goalDays = goalSlugs.length ? await trackerDays(user, from, today, { slugs: goalSlugs }) : []

  const days: string[] = []
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d)

  return list.map((s) => {
    const meta = s.meta as ScheduleMeta
    const byDay = new Map<string, Date[]>()
    for (const o of occurrencesBetween(s.rrule, start, new Date(end.getTime() - 1), user.timezone)) {
      const d = localDate(o, user.timezone)
      byDay.set(d, [...(byDay.get(d) ?? []), o])
    }
    const goal = meta.trackerSlug && s.target ? goalDays.find((t) => t.tracker.slug === meta.trackerSlug) : undefined
    const statuses = new Map<string, DayStatus>()
    for (const d of days) {
      const occs = byDay.get(d) ?? []
      if (goal && occs.length) {
        const v = goal.days.get(d) ?? 0
        statuses.set(d, v >= s.target! ? 'done' : d === today ? (v > 0 ? 'partial' : 'pending') : v > 0 ? 'partial' : 'missed')
      } else {
        statuses.set(d, dayStatus(occs, (o) => checkOf.get(`${s.id}|${o.getTime()}`), now))
      }
    }
    let dosesPerDay = 1
    try {
      const simple = parseSimple(s.rrule)
      dosesPerDay = simple.freq === 'daily' ? simple.times.length / (simple.interval ?? 1) : simple.times.length / 7
    } catch { /* keep 1 */ }
    const refillAt = meta.refillAt ?? Math.ceil(dosesPerDay * (meta.doseCount ?? 1) * 5)
    return {
      schedule: s,
      days: days.slice(-stripDays).map((date) => ({ date, status: statuses.get(date)! })),
      streak: scheduleStreak(statuses, today, windowDays),
      rate: adherenceRate([...statuses.entries()].filter(([d]) => d < today || statuses.get(d) === 'done').map(([, v]) => v)),
      refillSoon: s.kind === 'medicine' && typeof meta.stock === 'number' && meta.stock <= refillAt,
      dosesPerDay,
    }
  })
}
