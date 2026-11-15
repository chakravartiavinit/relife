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
