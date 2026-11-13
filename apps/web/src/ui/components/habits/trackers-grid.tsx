import { Activity, ChevronDown } from 'lucide-react'
import { CATEGORIES } from '@/db/schema'
import type { User } from '@/core/user'
import { trackerDays, trackerFacts } from '@/core/metrics'
import { addDays, localDate } from '@/core/time'
import { orderTiles, summarizeTracker } from '@/domain/metric-tile'
import { CATEGORY } from '@/ui/tokens'
import { Card } from '../card'
import { EmptyState } from '../empty'
import { MetricTile } from '../area/metric-tile'

const GRID = 'grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4'

/**
 * Every tracker by area as a `MetricTile` (the tile All metrics uses): latest number, 28-day trend, change on usual,
 * one tap for the Peek where the value is logged. Active ones first; quiet trackers and ones with no data yet fold
 * into a "Quiet" group so a new tracker is still findable. Server component.
 */
export async function TrackersGrid({ user }: { user: User }) {
  const today = localDate(new Date(), user.timezone)
  const all = await trackerDays(user, addDays(today, -89), today)
  if (!all.length) {
    return (
      <Card>
        <EmptyState title="No trackers yet" icon={Activity} color={'var(--pill)'} description="Create one, or type “water 250” in ⌘K and it appears here." />
      </Card>
    )
  }
  const facts = await trackerFacts(user, addDays(today, -89), today, all.filter((d) => d.days.size).map((d) => d.tracker.id))
  const tiles = all.map((d) => ({ category: d.tracker.category, tile: summarizeTracker(d.tracker, d.days, today, facts.get(d.tracker.id)) }))
  return (
    <div className="flex flex-col gap-6">
      {CATEGORIES.map((c) => {
        const mine = tiles.filter((t) => t.category === c).map((t) => t.tile)
        if (!mine.length) return null
        const { shown, quiet } = orderTiles(mine, [])
        const folded = [...quiet, ...mine.filter((t) => t.state === 'none')]
        const color = CATEGORY[c].color
        return (
          <Card key={c} as="section" aria-labelledby={`cat-${c}`} className="@container">
            <h2 id={`cat-${c}`} className="mb-3 flex items-center gap-2 text-heading font-semibold text-ink">
              <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
              {CATEGORY[c].label}
              <span className="text-small font-normal text-ink-3 tabular-nums">{mine.length}</span>
            </h2>
            {shown.length ? (
              <ul className={GRID}>{shown.map((t) => <li key={t.slug} className="min-w-0 *:h-full"><MetricTile t={t} color={color} /></li>)}</ul>
            ) : null}
            {folded.length ? (
              <details className={shown.length ? 'group mt-4' : 'group'} open={!shown.length}>
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-sm text-small font-medium text-ink-2 focus-visible:outline-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-4 transition-transform duration-150 group-open:rotate-180" strokeWidth={1.5} aria-hidden />
                  Quiet · {folded.length} with nothing in 14 days
                </summary>
                <ul className={`${GRID} mt-3`}>{folded.map((t) => <li key={t.slug} className="min-w-0 *:h-full"><MetricTile t={t} color={color} /></li>)}</ul>
              </details>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}
