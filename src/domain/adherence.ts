import { addDays } from '@/core/time'

// Per-day adherence for a schedule. Pure: callers pass occurrences already bucketed by local day.

export type DayStatus = 'done' | 'partial' | 'skipped' | 'missed' | 'pending' | 'none'
export type CheckStatus = 'done' | 'skipped' | undefined

const GRACE_MS = 60 * 60_000 // same rule as dayAgenda: overdue one hour after the occurrence

export function dayStatus(occs: Date[], statusOf: (occ: Date) => CheckStatus, now: Date): DayStatus {
  if (!occs.length) return 'none'
  let done = 0, skipped = 0, missed = 0, pending = 0
  for (const o of occs) {
    const s = statusOf(o)
    if (s === 'done') done++
    else if (s === 'skipped') skipped++
    else if (o.getTime() + GRACE_MS < now.getTime()) missed++
    else pending++
  }
  if (done === occs.length) return 'done'
  if (pending && !missed) return done ? 'partial' : 'pending'
  if (skipped === occs.length) return 'skipped'
  if (done) return 'partial'
  if (skipped && !missed) return 'skipped'
  return 'missed'
}

/**
 * Consecutive fully-done scheduled days, counting back from today.
 * Days with nothing scheduled are ignored (weekly routines keep their streak);
 * today still pending does not break it.
 */
export function scheduleStreak(byDay: Map<string, DayStatus>, today: string, lookback = 365): number {
  let streak = 0
  for (let i = 0, d = today; i < lookback; i++, d = addDays(d, -1)) {
    const s = byDay.get(d) ?? 'none'
    if (s === 'none' || s === 'skipped' || ((s === 'pending' || s === 'partial') && d === today)) continue
    if (s !== 'done') break
    streak++
  }
  return streak
}

/** Share of due days that were fully done (skips excluded from both sides). */
export function adherenceRate(statuses: DayStatus[]): number | null {
  const due = statuses.filter((s) => s === 'done' || s === 'partial' || s === 'missed')
  if (!due.length) return null
  return due.filter((s) => s === 'done').length / due.length
}
