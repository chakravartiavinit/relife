import { ArrowUpRight, ChevronDown } from 'lucide-react'
import type { AreaDef } from '@/core/areas'
import { areaScope, loadAreaKpis } from '@/core/areas'
import { loadAreaTrackers } from '@/core/areas/trackers'
import type { User } from '@/core/user'
import { targetRows, TARGET_ROWS_SHOWN, type TargetRow } from '@/domain/target-rows'
import { routineIcon } from '../../routine-icons'
import { CardLink } from '../area/card-link'
import { Card, CardHeader } from '../card'
import { Sparkline } from '../charts'
import { PeekLink } from '../peek/peek-link'
import { Bullet } from './bullet'

// "Against your targets": the first block of an area's Overview. One row per headline number and pinned tracker, in a
// grid of its own (`@container` on the card, so it follows the card and not the window): below 32rem a row stacks like a
// list (name and number, the bar, then target and days on target), from 32rem it is a table row, from 42rem it adds the
// 28-day trend. Every row opens its Peek.

const ROW = 'group grid min-h-[68px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-t border-divider px-5 py-3 @lg:grid-cols-[minmax(0,1.4fr)_6rem_minmax(0,1.2fr)_7.5rem_1.5rem] @2xl:grid-cols-[minmax(0,1.4fr)_6rem_minmax(0,1.2fr)_7.5rem_7rem_1.5rem]'
const COLS = 'hidden h-8 grid-cols-[minmax(0,1.4fr)_6rem_minmax(0,1.2fr)_7.5rem_1.5rem] items-center gap-x-4 border-t border-divider px-5 text-caption text-ink-3 @lg:grid @2xl:grid-cols-[minmax(0,1.4fr)_6rem_minmax(0,1.2fr)_7.5rem_7rem_1.5rem]'

function Row({ r, color, index }: { r: TargetRow; color: string; index: number }) {
  const Icon = routineIcon(r.name, 'routine', '')
  return (
    <PeekLink
      to={r.peek}
      className={`${ROW} transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pill`}
    >
      <span className="flex min-w-0 items-center gap-2.5 text-body font-medium text-ink">
        <Icon aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} />
        <span className="truncate">{r.name}</span>
      </span>
      <span className="min-w-0 text-end @lg:text-start">
        <span className="num text-title whitespace-nowrap text-ink">{r.value}{r.unit ? <span className="ms-0.5 font-sans text-small text-ink-3">{r.unit}</span> : null}</span>
        <span className="hidden text-caption text-ink-3 @lg:block"><span className="line-clamp-2">{r.caption}</span></span>
      </span>
      <span className="col-span-2 @lg:col-span-1">{r.bar ? <Bullet fill={r.bar.fill} mark={r.bar.mark} color={r.bar.meets ? color : undefined} label={r.bar.label} index={index} /> : null}</span>
      <span className="col-span-2 flex justify-between gap-3 text-caption text-ink-3 tabular-nums @lg:hidden"><span className="truncate">{r.caption}</span><span className="shrink-0">{r.onTarget}</span></span>
      <span className="hidden text-small text-ink-2 tabular-nums @lg:block">{r.onTarget}</span>
      <span className="hidden min-w-0 @2xl:block">
        {r.trend?.points ? <Sparkline data={r.trend.points} color={color} height={24} label={`${r.name}, last 28 days`} /> : null}
        {r.trend?.note ? <span className="block text-caption text-ink-3 tabular-nums"><span className="line-clamp-2">{r.trend.note}</span></span> : null}
      </span>
      <ArrowUpRight aria-hidden className="hidden size-4 text-ink-3 transition-colors duration-150 group-hover-fine:text-ink @lg:block" strokeWidth={1.5} />
    </PeekLink>
  )
}

/** The table from rows (what `/dev/ui` draws from fixtures too). */
export function TargetTableView({ rows, color, trendsHref, id = 'targets-heading' }: { rows: TargetRow[]; color: string; trendsHref?: string; id?: string }) {
  const shown = rows.slice(0, TARGET_ROWS_SHOWN)
  const rest = rows.slice(TARGET_ROWS_SHOWN)
  const ranked = rows.some((r) => r.share != null)
  return (
    <Card aria-labelledby={id} className="@container p-0">
      <CardHeader
        className="mb-0 px-5 pt-5 pb-3" title={<span id={id}>Against your targets</span>}
        description={ranked ? 'Last 28 days, highest share on target first' : 'Last 28 days'}
        action={trendsHref ? <CardLink href={trendsHref}>Trends</CardLink> : undefined}
      />
      {rows.length ? (
        <>
          <div aria-hidden className={COLS}><span>Tracker</span><span>28-day average</span><span>Against target</span><span>On target</span><span className="hidden @2xl:block">Last 28 days</span><span /></div>
          <div className="overflow-hidden rounded-b-lg">
            {shown.map((r, i) => <Row key={r.key} r={r} color={color} index={i} />)}
            {rest.length ? (
              <details className="group/more border-t border-divider">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 text-small font-medium text-ink-2 select-none transition-colors duration-150 hover-fine:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
                  <ChevronDown aria-hidden className="size-4 transition-transform duration-150 group-open/more:rotate-180 motion-reduce:transition-none" strokeWidth={1.5} />
                  <span className="group-open/more:hidden">{rest.length} more</span><span className="hidden group-open/more:inline">Show fewer</span>
                </summary>
                <div>{rest.map((r, i) => <Row key={r.key} r={r} color={color} index={shown.length + i} />)}</div>
              </details>
            ) : null}
          </div>
        </>
      ) : <p className="px-5 pb-5 text-small text-ink-3">Nothing to compare yet. Numbers show up here as soon as they are logged or synced.</p>}
    </Card>
  )
}

/** The area's rows from its headline numbers, pinned trackers and trackers with a target. */
export async function TargetTable({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  const [kpis, trackers] = await Promise.all([loadAreaKpis(user, def.slug), loadAreaTrackers(user, def.category!, today)])
  const rows = targetRows({ today, kpis, pinned: def.pinned, trackers, fallback: { type: 'brief', id: areaScope(def) } })
  return <TargetTableView rows={rows} color={def.color} trendsHref={def.tabs.some((t) => t.segment === 'trends') ? `/${def.slug}/trends` : undefined} />
}
