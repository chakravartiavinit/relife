import { shiftMonth } from './wealth'

// Each spending category this month against the same days of the last few months: the number behind a status word on
// a category row. Pure: the caller passes the spending rows (`base` is negative for money out, as in `transactionsBetween`).

export type CategoryPace = {
  category: string
  /** Spent in `month` up to and including `throughDay`. */
  now: number
  /** The average of the prior months over the same days; null with fewer than two of them to compare. */
  usual: number | null
  /** `(now - usual) / usual`, 0.25 meaning a quarter more; null with no usual or a usual of zero. */
  vsUsual: number | null
}

/**
 * Per category, largest this month first. A prior month counts when it has any spending in its first `throughDay`
 * days (a new install with two months of history compares with two, not three); a category with no spending in a
 * prior month contributes zero to its average.
 */
export function categoryPace(spend: { localDate: string; category: string | null; base: number }[], month: string, throughDay: number, { months = 3, fallback = 'Other' } = {}): CategoryPace[] {
  const prior = new Set(Array.from({ length: months }, (_, i) => shiftMonth(month, -(i + 1))))
  const now = new Map<string, number>(), before = new Map<string, number>(), seen = new Set<string>()
  for (const t of spend) {
    if (Number(t.localDate.slice(8)) > throughDay) continue
    const m = t.localDate.slice(0, 7), c = t.category ?? fallback, v = -t.base
    if (m === month) now.set(c, (now.get(c) ?? 0) + v)
    else if (prior.has(m)) { before.set(c, (before.get(c) ?? 0) + v); seen.add(m) }
  }
  return [...now]
    .map(([category, value]) => {
      const usual = seen.size >= 2 ? (before.get(category) ?? 0) / seen.size : null
      return { category, now: value, usual, vsUsual: usual ? (value - usual) / usual : null }
    })
    .sort((a, b) => b.now - a.now)
}

/** The whole month the same way: spent up to `throughDay` against the average of the prior months over the same days. */
export function totalPace(spend: { localDate: string; base: number }[], month: string, throughDay: number, months = 3): { now: number; usual: number | null; vsUsual: number | null } {
  const prior = new Set(Array.from({ length: months }, (_, i) => shiftMonth(month, -(i + 1))))
  const by = new Map<string, number>()
  let now = 0
  for (const t of spend) {
    if (Number(t.localDate.slice(8)) > throughDay) continue
    const m = t.localDate.slice(0, 7)
    if (m === month) now -= t.base
    else if (prior.has(m)) by.set(m, (by.get(m) ?? 0) - t.base)
  }
  const usual = by.size >= 2 ? [...by.values()].reduce((a, b) => a + b, 0) / by.size : null
  return { now, usual, vsUsual: usual ? (now - usual) / usual : null }
}
