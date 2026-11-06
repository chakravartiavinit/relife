import { addDays } from '@/core/time'

/**
 * Current and best streak of consecutive local dates.
 * The current streak survives "today not done yet": it counts back from yesterday if today is missing.
 */
export function streaks(doneDates: Iterable<string>, today: string): { current: number; best: number } {
  const set = new Set(doneDates)
  let current = 0
  let day = set.has(today) ? today : addDays(today, -1)
  while (set.has(day)) { current++; day = addDays(day, -1) }

  const sorted = [...set].sort()
  let best = 0
  let run = 0
  let prev: string | undefined
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return { current, best }
}
