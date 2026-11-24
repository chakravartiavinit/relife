import type { Signal } from './patterns'
import { statusOf, STEADY_BAND, type Status } from './status-of'

// The status words of Time's rows. Pure. A day in progress is only ever compared up: it is not Slipping at nine in the morning.

const sig = (direction: Signal['direction']): Signal => ({ id: '', name: '', area: 'time', group: '', direction, days: new Map() })

/** Today against a usual day, with the 10% band of `findChanges`, named by `statusOf`. Nothing yet today is Quiet. */
export function againstUsual(direction: Signal['direction'], today: number, usual: number): Status {
  if (!today) return 'Quiet'
  const pct = usual ? (today - usual) / usual : 0
  const { word } = statusOf({ from: 'change', change: { signal: sig(direction), pct: Math.abs(pct) < STEADY_BAND ? 0 : pct } })
  return word === 'Slipping' ? 'Steady' : word
}

/** Distraction against its daily cap: under is On track, up to a quarter over Slipping, beyond that Behind. */
export const againstCap = (today: number, cap: number): Status => (!today ? 'Quiet' : today <= cap ? 'On track' : today <= cap * 1.25 ? 'Slipping' : 'Behind')
