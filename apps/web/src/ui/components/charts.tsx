'use client'

import { useMemo } from 'react'
import { EvilAreaChart } from '@/components/evilcharts/charts/recharts-area-chart'
import { EvilLineChart } from '@/components/evilcharts/charts/recharts-line-chart'
import { EvilBarChart } from '@/components/evilcharts/charts/recharts-bar-chart'
import { EvilPieChart } from '@/components/evilcharts/charts/recharts-pie-chart'
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart'
import { interpolateGaps } from '@/domain/series'
import { CHART } from '../tokens'

// ReLife's charts: EvilCharts (evilcharts.com), installed unmodified with `npx shadcn add @evilcharts/…` into
// src/components/evilcharts. These wrappers only pick the chart, its parts and ReLife's colours.
// One rule per kind of number:
//   a measure over time (sleep, mood, weight)     → TrendArea   (gradient area; with a goal, a line chart with a dashed goal line)
//   a count per day (steps, commits, spend, XP)   → DailyBars   (bars; days that met the goal stand out)
//   a ranking (spending by category)              → RankedBars  (horizontal bars, sorted)
//   shares of a whole (XP by kind, holdings)      → ShareDonut  (pie chart as a ring, with its legend)
//   several series per period (spend by month)    → StackedBars
//   a tiny trend in a stat tile                   → Sparkline
// Colours are ReLife tokens; they switch with the theme on their own, so light and dark get the same value.
// Tooltips show EvilCharts' plain numbers, so the unit goes in the series name ("Sleep (h)").
// Habit adherence keeps its own shape-coded strip.

export type Point = { date: string; value: number | null }

const shortDate = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))

function fmt(v: number, unit?: string) {
  const n = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1, notation: Math.abs(v) >= 100_000 ? 'compact' : 'standard' }).format(v)
  if (unit === '₹') return `₹${n}`
  return unit ? `${n} ${unit}` : n
}
const tick = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
const goalColor = 'var(--ink-3)'
/** One series colour for both themes (the token itself changes with the theme). */
const tone = (label: string, color: string) => ({ label, colors: { light: [color], dark: [color] } })
const named = (name: string, unit?: string) => (unit ? `${name} (${unit})` : name)
const axisTick = { fontSize: 11 }
type Row = Record<string, string | number | null>

/**
 * The series name in tooltips and legends: the measure only, since the tooltip already shows the date
 * and the value its unit. "Daily spending in October 2026" → "Spending", "Sleep, last 28 days" → "Sleep".
 */
export function seriesName(label: string) {
  const s = label.replace(/^daily\s+/i, '').split(/,|\s+(?:in|per|by|over|this|last)\s+/i)[0].trim()
  return s ? s[0].toUpperCase() + s.slice(1) : 'Value'
}
// Mixed into a raised surface rather than transparent, so a below-goal bar still reads on a dark card.
const faded = (c: string) => `color-mix(in oklch, ${c} 50%, var(--surface-3))`

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

/**
 * Daily counts as bars. With a goal, days that met it are full colour and the rest are faded,
 * so the split reads without a reference line (and the legend names both).
 */
export function DailyBars({ data, color = CHART.accent, unit, target, height = 180, label }: {
  data: Point[]; color?: string; unit?: string; target?: number | null; height?: number; label: string
}) {
  const { rows, config } = useMemo(() => {
    const rows: Row[] = data.map((p) => {
      const v = p.value ?? 0
      const row: Row = target ? { day: shortDate(p.date), met: v >= target ? v : null, below: v < target ? v : null } : { day: shortDate(p.date), value: v }
      return row
    })
    const config: ChartConfig = target
      ? { met: tone(`Met goal (${fmt(target, unit)})`, color), below: tone('Below goal', faded(color)) }
      : { value: tone(named(seriesName(label), unit), color) }
    return { rows, config }
  }, [data, target, color, unit, label])
  if (!hasData(data)) return <ChartEmpty height={height} label={label} />
  return (
    <figure aria-label={label} className="m-0">
        <div style={{ height }}><EvilBarChart data={rows} config={config} stackType="stacked" barRadius={4} className="aspect-auto h-full w-full">
          <EvilBarChart.Grid />
          <EvilBarChart.XAxis dataKey="day" interval="preserveStartEnd" minTickGap={24} tick={axisTick} />
          <EvilBarChart.YAxis tickFormatter={tick} tick={axisTick} />
          <EvilBarChart.Tooltip />
          {target ? <EvilBarChart.Legend variant="circle" /> : null}
          {target ? [<EvilBarChart.Bar key="met" dataKey="met" />, <EvilBarChart.Bar key="below" dataKey="below" />] : <EvilBarChart.Bar dataKey="value" variant="gradient" />}
        </EvilBarChart></div>
      </figure>
  )
}

/**
 * A measure over time. Logged days are joined across gaps and empty edges trimmed, and the axis fits the data rather
 * than starting at zero. Without a goal, a soft gradient area; with one, a line plus a dashed goal line.
 */
export function TrendArea({ data, color = CHART.accent, unit, target, height = 180, label, domain, curve = 'monotone' }: {
  data: Point[]; color?: string; unit?: string; target?: number | null; height?: number; label: string; domain?: [number, number]
  /** 'linear' for 1–5 scales (mood, energy): smoothing would invent values between whole steps. */
  curve?: 'monotone' | 'linear'
}) {
  const { rows, bounds, config } = useMemo(() => {
    const values = interpolateGaps(data.map((p) => p.value))
    const rows: Row[] = data.flatMap((p, i) => (values[i] == null ? [] : [{ day: shortDate(p.date), value: values[i]!, ...(target ? { goal: target } : {}) }]))
    // Fit the data (and the goal) instead of starting at zero, so a 6.8h vs 7.4h night is visible.
    const vs = [...rows.map((r) => r.value as number), ...(target ? [target] : [])]
    const lo = Math.min(...vs), hi = Math.max(...vs)
    const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1
    const config: ChartConfig = { value: tone(named(seriesName(label), unit), color), ...(target ? { goal: tone(`Goal (${fmt(target, unit)})`, goalColor) } : {}) }
    return { rows, bounds: domain ?? ([Math.max(0, lo - pad), hi + pad] as [number, number]), config }
  }, [data, color, target, unit, label, domain])
  if (!hasData(data)) return <ChartEmpty height={height} label={label} />
  if (target) {
    return (
    <figure aria-label={label} className="m-0">
        <div style={{ height }}><EvilLineChart data={rows} config={config} curveType={curve} className="aspect-auto h-full w-full">
          <EvilLineChart.Grid />
          <EvilLineChart.XAxis dataKey="day" interval="preserveStartEnd" minTickGap={24} tick={axisTick} />
          <EvilLineChart.YAxis domain={bounds} tickFormatter={tick} tick={axisTick} />
          <EvilLineChart.Tooltip />
          <EvilLineChart.Legend variant="circle" />
          <EvilLineChart.Line dataKey="value" connectNulls />
          {/* A flat line has no height, so the library's gradient stroke paints nothing: give it a plain colour. */}
          <EvilLineChart.Line dataKey="goal" strokeVariant="dashed" strokeWidth={1.5} lineProps={{ dataKey: 'goal', stroke: goalColor }} />
        </EvilLineChart></div>
      </figure>
    )
  }
  return (
    <figure aria-label={label} className="m-0">
      <div style={{ height }}><EvilAreaChart data={rows} config={config} curveType={curve} className="aspect-auto h-full w-full">
        <EvilAreaChart.Grid />
        <EvilAreaChart.XAxis dataKey="day" interval="preserveStartEnd" minTickGap={24} tick={axisTick} />
        <EvilAreaChart.YAxis domain={bounds} tickFormatter={tick} tick={axisTick} />
        <EvilAreaChart.Tooltip />
        <EvilAreaChart.Area dataKey="value" variant="gradient" strokeVariant="solid" connectNulls />
      </EvilAreaChart></div>
    </figure>
  )
}

/** A tiny trend for a stat tile: the line and its soft fill, nothing else. */
export function Sparkline({ data, color = CHART.accent, height = 32, label = 'Trend' }: {
  data: Point[]; color?: string; height?: number; label?: string; delta?: boolean
}) {
  const rows = useMemo(() => {
    const values = interpolateGaps(data.map((p) => p.value))
    return data.map((p, i) => ({ day: shortDate(p.date), value: values[i] }))
  }, [data])
  // One or two points draw as a sliver at the edge; the space stays, the line waits for more days.
  if (data.filter((p) => p.value != null).length < 3) return null
  return (
    <figure aria-label={label} className="m-0">
      <div style={{ height }}><EvilAreaChart data={rows} config={{ value: tone(seriesName(label), color) }} animationType="none" className="aspect-auto h-full w-full"
        chartProps={{ margin: { top: 2, right: 2, bottom: 2, left: 2 } }}>
        <EvilAreaChart.Area dataKey="value" variant="gradient" strokeVariant="solid" connectNulls />
      </EvilAreaChart></div>
    </figure>
  )
}

/** Ranked horizontal bars (magnitude by category), largest first. */
export function RankedBars({ data, color = CHART.accent, unit, label }: {
  data: { label: string; value: number }[]; color?: string; unit?: string; label: string
}) {
  const rows = useMemo(() => [...data].sort((a, b) => b.value - a.value), [data])
  return (
    <figure aria-label={label} className="m-0">
        <div style={{ height: rows.length * 34 + 16 }}><EvilBarChart data={rows} config={{ value: tone(named(seriesName(label), unit), color) }} layout="horizontal" barRadius={4} className="aspect-auto h-full w-full">
          <EvilBarChart.XAxis type="number" hide />
          <EvilBarChart.YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12 }} />
          <EvilBarChart.Tooltip />
          <EvilBarChart.Bar dataKey="value" />
        </EvilBarChart></div>
      </figure>
  )
}

/** Shares of a whole as a ring, with EvilCharts' legend and the total underneath. */
export function ShareDonut({ segments, unit, totalLabel, label }: {
  segments: { id: string; name: string; color: string; value: number }[]; unit?: string; totalLabel: string; label: string
}) {
  // Config keys become CSS variable names, so they're simple ids, not the segment names.
  const { rows, config, total } = useMemo(() => {
    const shown = segments.filter((s) => s.value > 0)
    const config: ChartConfig = Object.fromEntries(shown.map((s, i) => [`s${i}`, tone(s.name, s.color)]))
    return { rows: shown.map((s, i) => ({ key: `s${i}`, value: s.value })), config, total: shown.reduce((a, s) => a + s.value, 0) }
  }, [segments])
  if (!rows.length) return <p className="text-[13px] text-ink-3">Nothing to show yet.</p>
  return (
    <figure aria-label={label} className="m-0">
      <EvilPieChart data={rows} dataKey="value" nameKey="key" config={config} className="mx-auto aspect-square w-full max-w-[16rem]">
        <EvilPieChart.Pie innerRadius="62%" paddingAngle={2} cornerRadius={4} />
        <EvilPieChart.Tooltip />
        <EvilPieChart.Legend variant="circle" />
      </EvilPieChart>
      <figcaption className="mt-2 text-center text-[12.5px] text-ink-3 tabular-nums">
        <span className="font-medium text-ink">{fmt(Math.round(total), unit)}</span> {totalLabel}
      </figcaption>
    </figure>
  )
}

/** Several series stacked per period (spend by category per month), with a legend. */
export function StackedBars({ categories, series, unit, height = 220, label }: {
  categories: string[]; series: { id: string; name: string; color: string; values: (number | null)[] }[]; unit?: string; height?: number; label: string
}) {
  const { rows, config } = useMemo(() => {
    const keys = series.map((_, i) => `s${i}`)
    const rows: Row[] = categories.map((c, j) => ({ category: c, ...Object.fromEntries(series.map((s, i) => [keys[i], s.values[j]])) }))
    const config: ChartConfig = Object.fromEntries(series.map((s, i) => [keys[i], tone(s.name, s.color)]))
    return { rows, config }
  }, [categories, series])
  if (!series.some((s) => s.values.some((v) => v))) return <ChartEmpty height={height} label={label} />
  return (
    <figure aria-label={label} className="m-0">
        <div style={{ height: height + 28 }}><EvilBarChart data={rows} config={config} stackType="stacked" barRadius={3} className="aspect-auto h-full w-full">
          <EvilBarChart.Grid />
          <EvilBarChart.XAxis dataKey="category" interval="preserveStartEnd" minTickGap={16} tick={axisTick} />
          <EvilBarChart.YAxis tickFormatter={tick} tick={axisTick} />
          <EvilBarChart.Tooltip />
          <EvilBarChart.Legend variant="circle" />
          {series.map((_, i) => <EvilBarChart.Bar key={i} dataKey={`s${i}`} />)}
        </EvilBarChart></div>
      </figure>
  )
}
