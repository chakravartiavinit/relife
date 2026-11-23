import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { AreaDef } from '@/core/areas'
import { trackerDays, trackerFacts } from '@/core/metrics'
import { addDays } from '@/core/time'
import type { User } from '@/core/user'
import { orderTiles, summarizeTracker } from '@/domain/metric-tile'
import { Fold } from '../fold'
import { CardLink } from './card-link'
import { MetricTile } from './metric-tile'

// A tile is a cell of one table: hairlines between cells (the grid's own outer edge is clipped by its wrapper), six to a row on a laptop.
const GRID = '-me-px -mb-px grid grid-cols-2 @md:grid-cols-3 @4xl:grid-cols-6'
const CELL = 'min-w-0 border-e border-b border-divider bg-surface *:h-full'

/**
 * Every tracker of an area as a tile, from every source: the connector metrics that used to have no page
 * (HRV, readiness, recovery, strain, body fat, volume lifted, productivity pulse, chess rating, books...) show up
 * on their own, because nothing is filtered by slug. Pinned ones come first, then what has data in the last
 * 14 days, then a collapsed Quiet group. Trackers with no data at all live in Plan → Trackers.
 * On a phone the whole block is a fold (the targets table above already has the numbers that matter).
 */
export async function AllMetrics({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  const days = await trackerDays(user, addDays(today, -89), today, { category: def.category! })
  const facts = await trackerFacts(user, addDays(today, -89), today, days.filter((d) => d.days.size).map((d) => d.tracker.id))
  const tiles = days.map((d) => summarizeTracker(d.tracker, d.days, today, facts.get(d.tracker.id)))
  const { shown, quiet } = orderTiles(tiles, def.pinned)
  const count = shown.length + quiet.length
  return (
    <Fold
      inline card defaultOpen={!count}
      title={<>All metrics <span className="ms-1 text-small text-ink-3 tabular-nums">{count}</span></>}
      summary={count ? 'Every number from every source' : 'Nothing tracked here yet'}
    >
      <div className="hidden items-start justify-between gap-4 pt-4 grid-md:flex">
        <div>
          <h2 className="text-heading text-ink">All metrics <span className="ms-1 text-small text-ink-3 tabular-nums">{count}</span></h2>
          {count ? <p className="mt-0.5 text-small text-ink-3">Every number {brand.name} tracks here, from every source. Tap one for its trend.</p> : null}
        </div>
        <CardLink href="/plan/trackers">Trackers</CardLink>
      </div>
      <div className="@container grid-md:pt-4">
        {count ? (
          <>
            <div className="overflow-hidden rounded-md border border-divider"><ul className={GRID}>
              {shown.map((t) => <li key={t.slug} className={CELL}><MetricTile flat t={t} color={def.color} /></li>)}
            </ul></div>
            {quiet.length ? (
              <details className="group mt-4">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-sm text-small font-medium text-ink-2 focus-visible:outline-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-4 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" strokeWidth={1.5} aria-hidden />
                  Quiet · {quiet.length} with nothing in 14 days
                </summary>
                <div className="mt-3 overflow-hidden rounded-md border border-divider"><ul className={GRID}>
                  {quiet.map((t) => <li key={t.slug} className={CELL}><MetricTile flat t={t} color={def.color} /></li>)}
                </ul></div>
              </details>
            ) : null}
          </>
        ) : (
          <p className="text-small text-ink-3">
            Nothing tracked here yet. Connect a source on the <Link href={`/${def.slug}/sources`} className="font-medium text-pill-ink hover:underline">Sources</Link> tab, or log something once from Capture.
          </p>
        )}
      </div>
    </Fold>
  )
}
