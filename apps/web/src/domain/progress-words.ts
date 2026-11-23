import { STEADY_BAND, type Status } from './status-of'

// Plain words for Progress: where a rate is heading, and how long a gap takes at the usual pace. Pure.

/**
 * A rate now against the rate before it, as a status word: 10% or more above is Ahead, 10% or more below is Slipping,
 * anything between Steady. Nothing in either period is Quiet.
 */
export function trendWord(now: number, before: number): Status {
  if (!now && !before) return 'Quiet'
  if (!before) return 'Ahead'
  const pct = (now - before) / before
  return pct >= STEADY_BAND ? 'Ahead' : pct <= -STEADY_BAND ? 'Slipping' : 'Steady'
}

/**
 * How long `toGo` takes at `perDay`: "about a day", "about 5 days", "about 3 weeks", "about 4 months". Null when there is
 * no pace to go by.
 */
export function paceWords(toGo: number, perDay: number): string | null {
  if (!(perDay > 0) || toGo < 0) return null
  const days = Math.max(1, Math.ceil(toGo / perDay))
  if (days === 1) return 'about a day'
  if (days < 14) return `about ${days} days`
  if (days < 60) return `about ${Math.round(days / 7)} weeks`
  return `about ${Math.round(days / 30)} months`
}

/** When the next level lands, in a word for the right-hand side of a row: "Tomorrow", "In 5 days", "In 3 weeks". */
export function paceWhen(toGo: number, perDay: number): string | null {
  const w = paceWords(toGo, perDay)
  if (!w) return null
  if (w === 'about a day') return 'Tomorrow'
  return `In ${w.slice('about '.length)}`
}
