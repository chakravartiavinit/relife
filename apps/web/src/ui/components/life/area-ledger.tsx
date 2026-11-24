import { areaOfCategory } from '@/core/areas'
import type { Category } from '@/db/schema'
import { BALANCE_XP } from '@/core/xp'
import { balanceStatus, joinNames } from '@/domain/life-status'
import type { Week } from '@/domain/life-week'
import { formatNumber } from '@/domain/money'
import { Card, Skeleton } from '../card'
import { Fold } from '../fold'
import { StatCard } from '../stat-card'
import { StatusRow } from '../status-row'
import { RowSkeleton } from './area-row'

/**
 * "This week, area by area": the card around the area rows (see `AreaRow`) and Time. `children` are the rows; they
 * divide themselves.
 */
export function AreaLedger({ children }: { children: React.ReactNode }) {
  return (
    <Card aria-labelledby="ledger-h" className="px-5 py-5 grid-md:px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="ledger-h" className="font-display text-heading text-ink">This week, area by area</h2>
        <p className="text-caption text-ink-3">Last 7 days against the 4 before</p>
      </header>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

export function LedgerSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <Card aria-busy className="px-5 py-5 grid-md:px-6">
      <Skeleton className="h-6 w-64" />
      <div className="mt-3 flex flex-col gap-2">{Array.from({ length: rows }, (_, i) => <RowSkeleton key={i} />)}</div>
    </Card>
  )
}

const deltaText = (delta: number | null) => {
  if (delta == null) return 'new'
  const pct = Math.round(Math.abs(delta) * 100)
  return pct === 0 ? 'flat' : `${delta > 0 ? 'up' : 'down'} ${pct}%`
}

/**
 * The week's balance as one stat card: how many areas earned XP ("4 of 6"), a word for it, who is next, and the XP by
 * area folded under it (each area's days active and its change on the same days last week).
 */
export function WeekBalance({ week }: { week: Week }) {
  const elapsed = week.rows[0]?.elapsed ?? 1
  const missing = week.rows.filter((r) => r.activeDays === 0).map((r) => areaOfCategory(r.area as Category).title)
  const total = week.rows.reduce((a, r) => a + r.xp, 0)
  const top = [...week.rows].sort((a, b) => b.xp - a.xp)[0]
  const all = week.areaCount > 0 && week.areasHit === week.areaCount
  return (
    <StatCard
      label="Areas with XP this week" color="var(--pill)" status={balanceStatus({ hit: week.areasHit, count: week.areaCount, elapsed })}
      figure={<>{week.areasHit} of {week.areaCount}</>}
      note={all ? `Every area earned XP: the +${BALANCE_XP} XP balance bonus is yours.` : `${missing.length ? `${joinNames(missing)} next. ` : ''}All ${week.areaCount} by Sunday earns +${BALANCE_XP} XP.`}
    >
      <div className="mt-2 border-t border-divider pt-1">
        <Fold title={total ? `${formatNumber(total)} XP this week` : 'No XP yet this week'} summary={total && top ? `${areaOfCategory(top.area as Category).title} earned most` : undefined}>
          <ul className="pb-1">
            {week.rows.map((r) => {
              const def = areaOfCategory(r.area as Category)
              return (
                <li key={r.area}>
                  <StatusRow
                    picture={{ of: 'area', to: def.slug }} name={def.title} line={`${r.activeDays} of ${r.elapsed} days · ${deltaText(r.delta)}`}
                    trailing={<span className="text-body font-medium text-ink tabular-nums">{formatNumber(r.xp)} XP</span>}
                  />
                </li>
              )
            })}
          </ul>
        </Fold>
      </div>
    </StatCard>
  )
}
