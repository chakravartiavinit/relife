import { formatDay } from '@/core/time'
import { targetText, type ActionSnapshot, type GoalSnapshot, type OutcomeStatus } from '@/domain/goals'
import { formatValue } from '@/domain/patterns'
import type { Category } from '@/db/schema'
import { goalPace, type Pace } from '@/domain/day-plan'
import type { SentencePart } from '@/domain/connection-view'
import type { PeekRef } from '@/domain/peek'
import type { PictureRef } from '@/ui/picture'

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

/** The goal's picture: its tracker's. A check-in goal ("Play Blackbird") borrows the picture of its first linked tracker (Guitar). */
export function goalPicture(g: Pick<GoalViewData, 'measureKind' | 'measureName' | 'area' | 'actions' | 'actionNames'>): PictureRef {
  const linked = g.measureKind === 'check_in' ? g.actions.findIndex((a) => a.kind === 'tracker') : -1
  return { of: 'tracker', name: linked >= 0 ? g.actionNames[linked] : g.measureName, area: g.area }
}

/** What the board adds to a goal, worked out on the server (the signals behind a change hold Maps that cannot cross to the client). */
export type GoalFeed = {
  /** The Peek of each linked action, in order: a routine's, or its tracker's metric. Null when it has none. */
  peeks: (PeekRef | null)[]
  /** This week's change in one of the goal's trackers, when `findChanges` has one: `connectionView` parts and caption. */
  change?: { parts: SentencePart[]; caption: string; peek: PeekRef | null }
}

/** One linked action as a row line: "Routine · done on 6 of 6 due days", "Tracker · recorded on 6 of 7 days, target met on 4". */
export function feedRowLine(a: ActionSnapshot) {
  if (!a.available) return 'No longer available'
  if (a.kind === 'schedule') return a.due ? `Routine · done on ${a.done} of ${a.due} due days` : 'Routine · nothing due in this window'
  return a.recordedDays ? `Tracker · recorded on ${a.recordedDays} of ${a.windowDays} days${a.metDays != null ? `, target met on ${a.metDays}` : ''}` : 'Tracker · no record in this window'
}

/** "65 wpm over the last 7 days, up from 60. 5 to go by 21 Feb." as a bold figure and the rest, or null with no current value. */
export function goalLine(g: GoalViewData): { figure: string; rest: string } | null {
  const cur = g.snapshot?.outcome.current
  const move = movement(g)
  if (cur == null || !move) return null
  const when = g.measureKind === 'tracker' ? `over the last ${g.snapshot!.window.days} days` : `at the ${day(g.snapshot!.outcome.latestCheckIn!.localDate)} check-in`
  const from = cur > g.baselineValue ? 'up from' : cur < g.baselineValue ? 'down from' : 'the same as'
  const reached = move.left === 'Target reached' || move.left === 'In range'
  return { figure: value(cur, g.unit), rest: ` ${when}, ${from} ${value(g.baselineValue, g.unit)}. ${move.left}${reached ? '.' : ` by ${day(g.targetDate)}.`}` }
}

/** Pace against the date for an active goal; null while it has no snapshot. */
export const paceOf = (g: GoalViewData, today: string): Pace | null =>
  g.snapshot ? goalPace({ share: g.snapshot.outcome.progressShare ?? null, met: !!g.snapshot.met, startedOn: g.startedOn, targetDate: g.targetDate }, today) : null

/** The Peek of each linked action: a routine's own, or its tracker's metric (`trackers` maps a tracker id to its slug). Null when there is none. */
export const actionPeeks = (g: Pick<GoalViewData, 'actions'>, trackers: { id: string; slug: string }[]): (PeekRef | null)[] =>
  g.actions.map((a) => {
    if (a.kind === 'schedule') return { type: 'routine', id: a.id }
    const slug = trackers.find((t) => t.id === a.id)?.slug
    return slug ? { type: 'metric', id: slug } : null
  })
