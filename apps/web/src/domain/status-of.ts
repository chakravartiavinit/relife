import type { Pace } from './day-plan'
import type { TileSummary } from './metric-tile'
import { tone, type Change } from './patterns'

// The six status words every calm screen uses, and the one table that maps the app's existing rules to them:
// `goalPace` (Plan, Today), `summarizeTracker` (area trackers), `findChanges` (this week against usual) and
// `monthPace` (Wealth). Pure: a status is never new maths, only a name for what a rule already found.

export const STATUSES = ['Ahead', 'On track', 'Steady', 'Slipping', 'Behind', 'Quiet'] as const
export type Status = (typeof STATUSES)[number]
/** The ink a status word is drawn in: `--good-ink`, `--warn-ink`, `--bad-ink`, `--ink-2`, `--ink-3` (a hollow dot). */
export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral' | 'quiet'

export const STATUS_TONE: Record<Status, StatusTone> = {
  Ahead: 'good', 'On track': 'good', Steady: 'neutral', Slipping: 'warn', Behind: 'bad', Quiet: 'quiet',
}

/** A change this big (relative) is worth a word other than Steady: the same 10% `findChanges` uses. */
export const STEADY_BAND = 0.1

export type StatusSource =
  /** `goalPace` output. Reached and Ahead are Ahead; On pace is On track; Too early has nothing to say yet: Quiet. */
  | { from: 'goal'; pace: Pick<Pace, 'label'> }
  /** `summarizeTracker` output. No recent data is Quiet; a week better or worse than usual (10% or more) is Ahead or
   *  Slipping, where the tracker has a direction (a target or a 1-5 scale); anything else is Steady. */
  | { from: 'tracker'; tile: Pick<TileSummary, 'state' | 'delta'> }
  /** `findChanges` output: the signal's direction decides if the move is Ahead or Slipping; a signal with no better
   *  direction (spending, steps either way) is Steady. */
  | { from: 'change'; change: Pick<Change, 'signal' | 'pct'> }
  /** `monthPace().vsUsual`: this month's projection against a usual month. 10% under or more is Ahead, within 10% On
   *  track, up to 25% over Slipping, beyond that Behind; with no usual month there is nothing to compare: Quiet. */
  | { from: 'month'; vsUsual: number | null }
  /** A tracker's average (or latest) against its own target, `direction` saying which side is good. At or past the target
   *  is On track; within 10% of it Steady; within 25% Slipping; further off Behind. */
  | { from: 'target'; value: number; target: number; direction: 'up' | 'down' }

const GOAL: Record<Pace['label'], Status> = { Reached: 'Ahead', Ahead: 'Ahead', 'On pace': 'On track', Behind: 'Behind', 'Too early': 'Quiet' }

export function statusOf(s: StatusSource): { word: Status; tone: StatusTone } {
  const word = ((): Status => {
    switch (s.from) {
      case 'goal': return GOAL[s.pace.label]
      case 'tracker': {
        if (s.tile.state !== 'active') return 'Quiet'
        const d = s.tile.delta
        if (!d || Math.abs(d.pct) < STEADY_BAND || d.tone === 'neutral') return 'Steady'
        return d.tone === 'good' ? 'Ahead' : 'Slipping'
      }
      case 'change': {
        const t = tone(s.change.signal, s.change.pct)
        return t === 'good' ? 'Ahead' : t === 'bad' ? 'Slipping' : 'Steady'
      }
      case 'target': {
        if (!s.target) return 'Steady'
        const r = s.direction === 'down' ? (s.value ? s.target / s.value : 1) : s.value / s.target
        return r >= 1 ? 'On track' : r >= 0.9 ? 'Steady' : r >= 0.75 ? 'Slipping' : 'Behind'
      }
      case 'month': {
        const v = s.vsUsual
        if (v == null) return 'Quiet'
        return v <= -STEADY_BAND ? 'Ahead' : v <= STEADY_BAND ? 'On track' : v <= 0.25 ? 'Slipping' : 'Behind'
      }
    }
  })()
  return { word, tone: STATUS_TONE[word] }
}
