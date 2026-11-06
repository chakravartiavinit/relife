import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { average, fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { Card, CardHeader, Stat } from '../card'
import { DailyBars, TrendArea } from '../charts'
import { EmptyState } from '../empty'
import { buttonClass } from '../button'

type Tracked = { tracker: { slug: string; name: string; unit: string | null; target: number | null; direction: 'up' | 'down'; aggregate: 'sum' | 'last'; kind: string }; days: Map<string, number> }

/** A tracker's last N days as a chart plus average and days-on-target. */
export function MetricCard({ data, from, to, color, title, empty, target, chart, decimals = 1, domain }: {
  data: Tracked | undefined
  from: string
  to: string
  color: string
  title: string
  empty: { title: string; description: React.ReactNode }
  target?: number | null
  chart?: 'bars' | 'area'
  decimals?: number
  domain?: [number, number]
}) {
  if (!data || data.days.size === 0) {
    return (
      <Card>
        <CardHeader title={title} />
        <EmptyState title={empty.title} description={empty.description} />
      </Card>
    )
  }
  const t = data.tracker
  // Scale trackers (mood 1–5) have no meaningful "on target" unless the page asks for one.
  const goal = target ?? (t.kind === 'scale' ? null : t.target)
  const series = fillDays(data.days, from, to)
  const avg = average(series.map((p) => p.value))
  const logged = series.filter((p) => p.value != null)
  const onTarget = goal ? logged.filter((p) => (t.direction === 'down' ? p.value! <= goal : p.value! >= goal)).length : null
  const kind = chart ?? (t.aggregate === 'last' ? 'area' : 'bars')
  const unit = t.unit ?? undefined
  const label = `${title}, last ${series.length} days`
  return (
    <Card>
      <CardHeader
        title={title}
        description={`Last ${series.length} days`}
        action={<Link href={`/trackers/${encodeURIComponent(t.slug)}`} aria-label={`Open ${title}`} className={buttonClass({ variant: 'ghost', size: 'icon-sm' })}><ArrowUpRight className="size-4" strokeWidth={1.5} /></Link>}
      />
      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="Average" value={avg == null ? '–' : `${formatNumber(avg, decimals)}${unit ? ` ${unit}` : ''}`} />
        {onTarget != null ? <Stat label={`Days on target (${formatNumber(goal!, decimals)}${unit ? ` ${unit}` : ''})`} value={`${onTarget}/${logged.length}`} /> : null}
      </div>
      {kind === 'area'
        ? <TrendArea data={series} color={color} unit={unit} target={goal} label={label} domain={domain} />
        : <DailyBars data={series} color={color} unit={unit} target={goal} label={label} />}
    </Card>
  )
}
