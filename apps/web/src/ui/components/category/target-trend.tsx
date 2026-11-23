'use client'

import { useMemo } from 'react'
import { EvilLineChart } from '@/components/evilcharts/charts/recharts-line-chart'
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart'
import { interpolateGaps, niceAxis } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { cn } from '../../cn'
import type { Point } from '../charts'

// A measure against its target over time, labelled on the chart itself: a filled dot is a day on target, a hollow one a
// day under it, the dashed line says "Target" at its end and the last value is written beside the last dot. Days
// without a value are joined by the line but get no dot. Built on the same EvilLineChart as `TrendArea`.

const shortDate = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
const withUnit = (v: number, unit?: string) => `${formatNumber(v, 1)}${unit ? (unit.length > 2 ? ` ${unit}` : unit) : ''}`
const axisTick = { fontSize: 12, fill: 'var(--ink-3)' }
type Row = Record<string, string | number | null>
type Dot = { cx?: number; cy?: number; payload?: { real: number; value: number }; index?: number }
type Lab = { x?: number | string; y?: number | string; index?: number }

/** What the dots and the dashed line mean, for the head of the card. */
export function TargetTrendLegend({ target, unit, color, className }: { target: number; unit?: string; color: string; className?: string }) {
  return (
    <ul aria-label="Legend" className={cn('flex flex-wrap justify-end gap-x-4 gap-y-1 text-caption text-ink-2', className)}>
      <li className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: color }} />On target</li>
      <li className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full border-[1.5px] bg-surface" style={{ borderColor: color }} />Under</li>
      <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0 w-3.5 border-t border-dashed border-ink-2" />Target {withUnit(target, unit)}</li>
    </ul>
  )
}

export function TargetTrend({ data, target, unit, color, label, direction = 'up', height = 260, targetLabel = 'Target' }: {
  data: Point[]; target: number; unit?: string; color: string; label: string; direction?: 'up' | 'down'; height?: number
  /** What the dashed line is called at its end (`Usual` for a line that is not a target). */
  targetLabel?: string
}) {
  const { rows, axis, config, last } = useMemo(() => {
    const first = data.findIndex((p) => p.value != null)
    const end = data.findLastIndex((p) => p.value != null)
    const span = first < 0 ? [] : data.slice(first, end + 1)
    const values = interpolateGaps(span.map((p) => p.value))
    const rows: Row[] = span.map((p, i) => ({ day: shortDate(p.date), value: values[i] as number, goal: target, real: p.value != null ? 1 : 0 }))
    const axis = niceAxis(Math.min(target, ...values.filter((v): v is number => v != null)), Math.max(target, ...values.filter((v): v is number => v != null)))
    const config: ChartConfig = { value: { label: unit ? `Value (${unit})` : 'Value', colors: { light: [color], dark: [color] } }, goal: { label: 'Target', colors: { light: ['var(--ink-3)'], dark: ['var(--ink-3)'] } } }
    return { rows, axis, config, last: rows.length - 1 }
  }, [data, target, unit, color])
  if (rows.length < 2) return <figure aria-label={`${label}: no data yet`} className="m-0 grid place-items-center rounded-md bg-surface-2 text-small text-ink-3" style={{ height }}>Not enough days yet</figure>
  // The last value and the target's name share the right margin: when the two lines end close together (under 8% of the axis) the value goes above and the name below, or the reverse.
  const lastValue = Number(rows[rows.length - 1].value)
  const [lo, hi] = axis.domain ?? [Math.min(target, lastValue), Math.max(target, lastValue)]
  const close = Math.abs(lastValue - target) < 0.08 * (hi - lo || 1)
  const valueShift = close ? (lastValue >= target ? -8 : 8) : 0
  const meets = (v: number) => (direction === 'down' ? v <= target : v >= target)
  return (
    <figure aria-label={label} className="m-0" style={{ height }}>
      <EvilLineChart data={rows} config={config} curveType="monotone" className="aspect-auto h-full w-full" chartProps={{ margin: { top: 12, right: 52, bottom: 0, left: 0 } }}>
        <EvilLineChart.Grid />
        <EvilLineChart.XAxis dataKey="day" interval="preserveStartEnd" minTickGap={32} tick={axisTick} />
        <EvilLineChart.YAxis domain={axis.domain} ticks={axis.ticks} tickFormatter={(v: number) => withUnit(v, unit)} tick={axisTick} />
        <EvilLineChart.Tooltip />
        <EvilLineChart.Line
          dataKey="value" connectNulls
          lineProps={{
            dataKey: 'value',
            dot: ({ cx, cy, payload, index }: Dot) => (
              cx == null || cy == null || !payload?.real ? <g key={index} /> : <circle key={index} cx={cx} cy={cy} r={meets(payload.value) ? 3.5 : 3} fill={meets(payload.value) ? color : 'var(--surface)'} stroke={color} strokeWidth={1.5} />
            ),
            label: ({ x, y, index }: Lab) => (index === last ? <text key="last" x={Number(x) + 8} y={Number(y) + 4 + valueShift} fontSize={13} fontWeight={500} fill="var(--ink)">{withUnit(Number(rows[last].value), unit)}</text> : <g key={index} />),
          }}
        />
        <EvilLineChart.Line
          dataKey="goal" strokeVariant="dashed" strokeWidth={1.5}
          lineProps={{
            dataKey: 'goal', stroke: 'var(--ink-2)', dot: false,
            label: ({ x, y, index }: Lab) => (index === last ? <text key="goal" x={Number(x) + 8} y={Number(y) + 4 - valueShift} fontSize={12} fill="var(--ink-2)">{targetLabel}</text> : <g key={index} />),
          }}
        />
      </EvilLineChart>
    </figure>
  )
}
