// What the metric Peek and /plan/trackers/[slug] show about one tracker: a 90-day series, averages, the streak
// and how many of the last 28 days met the target. Pure; the loader (src/core/peek/metric.ts) feeds it.

import { addDays } from '@/core/time'
import { average, fillDays } from './series'
import { streaks } from './streaks'

export const METRIC_DAYS = 90
export const TARGET_WINDOW = 28

export type MetricSummary = {
  series: { date: string; value: number | null }[]
  avg: { d7: number | null; d28: number | null; d90: number | null }
  streak: { current: number; best: number }
  /** Days in the last 28 that met the target. Null when the tracker has no target. */
  onTarget: { hit: number; days: number } | null
}

/** Did a day's value meet the target? Without a target any logged value counts. */
export function metTarget(value: number, target: number | null, direction: 'up' | 'down') {
  return target ? (direction === 'down' ? value <= target : value >= target) : value > 0
}

/** `days` maps local date → value for logged days only. Gaps stay null in the series (never zero). */
export function summarizeMetric(days: Map<string, number>, today: string, target: number | null, direction: 'up' | 'down'): MetricSummary {
  const series = fillDays(days, addDays(today, -(METRIC_DAYS - 1)), today)
  const avg = (n: number) => average(series.slice(-n).map((p) => p.value))
  const hit = (v: number) => metTarget(v, target, direction)
  const met = [...days.entries()].filter(([, v]) => hit(v)).map(([d]) => d)
  const onTarget = target ? { hit: series.slice(-TARGET_WINDOW).filter((p) => p.value != null && hit(p.value)).length, days: TARGET_WINDOW } : null
  return { series, avg: { d7: avg(7), d28: avg(28), d90: avg(90) }, streak: streaks(met, today), onTarget }
}
