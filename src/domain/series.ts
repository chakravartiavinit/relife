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
