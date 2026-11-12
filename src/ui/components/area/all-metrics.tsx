import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { AreaDef } from '@/core/areas'
import { trackerDays, trackerFacts } from '@/core/metrics'
import { addDays } from '@/core/time'
import type { User } from '@/core/user'
import { orderTiles, summarizeTracker } from '@/domain/metric-tile'
import { buttonClass } from '../button'
import { Card, CardHeader } from '../card'
import { MetricTile } from './metric-tile'

const GRID = 'grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4'

/**
 * Every tracker of an area as a tile, from every source: the connector metrics that used to have no page
 * (HRV, readiness, recovery, strain, body fat, volume lifted, productivity pulse, chess rating, books...) show up
 * on their own, because nothing is filtered by slug. Pinned ones come first, then what has data in the last
 * 14 days, then a collapsed Quiet group. Trackers with no data at all live in Plan → Trackers.
 */
export async function AllMetrics({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  const days = await trackerDays(user, addDays(today, -89), today, { category: def.category! })
  const facts = await trackerFacts(user, addDays(today, -89), today, days.filter((d) => d.days.size).map((d) => d.tracker.id))
  const tiles = days.map((d) => summarizeTracker(d.tracker, d.days, today, facts.get(d.tracker.id)))
  const { shown, quiet } = orderTiles(tiles, def.pinned)
  const count = shown.length + quiet.length
  return (
    <Card className="@container">
      <CardHeader
        title={<>All metrics <span className="ms-1 text-small font-normal text-ink-3 tabular-nums">{count}</span></>}
        description={count ? 'Every number ReLife tracks here, from every source. Tap one for its trend.' : undefined}
        action={<Link href="/plan/trackers" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Trackers</Link>}
      />
      {count ? (
        <>
          <ul className={GRID}>
            {shown.map((t) => <li key={t.slug} className="min-w-0 *:h-full"><MetricTile t={t} color={def.color} /></li>)}
          </ul>
          {quiet.length ? (
            <details className="group mt-4">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-sm text-small font-medium text-ink-2 focus-visible:outline-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4 transition-transform duration-150 group-open:rotate-180" strokeWidth={1.5} aria-hidden />
                Quiet · {quiet.length} with nothing in 14 days
              </summary>
              <ul className={`${GRID} mt-3`}>
                {quiet.map((t) => <li key={t.slug} className="min-w-0 *:h-full"><MetricTile t={t} color={def.color} /></li>)}
              </ul>
            </details>
          ) : null}
        </>
      ) : (
        <p className="text-small text-ink-3">
          Nothing tracked here yet. Connect a source on the <Link href={`/${def.slug}/sources`} className="font-medium text-pill-ink hover:underline">Sources</Link> tab, or log something once from Capture.
        </p>
      )}
    </Card>
  )
}
