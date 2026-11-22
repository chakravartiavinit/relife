import { addDays } from '@/core/time'

/** Continuous daily series from a sparse date→value map. Missing days are null (gaps, not zeros). */
export function fillDays(days: Map<string, number>, from: string, to: string, missing: number | null = null) {
  const out: { date: string; value: number | null }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, value: days.get(d) ?? missing })
  return out
}

export function average(values: (number | null)[]) {
  const xs = values.filter((v): v is number => v != null)
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null
}

/**
 * Bridge gaps for trend lines: interior nulls are linearly interpolated between logged days.
 * Leading/trailing nulls stay null; callers trim them rather than invent values.
 */
export function interpolateGaps(values: (number | null)[]): (number | null)[] {
  const known = values.flatMap((v, i) => (v == null ? [] : [i]))
  if (!known.length) return values
  return values.map((v, i) => {
    if (v != null) return v
    const after = known.find((k) => k > i)
    const before = known.findLast((k) => k < i)
    if (before == null || after == null) return null
    const t = (i - before) / (after - before)
    return values[before]! + t * (values[after]! - values[before]!)
  })
}

/**
 * A y-axis that fits [lo, hi] on round numbers: about `count` ticks on a 1, 2 or 5 × 10ⁿ step, the bounds snapped
 * outward to the step (never below zero for data that is not). "6, 7, 8, 9" rather than "5.6, 7.4, 9.1".
 */
export function niceAxis(lo: number, hi: number, count = 4): { domain: [number, number]; ticks: number[] } {
  const span = hi - lo || Math.abs(hi) * 0.2 || 1
  const raw = span / (count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((f) => f * mag).find((s) => s >= raw)!
  const digits = Math.max(0, -Math.floor(Math.log10(step)))
  const round = (v: number) => Number(v.toFixed(digits))
  let min = round(Math.floor(lo / step) * step)
  let max = round(Math.ceil(hi / step) * step)
  if (lo >= 0) min = Math.max(0, min)
  if (min === max) { min = lo >= 0 ? Math.max(0, round(min - step)) : round(min - step); max = round(max + step) }
  const ticks: number[] = []
  for (let v = min; v <= max + step / 2; v = round(v + step)) ticks.push(v)
  return { domain: [min, max], ticks }
}

/**
 * True when a stat tile has a trend worth drawing: three or more logged points. Here and not in charts.tsx, so a
 * server component can ask before it renders the (client) `Sparkline` slot.
 */
export const hasTrend = (points: { value: number | null }[]) => points.filter((p) => p.value != null).length >= 3

/** One series of a multi-series chart (spend by category per month): a value per period, null where nothing was logged. */
export type Series = { id: string; name: string; color: string; values: (number | null)[] }
/** A series with its place in the ranking: 1 is the biggest. The folded-up rest is `other`, ranked last. */
export type RankedSeries = Series & { rank: number; other?: boolean }

const total = (s: Series) => s.values.reduce<number>((a, v) => a + (v ?? 0), 0)

/**
 * The series a chart leads with: sorted by total (ties keep their input order), the top `n` kept with rank 1..n and
 * the rest folded into one `Other` series (rank n + 1, summed per period, null where every folded value is null).
 * `pin` names a series that always takes rank 1 (the lead the page chose), whatever its total.
 */
export function leadSeries(series: Series[], n: number, pin?: string): RankedSeries[] {
  const sorted = series
    .map((s, i) => ({ s, i, t: total(s) }))
    .sort((a, b) => (pin ? Number(b.s.id === pin) - Number(a.s.id === pin) : 0) || b.t - a.t || a.i - b.i)
    .map((x) => x.s)
  const keep = Math.max(1, Math.floor(n))
  const top = sorted.slice(0, keep).map((s, i): RankedSeries => ({ ...s, rank: i + 1 }))
  const rest = sorted.slice(keep)
  if (!rest.length) return top
  const periods = Math.max(...series.map((s) => s.values.length))
  const values = Array.from({ length: periods }, (_, j) => {
    const vs = rest.map((s) => s.values[j]).filter((v): v is number => v != null)
    return vs.length ? vs.reduce((a, v) => a + v, 0) : null
  })
  return [...top, { id: 'other', name: 'Other', color: '', values, rank: top.length + 1, other: true }]
}

/**
 * Drop the periods before anything happened: leading periods where every series is 0 or null. Gaps after the first
 * active period stay (a month with no spend is a fact). `dropped` is how many periods went.
 */
export function trimLeadingEmpty<T extends { values: (number | null)[] }>(categories: string[], series: T[]): { categories: string[]; series: T[]; dropped: number } {
  const first = categories.findIndex((_, j) => series.some((s) => (s.values[j] ?? 0) !== 0))
  const dropped = first < 0 ? categories.length : first
  return { categories: categories.slice(dropped), series: series.map((s) => ({ ...s, values: s.values.slice(dropped) })), dropped }
}
