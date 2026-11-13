'use client'

import { useState } from 'react'
import { average } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { cn } from '../../cn'
import { Card, CardHeader } from '../card'
import { DailyBars, TrendArea, type Point } from '../charts'
import { PeekLink } from '../peek/peek-link'

export type TrendSeries = {
  slug: string; name: string; unit: string | null; target: number | null
  chart: 'area' | 'bars'; scale: boolean
  /** The last 90 days, oldest first; days without a value are null. */
  points: Point[]
}

const RANGES = [7, 28, 90] as const

/**
 * Every tracker of an area as a small multiple. The range switch only slices the 90 days already loaded, so it
 * never goes back to the server.
 */
export function TrendsGrid({ series, color }: { series: TrendSeries[]; color: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(28)
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Range" className="flex gap-1 self-end rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
        {RANGES.map((r) => (
          <button
            key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
            className={cn(
              'h-8 min-w-14 rounded-full px-3 text-small font-medium tabular-nums transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-pill',
              range === r ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover:text-ink',
            )}
          >{r} days</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {series.map((s) => {
          const pts = s.points.slice(-range)
          const avg = average(pts.map((p) => p.value))
          const unit = s.unit ?? undefined
          return (
            <Card key={s.slug}>
              <CardHeader
                title={<PeekLink to={{ type: 'metric', id: s.slug }} className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-pill">{s.name}</PeekLink>}
                description={avg == null ? `No values in ${range} days` : `${range} days · avg ${formatNumber(avg, Math.abs(avg) >= 100 ? 0 : 1)}${unit ? ` ${unit}` : ''}`}
              />
              {s.chart === 'area'
                ? <TrendArea data={pts} color={color} unit={unit} target={s.target} label={`${s.name}, last ${range} days`} domain={s.scale ? [1, 5] : undefined} curve={s.scale ? 'linear' : 'monotone'} height={150} />
                : <DailyBars data={pts} color={color} unit={unit} target={s.target} label={`${s.name}, last ${range} days`} height={150} />}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
