'use client'

import { useMemo } from 'react'
import { AreaChart } from '../dither-kit/area-chart'
import { Area } from '../dither-kit/area'
import { BarChart } from '../dither-kit/bar-chart'
import { Bar } from '../dither-kit/bar'
import { Grid } from '../dither-kit/grid'
import { XAxis } from '../dither-kit/x-axis'
import { YAxis } from '../dither-kit/y-axis'
import { ReferenceLine } from '../dither-kit/reference-line'
import { Tooltip } from '../dither-kit/tooltip'
import { Sparkline as DitherSparkline } from '../dither-kit/sparkline'
import type { DitherColor } from '../dither-kit/palette'
import { interpolateGaps } from '@/domain/series'
import { CHART } from '../tokens'

// Charts render through dither-kit (tripwire.sh/dither-kit): ordered-dither canvas fills,
// one hue per series at varying opacity, so the same colour reads in light and dark.
// Axes and tooltip stay recessive; values in ink, never the series colour.

export type Point = { date: string; value: number | null }

/** Category tokens to dither seeds (see dither-kit/palette.ts). Anything else gets the brand blue. */
function seed(color: string): DitherColor {
  const m = /--cat-(health|mind|skills|wealth|relationships)\b/.exec(color)
  return (m?.[1] as DitherColor | undefined) ?? 'pill'
}

function shortDate(d: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
}

function fmt(v: number, unit?: string) {
  const n = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1, notation: Math.abs(v) >= 10_000 ? 'compact' : 'standard' }).format(v)
  if (unit === '₹') return `₹${n}`
  return unit ? `${n} ${unit}` : n
}

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

const MARGINS = { top: 10, right: 6, bottom: 22, left: 44 }

/** Shared frame: sized figure, grid, axes, optional target line, tooltip. */
function Frame({ kind, data, color, unit, target, height, label, domain }: {
  kind: 'bar' | 'area'; data: Point[]; color: string; unit?: string; target?: number | null; height: number; label: string; domain?: [number, number]
}) {
  const rows = useMemo(() => {
    if (kind === 'bar') return data.map((p) => ({ day: shortDate(p.date), value: p.value ?? 0 }))
    // Areas span logged days only: interior gaps bridged, empty edges trimmed.
    const values = interpolateGaps(data.map((p) => p.value))
    return data.flatMap((p, i) => (values[i] == null ? [] : [{ day: shortDate(p.date), value: values[i]! }]))
  }, [data, kind])
  const config = useMemo(() => ({ value: { label: unit ?? 'Value', color: seed(color) } }), [color, unit])
  const yDomain = useMemo(() => {
    if (domain || kind === 'bar' || !rows.length) return domain
    const vs = rows.map((r) => r.value)
    const lo = Math.min(...vs, target ?? Infinity), hi = Math.max(...vs, target ?? -Infinity)
    const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.1 || 1
    return [Math.max(0, lo - pad), hi + pad] as [number, number]
  }, [domain, kind, rows, target])
  const Chart = kind === 'bar' ? BarChart : AreaChart
  return (
    <figure aria-label={label} className="m-0" style={{ height }}>
      <Chart data={rows} config={config} margins={MARGINS} yDomain={yDomain} animationDuration={700}>
        <Grid />
        {kind === 'bar' ? <Bar dataKey="value" /> : <Area dataKey="value" />}
        {target ? <ReferenceLine y={target} strokeDasharray="3 3" className="stroke-ink-3/70" /> : null}
        <XAxis dataKey="day" maxTicks={6} />
        <YAxis tickFormatter={(v) => fmt(v)} />
        <Tooltip labelKey="day" valueFormatter={(v) => fmt(v, unit)} />
      </Chart>
    </figure>
  )
}

/** Daily values as dithered bars. Optional target as a dashed reference line. */
export function DailyBars({ data, color = CHART.accent, unit, target, height = 180, label }: {
  data: Point[]; color?: string; unit?: string; target?: number | null; height?: number; label: string
}) {
  if (!hasData(data)) return <ChartEmpty height={height} label={label} />
  return <Frame kind="bar" data={data} color={color} unit={unit} target={target} height={height} label={label} />
}

/** A measure over time as a dithered area. Gaps are bridged between logged days. */
export function TrendArea({ data, color = CHART.accent, unit, target, height = 180, label, domain }: {
  data: Point[]; color?: string; unit?: string; target?: number | null; height?: number; label: string; domain?: [number, number]
}) {
  if (!hasData(data)) return <ChartEmpty height={height} label={label} />
  return <Frame kind="area" data={data} color={color} unit={unit} target={target} height={height} label={label} domain={domain} />
}

/** Tiny dithered trend for stat tiles. No axes, no tooltip. */
export function Sparkline({ data, color = CHART.accent, height = 32 }: { data: Point[]; color?: string; height?: number }) {
  const values = useMemo(() => interpolateGaps(data.map((p) => p.value)).filter((v): v is number => v != null), [data])
  return (
    <div aria-hidden style={{ height }}>
      <DitherSparkline data={values} color={seed(color)} />
    </div>
  )
}

/** Ranked horizontal bars (magnitude by category). One hue; labels in ink. */
export function RankedBars({ data, color = CHART.accent, unit, label }: {
  data: { label: string; value: number }[]; color?: string; unit?: string; label: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <figure aria-label={label} className="m-0">
      <ul className="flex flex-col gap-2.5">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]">
            <span className="truncate text-ink-2">{d.label}</span>
            <span className="h-2 rounded-full bg-surface-2">
              <span className="block h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
            </span>
            <span className="text-right font-medium text-ink tabular-nums">{fmt(d.value, unit)}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
