'use client'

import { useMemo } from 'react'
import { BarChart, BarChartLegend, BarChartPlot, BarChartTooltip } from '../beui/charts/bar-chart'
import { LineChart, LineChartLegend, LineChartPlot, LineChartTooltip, type LineChartSeries } from '../beui/charts/line-chart'
import { DonutChart, DonutChartCenter, DonutChartLegend, DonutChartPlot } from '../beui/charts/donut-chart'
import { Sparkline as BeuiSparkline } from '../beui/charts/sparkline'
import { interpolateGaps } from '@/domain/series'
import { CHART } from '../tokens'

// ReLife's charts, drawn with beUI (beui.dev/charts). One rule per kind of number:
//   a measure over time (sleep, mood, weight)     → TrendArea  (line/area, goal as a second line)
//   a count per day (steps, commits, spend, XP)   → DailyBars  (bars; days that met the goal stand out)
//   a ranking (spending by category)              → RankedBars (horizontal bars, sorted)
//   shares of a whole (XP by kind, holdings)      → ShareDonut (ring with a centre total)
//   a tiny trend in a stat tile                   → Sparkline
// Habit adherence keeps its own shape-coded strip, and the commit calendar uses beUI's HeatCalendar.

export type Point = { date: string; value: number | null }

const shortDate = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))

function fmt(v: number, unit?: string) {
  const n = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1, notation: Math.abs(v) >= 100_000 ? 'compact' : 'standard' }).format(v)
  if (unit === '₹') return `₹${n}`
  return unit ? `${n} ${unit}` : n
}
const tick = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
const goalColor = 'var(--ink-3)'
/**
 * The series name in tooltips and legends: the measure only, since the tooltip already shows the date
 * and the value its unit. "Daily spending in October 2026" → "Spending", "Sleep, last 28 days" → "Sleep".
 */
export function seriesName(label: string) {
  const s = label.replace(/^daily\s+/i, '').split(/,|\s+(?:in|per|by|over|this|last)\s+/i)[0].trim()
  return s ? s[0].toUpperCase() + s.slice(1) : 'Value'
}
const faded = (c: string) => `color-mix(in oklch, ${c} 40%, transparent)`

const GHOST = [38, 62, 45, 80, 55, 30, 68, 50, 74, 42, 58, 85, 48, 64, 36, 70, 52, 44, 78, 60]

/** Shown instead of empty axes: faint ghost bars and one line of guidance. */
function ChartEmpty({ height, label }: { height: number; label: string }) {
  return (
    <figure aria-label={`${label}: no data yet`} className="relative m-0 grid place-items-center" style={{ height }}>
      <div aria-hidden className="absolute inset-x-1 bottom-6 top-3 flex items-end gap-[3px] opacity-60 [mask-image:linear-gradient(to_top,black,transparent)]">
        {GHOST.map((h, i) => <span key={i} className="flex-1 rounded-t-[4px] bg-surface-2" style={{ height: `${h}%` }} />)}
      </div>
      <figcaption className="relative rounded-full bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-ink-3 shadow-1">No data yet</figcaption>
    </figure>
  )
}

const hasData = (data: Point[]) => data.some((d) => d.value != null && d.value !== 0)
// Plot heights exclude the category label row (~24px) so callers keep passing the total height.
const plotHeight = (h: number) => Math.max(80, h - 24)

/**
 * Daily counts as bars. With a goal, days that met it are full colour and the rest are faded,
 * so the split reads without a reference line (and the legend names both).
 */
export function DailyBars({ data, color = CHART.accent, unit, target, height = 180, label }: {
  data: Point[]; color?: string; unit?: string; target?: number | null; height?: number; label: string
}) {
  const categories = useMemo(() => data.map((p) => shortDate(p.date)), [data])
  const series = useMemo(() => {
    const v = data.map((p) => p.value ?? 0)
    // Softened so a month of bars reads as texture, not a wall of colour.
    if (!target) return [{ id: 'value', name: seriesName(label), color: `color-mix(in oklch, ${color} 78%, transparent)`, values: v }]
    return [
      { id: 'met', name: `Met goal (${fmt(target, unit)})`, color, values: v.map((x) => (x >= target ? x : null)) },
      { id: 'below', name: 'Below goal', color: faded(color), values: v.map((x) => (x < target ? x : null)) },
    ]
  }, [data, target, color, unit, label])
  if (!hasData(data)) return <ChartEmpty height={height} label={label} />
  return (
    <BarChart series={series} categories={categories} layout="stacked" label={label} formatValue={(v) => fmt(v, unit)} formatTick={tick}>
      <BarChartPlot height={plotHeight(height)} />
      <BarChartTooltip />
      {target ? <BarChartLegend /> : null}
    </BarChart>
  )
}

/**
 * A measure over time. Logged days are joined across gaps and empty edges trimmed. With a goal
 * it's a line plus a muted goal line; without one, a soft area.
 */
export function TrendArea({ data, color = CHART.accent, unit, target, height = 180, label, domain, curve = 'monotone' }: {
  data: Point[]; color?: string; unit?: string; target?: number | null; height?: number; label: string; domain?: [number, number]
  /** 'linear' for 1–5 scales (mood, energy): smoothing would invent values between whole steps. */
  curve?: 'monotone' | 'linear'
}) {
  const { categories, series, bounds } = useMemo(() => {
    const values = interpolateGaps(data.map((p) => p.value))
    const kept = data.flatMap((p, i) => (values[i] == null ? [] : [{ day: shortDate(p.date), v: values[i]! }]))
    const s: LineChartSeries[] = [{ id: 'value', name: seriesName(label), color, values: kept.map((k) => k.v) }]
    if (target) s.push({ id: 'goal', name: `Goal ${fmt(target, unit)}`, color: goalColor, values: kept.map(() => target) })
    // Fit the data (and the goal) instead of starting at zero, so a 6.8h vs 7.4h night is visible.
    const vs = [...kept.map((k) => k.v), ...(target ? [target] : [])]
    const lo = Math.min(...vs), hi = Math.max(...vs)
    const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1
    return { categories: kept.map((k) => k.day), series: s, bounds: domain ?? ([Math.max(0, lo - pad), hi + pad] as [number, number]) }
  }, [data, color, target, unit, label, domain])
  if (!hasData(data)) return <ChartEmpty height={height} label={label} />
  return (
    <LineChart series={series} categories={categories} variant={target ? 'line' : 'area'} curve={curve} domain={bounds} label={label} formatValue={(v) => fmt(v, unit)} formatTick={tick}>
      <LineChartPlot height={plotHeight(height)} />
      <LineChartTooltip />
      {target ? <LineChartLegend /> : null}
    </LineChart>
  )
}

/** Tiny trend for stat tiles. `delta` adds beUI's change badge. */
export function Sparkline({ data, color = CHART.accent, height = 32, label = 'Trend', delta = false }: {
  data: Point[]; color?: string; height?: number; label?: string; delta?: boolean
}) {
  const values = useMemo(() => interpolateGaps(data.map((p) => p.value)), [data])
  return <BeuiSparkline data={values} labels={data.map((p) => shortDate(p.date))} label={label} variant="area" color={color} height={height} showDelta={delta} />
}

/** Ranked horizontal bars (magnitude by category), largest first. */
export function RankedBars({ data, color = CHART.accent, unit, label }: {
  data: { label: string; value: number }[]; color?: string; unit?: string; label: string
}) {
  const categories = useMemo(() => data.map((d) => d.label), [data])
  const series = useMemo(() => [{ id: 'value', name: seriesName(label), color: `color-mix(in oklch, ${color} 62%, transparent)`, values: data.map((d) => d.value) }], [data, color, label])
  return (
    <BarChart series={series} categories={categories} orientation="horizontal" sort="descending" label={label} formatValue={(v) => fmt(v, unit)} formatTick={tick}>
      <BarChartPlot labelWidth={120} />
      <BarChartTooltip />
    </BarChart>
  )
}

/** Shares of a whole as a ring, with the total (or the hovered share) in the centre and a legend. */
export function ShareDonut({ segments, unit, totalLabel, label }: {
  segments: { id: string; name: string; color: string; value: number }[]; unit?: string; totalLabel: string; label: string
}) {
  if (!segments.some((s) => s.value > 0)) return <p className="text-[13px] text-ink-3">Nothing to show yet.</p>
  return (
    <DonutChart segments={segments} label={label} formatValue={(v) => fmt(Math.round(v), unit)}>
      {/* Side by side when the card is wide enough, stacked in narrow rails. */}
      <div className="@container">
        <div className="grid items-center gap-5 @[30rem]:grid-cols-[minmax(0,11rem)_1fr]">
          <DonutChartPlot className="mx-auto w-full max-w-[11rem]"><DonutChartCenter totalLabel={totalLabel} /></DonutChartPlot>
          <DonutChartLegend />
        </div>
      </div>
    </DonutChart>
  )
}

/** Several series stacked per period (spend by category per month), with a legend. */
export function StackedBars({ categories, series, unit, height = 220, label }: {
  categories: string[]; series: { id: string; name: string; color: string; values: (number | null)[] }[]; unit?: string; height?: number; label: string
}) {
  if (!series.some((s) => s.values.some((v) => v))) return <ChartEmpty height={height} label={label} />
  return (
    <BarChart series={series} categories={categories} layout="stacked" label={label} formatValue={(v) => fmt(v, unit)} formatTick={tick}>
      <BarChartPlot height={plotHeight(height)} />
      <BarChartTooltip />
      <BarChartLegend />
    </BarChart>
  )
}
