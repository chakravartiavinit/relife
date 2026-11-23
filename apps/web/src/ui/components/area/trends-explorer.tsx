'use client'

import { useState } from 'react'
import type { PeekRef } from '@/domain/peek'
import type { Status } from '@/domain/status-of'
import { leadSummary } from '@/domain/tracker-row'
import type { TileTracker } from '@/domain/metric-tile'
import type { PictureRef } from '../../picture'
import { buttonLinkClass } from '../button'
import { Card, CardHeader } from '../card'
import { type Point, LeadChart } from '../charts'
import { Chip } from '../chip'
import { PeekLink } from '../peek/peek-link'
import { StatusRow } from '../status-row'
import { StatusWord } from '../status-word'

export type TrendSeries = {
  tracker: TileTracker
  picture: PictureRef
  status: Status
  /** The row's one plain line (\"6.8 h a night this week, target 7.5 h\"). */
  line: string
  peek: PeekRef
  /** The last 90 days, oldest first; days without a value are null. */
  points: Point[]
  /** The connection that explains this tracker, drawn on the server. */
  connection: React.ReactNode
}

const RANGES = [7, 28, 90] as const

/**
 * The Trends tab: the area's trackers as status rows; the one you pick draws as the lead chart, with the 7, 28 or 90 day
 * chips and the connection that explains it. The range only slices the 90 days already loaded, so nothing goes back to the server.
 */
export function TrendsExplorer({ series, color, intro }: { series: TrendSeries[]; color: string; intro: React.ReactNode }) {
  const [slug, setSlug] = useState(series[0].tracker.slug)
  const [range, setRange] = useState<(typeof RANGES)[number]>(28)
  const s = series.find((x) => x.tracker.slug === slug) ?? series[0]
  const points = s.points.slice(-range)
  const { reference, line } = leadSummary(s.tracker, points)
  const t = s.tracker
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 text-small text-ink-3">{intro}</p>
        <div role="group" aria-label="Range" className="flex gap-1.5">
          {RANGES.map((r) => <Chip key={r} selected={range === r} onClick={() => setRange(r)}>{r} days</Chip>)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 grid-lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card aria-labelledby="trackers-heading" className="grid-lg:self-start">
          <CardHeader title={<span id="trackers-heading">Trackers</span>} />
          {series.map((x) => (
            <StatusRow key={x.tracker.slug} picture={x.picture} name={x.tracker.name} line={x.line} status={x.status} selected={x.tracker.slug === s.tracker.slug} onSelect={() => setSlug(x.tracker.slug)} />
          ))}
        </Card>
        <Card aria-labelledby="chart-heading" className="order-first flex flex-col gap-4 grid-lg:order-none">
          <CardHeader
            className="mb-0" title={<span id="chart-heading">{t.name}, last {range} {t.slug.startsWith('sleep') ? 'nights' : 'days'}</span>} description={line}
            action={<span className="flex items-center gap-3"><StatusWord status={s.status} /><PeekLink to={s.peek} className={buttonLinkClass('text-small')}>See the days</PeekLink></span>}
          />
          <LeadChart data={points} color={color} unit={t.unit ?? undefined} reference={reference ?? undefined} direction={t.direction} label={`${t.name}, last ${range} days`} height={400} />
          {s.connection ? <div className="rounded-md bg-surface-2 p-4">{s.connection}</div> : null}
        </Card>
      </div>
    </div>
  )
}
