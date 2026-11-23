import type { AreaDef } from '@/core/areas'
import { BALANCE_XP } from '@/core/xp'
import type { Week } from '@/domain/life-week'
import { cn } from '../../cn'
import { Card, Skeleton } from '../card'
import { KPI_COLS, LEDGER_COLS, RowSkeleton } from './area-row'

/**
 * The area ledger: the six area tiles and “This week, area by area” in one list, one row per area (see `AreaRow`).
 * `children` are the rows, each in its own Suspense island so the numbers stream in one by one. The column heads show
 * from 960px, where the rows are three columns wide.
 */
export function AreaLedger({ children }: { children: React.ReactNode }) {
  return (
    <Card aria-labelledby="ledger-h" className="p-5 pb-1 grid-md:px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="ledger-h" className="text-heading text-ink">This week, area by area</h2>
        <p className="text-small text-ink-3">Monday to Sunday. Deltas compare with the same days of last week.</p>
      </header>
      <div aria-hidden className={cn(LEDGER_COLS, 'mt-3 hidden border-b border-divider pb-2 text-caption text-ink-3 grid-lg:grid')}>
        <span>Area</span>
        <span className={cn(KPI_COLS, 'items-end')}><span className="col-span-3">How it’s going</span><span>14-day trend</span></span>
        <span>This week</span>
      </div>
      <ul className="divide-y divide-divider">{children}</ul>
    </Card>
  )
}

export function LedgerSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card aria-busy className="p-5 pb-1 grid-md:px-6">
      <Skeleton className="h-5 w-56" />
      <div className="mt-3 divide-y divide-divider">{Array.from({ length: rows }, (_, i) => <RowSkeleton key={i} />)}</div>
    </Card>
  )
}

/**
 * The head's right-hand block: how many areas earned XP this week, one dot each in the area's colour (grey until it
 * does), and the rule for the +50 XP balance bonus.
 */
export function WeekBalance({ week, areas }: { week: Week; areas: AreaDef[] }) {
  const hit = (d: AreaDef) => (week.rows.find((r) => r.area === d.category)?.activeDays ?? 0) > 0
  const hitAll = week.areaCount > 0 && week.areasHit === week.areaCount
  return (
    <Card as="div" className="flex flex-col gap-1 p-4">
      <p className="text-small text-ink-3">This week</p>
      <div className="flex items-center justify-between gap-3">
        <p className="text-heading text-ink tabular-nums">{week.areasHit} of {week.areaCount} areas</p>
        <span role="img" aria-label={`${areas.filter(hit).map((d) => d.title).join(', ') || 'No area'} earned XP`} className="flex items-center gap-1.5">
          {areas.map((d) => <span key={d.slug} title={d.title} className={cn('size-2.5 rounded-full', !hit(d) && 'bg-ink/15')} style={hit(d) ? { background: d.color } : undefined} />)}
        </span>
      </div>
      <p className="text-small text-ink-3">{hitAll ? `Every area earned XP: the +${BALANCE_XP} XP balance bonus is yours.` : `Earn XP in every area in a week for +${BALANCE_XP} XP.`}</p>
    </Card>
  )
}

export const SummarySkeleton = () => <Skeleton className="h-[102px] rounded-lg" />
