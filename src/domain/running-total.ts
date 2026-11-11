// Some services only give a lifetime total (Duolingo XP, Steam playtime, LeetCode problems solved).
// Today's amount is the total now minus the total when today started; the cursor remembers both.

export type TotalCursor = { day: string; base: number; last: number }

/**
 * Today's amount from a running total. Returns null on the very first sync: what happened earlier
 * today is unknown, so nothing is recorded rather than a false zero. A total that goes down (a refund,
 * a hidden game) restarts the count from the new total instead of going negative.
 */
export function todayFromTotal(prev: TotalCursor | null | undefined, total: number, today: string): { value: number | null; cursor: TotalCursor } {
  if (!prev || !Number.isFinite(prev.last)) return { value: null, cursor: { day: today, base: total, last: total } }
  // A new day starts from the last total seen yesterday.
  const start = prev.day === today ? prev.base : prev.last
  const base = total < start ? total : start
  return { value: total - base, cursor: { day: today, base, last: total } }
}
