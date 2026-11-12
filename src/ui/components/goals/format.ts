import { formatDay } from '@/core/time'
import { targetText, type GoalSnapshot, type OutcomeStatus } from '@/domain/goals'
import { formatValue } from '@/domain/patterns'
import type { Category } from '@/db/schema'

// Display helpers shared by the outcome goal components. Pure and client-safe.

/** The data a goal component needs. Matches core/goals GoalView without importing server code. */
export type GoalViewData = {
  id: string; title: string; reason: string; area: Category; status: 'active' | 'paused' | 'finished'
  measureKind: 'tracker' | 'check_in'; trackerId: string | null; measureName: string; unit: string | null
  direction: 'increase' | 'decrease' | 'range'; target: number | null; rangeLow: number | null; rangeHigh: number | null
  baselineValue: number; baselineDate: string; baselineHow: string; baselineObservations: number | null
  targetDate: string; cadence: 'weekly' | 'fortnightly' | 'monthly'; nextReviewOn: string
  actions: { kind: 'schedule' | 'tracker'; id: string }[]
  version: number; pausedAt: Date | string | null; finishedAt: Date | string | null
  snapshot: GoalSnapshot | null; sensitive: boolean; actionNames: string[]; trackerArchived: boolean
  /** Local days in the user's time zone. */
  startedOn: string; pausedOn: string | null; finishedOn: string | null
}

export const STATUS_LABEL: Record<OutcomeStatus, string> = {
  met: 'Target reached', toward: 'Toward target', flat: 'No change yet', away: 'Moving away', not_enough_data: 'Not enough data',
}

/** Badge colour. Sensitive measures stay neutral whatever the direction. */
export function statusColor(status: OutcomeStatus, sensitive: boolean) {
  if (sensitive || status === 'flat' || status === 'not_enough_data') return undefined
  return status === 'met' ? 'var(--good)' : status === 'toward' ? 'var(--pill)' : 'var(--warn)'
}

export const day = (d: string) => formatDay(d, { day: 'numeric', month: 'short' })
export const dayYear = (d: string) => formatDay(d, { day: 'numeric', month: 'short', year: 'numeric' })
export const weekday = (d: string) => formatDay(d, { weekday: 'short', day: 'numeric', month: 'short' })

export const value = formatValue
export const target = targetText
export const CADENCE_LABEL = { weekly: 'Weekly', fortnightly: 'Every 2 weeks', monthly: 'Every 4 weeks' } as const
export const directionLabel = (d: GoalViewData['direction']) => ({ increase: 'Increase', decrease: 'Decrease', range: 'Stay in range' })[d]

export function measureLine(g: GoalViewData) {
  return `${g.measureKind === 'tracker' ? `${g.measureName} tracker` : `Check-in · ${g.measureName}${g.unit ? ` in ${g.unit}` : ''}`} · by ${dayYear(g.targetDate)}`
}

/** "+0.6 h since baseline" and "0.2 h to the range", or null when there is no current value. */
export function movement(g: GoalViewData) {
  const cur = g.snapshot?.outcome.current
  if (cur == null) return null
  const diff = cur - g.baselineValue
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±'
  const since = `${sign}${value(Math.abs(diff), g.unit)} since baseline`
  let left: string
  if (g.direction === 'range') {
    const low = g.rangeLow ?? cur, high = g.rangeHigh ?? cur
    const gap = cur < low ? low - cur : cur > high ? cur - high : 0
    left = gap ? `${value(gap, g.unit)} to the range` : 'In range'
  } else {
    const gap = g.direction === 'increase' ? (g.target ?? cur) - cur : cur - (g.target ?? cur)
    left = gap > 0 ? `${value(gap, g.unit)} to go` : 'Target reached'
  }
  return { since, left }
}

/** 0–1 fill for the progress capsule. Unknown is empty, never negative. */
export const fill = (s: GoalSnapshot | null) => Math.max(0, Math.min(1, s?.outcome.progressShare ?? 0))

export function coverageLine(g: GoalViewData) {
  const o = g.snapshot?.outcome
  if (!o) return null
  const word = g.measureKind === 'check_in' ? 'check-in' : 'day'
  if (o.status === 'not_enough_data') {
    if (g.measureKind === 'check_in') return o.observations ? `${o.observations} check-in this period` : 'No check-in this period yet'
    return `${o.observations} ${word}${o.observations === 1 ? '' : 's'} recorded, ${o.needed} needed for a status`
  }
  return g.measureKind === 'check_in' ? `Latest check-in ${day(o.latestCheckIn!.localDate)}` : `${o.observations} of ${g.snapshot!.window.days} days recorded`
}
