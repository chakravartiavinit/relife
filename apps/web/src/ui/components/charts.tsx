'use client'

import { useMemo } from 'react'
import { EvilAreaChart } from '@/components/evilcharts/charts/recharts-area-chart'
import { EvilLineChart } from '@/components/evilcharts/charts/recharts-line-chart'
import { EvilBarChart } from '@/components/evilcharts/charts/recharts-bar-chart'
import { EvilPieChart } from '@/components/evilcharts/charts/recharts-pie-chart'
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart'
import { hasTrend, interpolateGaps, leadSeries, niceAxis, trimLeadingEmpty, type RankedSeries } from '@/domain/series'
import { CHART } from '../tokens'

// ReLife's charts: EvilCharts (evilcharts.com), installed unmodified with `npx shadcn add @evilcharts/…` into
// src/components/evilcharts. These wrappers only pick the chart, its parts and ReLife's colours.
// One rule per kind of number:
//   a measure over time (sleep, mood, weight)     → TrendArea   (gradient area; with a goal, a line chart with a dashed goal line)
//   a count per day (steps, commits, spend, XP)   → DailyBars   (bars; days that met the goal stand out)
//   a ranking (spending by category)              → RankedBars  (horizontal bars, sorted)
//   shares of a whole (XP by kind, holdings)      → ShareDonut  (pie chart as a ring, with its legend)
//   several series per period (spend by month)    → StackedBars  (the lead series in the accent, the rest in neutrals)
//   a tiny trend in a stat tile                   → Sparkline    (render its slot only when `hasTrend` from domain/series says there is one)
// One lead chart per screen, 240 to 280 high (`height`); the others sit at 120 to 160 and are a different kind.
// One accent per chart. Area colours (`--cat-*`) belong to area series and are kept; nothing else gets its own hue.
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
const axisTick = { fontSize: 12 }
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

/** Shown instead of empty axes: a plain well of the chart's height and one line of guidance. */
function ChartEmpty({ height, label }: { height: number; label: string }) {
  return (
    <figure aria-label={`${label}: no data yet`} className="m-0 grid place-items-center rounded-md bg-surface-2" style={{ height }}>
      <figcaption className="text-small text-ink-3">No data yet</figcaption>
    </figure>
  )
}

const isArea = (color: string) => color.startsWith('var(--cat-')
/** The colour rule: the lead takes the accent, ranks 2 and 3 and Other the neutral ramp; an area series keeps its area colour. */
function shade(r: RankedSeries, accent: string) {
  if (isArea(r.color)) return r.color
  if (r.other) return CHART.neutral[2]
  return r.rank === 1 ? accent : CHART.neutral[Math.min(r.rank - 2, 2)]
}
const LEGEND_MAX = 4

/** The legend of a chart that leads with one series: at most four entries, wrapping under the chart. */
function Legend({ items, max = LEGEND_MAX }: { items: { id: string; name: string; color: string }[]; max?: number }) {
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-caption text-ink-2">
      {items.slice(0, max).map((s) => (
        <li key={s.id} className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />{s.name}</li>
      ))}
    </ul>
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
  const { rows, axis, config } = useMemo(() => {
    const rows: Row[] = data.map((p) => {
      const v = p.value ?? 0
      const row: Row = target ? { day: shortDate(p.date), met: v >= target ? v : null, below: v < target ? v : null } : { day: shortDate(p.date), value: v }
      return row
    })
    const config: ChartConfig = target
      ? { met: tone(`Met goal (${fmt(target, unit)})`, color), below: tone('Below goal', faded(color)) }
      : { value: tone(named(seriesName(label), unit), color) }
    return { rows, axis: niceAxis(Math.min(0, ...data.map((p) => p.value ?? 0)), Math.max(0, ...data.map((p) => p.value ?? 0))), config }
  }, [data, target, color, unit, label])
  if (!hasData(data)) return <ChartEmpty height={height} label={label} />
  return (
    <figure aria-label={label} className="m-0">
        <div style={{ height }}><EvilBarChart data={rows} config={config} stackType="stacked" barRadius={4} className="aspect-auto h-full w-full">
          <EvilBarChart.Grid />
          <EvilBarChart.XAxis dataKey="day" interval="preserveStartEnd" minTickGap={24} tick={axisTick} />
          <EvilBarChart.YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={tick} tick={axisTick} />
          <EvilBarChart.Tooltip />
          {target ? <EvilBarChart.Legend variant="circle" /> : null}
          {target ? [<EvilBarChart.Bar key="met" dataKey="met" />, <EvilBarChart.Bar key="below" dataKey="below" />] : <EvilBarChart.Bar dataKey="value" />}
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
  const { rows, axis, config } = useMemo(() => {
    const values = interpolateGaps(data.map((p) => p.value))
    const rows: Row[] = data.flatMap((p, i) => (values[i] == null ? [] : [{ day: shortDate(p.date), value: values[i]!, ...(target ? { goal: target } : {}) }]))
    // Fit the data (and the goal) on round numbers instead of starting at zero, so a 6.8h vs 7.4h night is visible.
    const vs = [...rows.map((r) => r.value as number), ...(target ? [target] : [])]
    const config: ChartConfig = { value: tone(named(seriesName(label), unit), color), ...(target ? { goal: tone(`Goal (${fmt(target, unit)})`, goalColor) } : {}) }
    const axis = domain ? { domain, ticks: undefined } : vs.length ? niceAxis(Math.min(...vs), Math.max(...vs)) : { domain: undefined, ticks: undefined }
    return { rows, axis, config }
  }, [data, color, target, unit, label, domain])
  if (!hasData(data)) return <ChartEmpty height={height} label={label} />
  if (target) {
    return (
    <figure aria-label={label} className="m-0">
        <div style={{ height }}><EvilLineChart data={rows} config={config} curveType={curve} className="aspect-auto h-full w-full">
          <EvilLineChart.Grid />
          <EvilLineChart.XAxis dataKey="day" interval="preserveStartEnd" minTickGap={24} tick={axisTick} />
          <EvilLineChart.YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={tick} tick={axisTick} />
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
        <EvilAreaChart.YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={tick} tick={axisTick} />
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
  if (!hasTrend(data)) return null
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
          {/* Headroom on the right for each bar's value label. */}
          <EvilBarChart.XAxis type="number" hide domain={[0, (max: number) => max * 1.2]} />
          <EvilBarChart.YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12 }} />
          <EvilBarChart.Tooltip />
          <EvilBarChart.Bar dataKey="value" barProps={{ dataKey: 'value', label: { position: 'right', fontSize: 12, fill: 'var(--ink-2)', formatter: (v: unknown) => (typeof v === 'number' ? fmt(Math.round(v), unit) : '') } }} />
        </EvilBarChart></div>
      </figure>
  )
}

/**
 * Shares of a whole as a ring, with a legend and the total underneath. The biggest `top` shares are drawn (the lead in
 * the accent, the next ones in neutrals) and the rest fold into Other; at most four legend entries. Shares that are
 * areas (XP by area) keep their area colours and are all shown.
 */
export function ShareDonut({ segments, unit, totalLabel, label, top = 3, accent = CHART.accent }: {
  segments: { id: string; name: string; color: string; value: number }[]; unit?: string; totalLabel: string; label: string
  /** How many shares keep their own slice before the rest fold into Other. Ignored for area-coloured shares. */
  top?: number
  accent?: string
}) {
  // Config keys become CSS variable names, so they're simple ids, not the segment names.
  const { shown, rows, config, total } = useMemo(() => {
    const live = segments.filter((s) => s.value > 0)
    const areas = live.some((s) => isArea(s.color))
    const ranked = areas ? live.map((s, i) => ({ id: s.id, name: s.name, color: s.color, value: s.value, rank: i + 1 })) : leadSeries(live.map((s) => ({ id: s.id, name: s.name, color: s.color, values: [s.value] })), top).map((r) => ({ id: r.id, name: r.name, color: shade(r, accent), value: r.values[0] ?? 0, rank: r.rank }))
    const config: ChartConfig = Object.fromEntries(ranked.map((s, i) => [`s${i}`, tone(s.name, s.color)]))
    return { shown: areas ? ranked : ranked.slice(0, LEGEND_MAX), rows: ranked.map((s, i) => ({ key: `s${i}`, value: s.value })), config, total: live.reduce((a, s) => a + s.value, 0) }
  }, [segments, top, accent])
  if (!rows.length) return <p className="text-small text-ink-3">Nothing to show yet.</p>
  return (
    <figure aria-label={label} className="m-0">
      <EvilPieChart data={rows} dataKey="value" nameKey="key" config={config} className="mx-auto aspect-square w-full max-w-[16rem]">
        <EvilPieChart.Pie innerRadius="62%" paddingAngle={2} cornerRadius={4} />
        <EvilPieChart.Tooltip />
      </EvilPieChart>
      {/* Our own legend, outside the square chart, so long names wrap instead of running past the card. */}
      <Legend items={shown} max={shown.length} />
      <figcaption className="mt-2 text-center text-small text-ink-3 tabular-nums">
        <span className="font-medium text-ink">{fmt(Math.round(total), unit)}</span> {totalLabel}
      </figcaption>
    </figure>
  )
}

/**
 * Several series stacked per period (spend by category per month). One series leads: `lead` (a series id) or the
 * biggest takes the accent, the next `top - 1` and Other are neutrals, and a series that is an area keeps its area
 * colour. Periods before the first activity are hidden. The legend shows at most four entries.
 */
export function StackedBars({ categories, series, unit, height = 220, label, top = 3, lead, accent = CHART.accent }: {
  categories: string[]; series: { id: string; name: string; color: string; values: (number | null)[] }[]; unit?: string; height?: number; label: string
  /** How many series keep their own colour before the rest fold into Other. */
  top?: number
  /** The id of the series to lead with, when it is not simply the biggest. */
  lead?: string
  accent?: string
}) {
  const { rows, config, axis, ranked, empty } = useMemo(() => {
    const trimmed = trimLeadingEmpty(categories, series)
    const ranked = leadSeries(trimmed.series, top, lead).map((r) => ({ ...r, color: shade(r, accent) }))
    const keys = ranked.map((_, i) => `s${i}`)
    const rows: Row[] = trimmed.categories.map((c, j) => ({ category: c, ...Object.fromEntries(ranked.map((s, i) => [keys[i], s.values[j] ?? null])) }))
    const config: ChartConfig = Object.fromEntries(ranked.map((s, i) => [keys[i], tone(s.name, s.color)]))
    // Minutes read better on an hours axis: 0, 2h, 4h rather than 0, 200, 400.
    const peak = Math.max(0, ...trimmed.categories.map((_, j) => ranked.reduce((a, s) => a + (s.values[j] ?? 0), 0)))
    const hours = unit === 'min' ? niceAxis(0, peak / 60) : null
    const axis = hours ? { domain: [0, hours.domain[1] * 60] as [number, number], ticks: hours.ticks.map((h) => h * 60) } : { domain: undefined, ticks: undefined }
    return { rows, config, axis, ranked, empty: !ranked.some((s) => s.values.some((v) => v)) }
  }, [categories, series, unit, top, lead, accent])
  if (empty) return <ChartEmpty height={height} label={label} />
  return (
    <figure aria-label={label} className="m-0">
      <div style={{ height }}><EvilBarChart data={rows} config={config} stackType="stacked" barRadius={3} className="aspect-auto h-full w-full">
        <EvilBarChart.Grid />
        <EvilBarChart.XAxis dataKey="category" interval="preserveStartEnd" minTickGap={16} tick={axisTick} />
        <EvilBarChart.YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={unit === 'min' ? (v: number) => (v ? `${tick(v / 60)}h` : '0') : tick} tick={axisTick} />
        <EvilBarChart.Tooltip />
        {ranked.map((_, i) => <EvilBarChart.Bar key={i} dataKey={`s${i}`} />)}
      </EvilBarChart></div>
      <Legend items={ranked} />
    </figure>
  )
}
