// Some services only give a lifetime total, like Duolingo XP. Each sync adds the gain since the last one
// to a day; the cursor keeps the last total and the last few days, so a late gain can still go to the
// day it happened on (the caller picks the day).

export type TotalCursor = { last: number; days: Record<string, number> }

const KEEP = 3

/**
 * Adds the gain since the last sync to `day` and makes sure `today` has a value (0 when nothing happened).
 * Returns null days on the very first sync: what happened before is unknown, so nothing is recorded rather
 * than a false zero. A total that goes down (a reset) restarts from the new total instead of going negative.
 */
export function addGain(prev: TotalCursor | null | undefined, total: number, day: string, today: string): TotalCursor & { known: boolean } {
  if (!prev || !Number.isFinite(prev.last) || !prev.days) return { last: total, days: {}, known: false }
  const days = { ...prev.days }
  const gain = Math.max(0, total - prev.last)
  if (gain) days[day] = (days[day] ?? 0) + gain
  days[today] ??= 0
  // Only the last few days can still change.
  const kept = Object.fromEntries(Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).slice(0, KEEP))
  return { last: total, days: kept, known: true }
}
