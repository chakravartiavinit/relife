import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { average, fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { Card, CardHeader } from '../card'
import { DailyBars, TrendArea } from '../charts'
import { EmptyState } from '../empty'
import { buttonClass } from '../button'
import { routineIcon } from '../../routine-icons'
import { RoutineArt } from '../routine-art'

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
  const Icon = routineIcon(title, 'routine', '')
  if (!data || data.days.size === 0) {
    return (
      <Card>
        <CardHeader title={title} icon={<Icon strokeWidth={2} />} color={color} />
        <EmptyState
          title={empty.title} description={empty.description} color={color}
          art={(
            // The routine's 3D picture on a soft halo in the area's colour.
            <span aria-hidden className="grid size-24 place-items-center rounded-full" style={{ background: `radial-gradient(circle, color-mix(in oklch, ${color} 18%, transparent) 0%, color-mix(in oklch, ${color} 6%, transparent) 70%)` }}>
              <RoutineArt name={title} kind="routine" area="" className="size-14" />
            </span>
          )}
        />
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
      {/* The headline number already sits in the page's top row, so the card only captions its chart. */}
      <CardHeader
        title={title} icon={<Icon strokeWidth={2} />} color={color}
        description={[
          `${series.length} days`,
          avg == null ? null : `avg ${formatNumber(avg, decimals)}${unit ? ` ${unit}` : ''}`,
          onTarget != null ? `${onTarget} of ${logged.length} on target` : null,
        ].filter(Boolean).join(' · ')}
        action={<Link href={`/trackers/${encodeURIComponent(t.slug)}`} aria-label={`Open ${title}`} className={buttonClass({ variant: 'ghost', size: 'icon-sm' })}><ArrowUpRight className="size-4" strokeWidth={1.5} /></Link>}
      />
      {kind === 'area'
        ? <TrendArea data={series} color={color} unit={unit} target={goal} label={label} domain={domain} curve={t.kind === 'scale' ? 'linear' : 'monotone'} height={200} />
        : <DailyBars data={series} color={color} unit={unit} target={goal} label={label} height={200} />}
    </Card>
  )
}
