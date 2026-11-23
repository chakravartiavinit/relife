import { and, eq, inArray } from 'drizzle-orm'
import { ChartLine, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { connectors } from '@/connectors'
import type { AreaDef } from '@/core/areas'
import { loadAreaTrackers } from '@/core/areas/trackers'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import type { User } from '@/core/user'
import { cn } from '../../cn'
import { Card, Skeleton } from '../card'
import { Connection } from '../connection'
import { GridItem, PageGrid } from '../page-grid'
import { Picture } from '../picture'
import { Rail } from '../rail'
import { AreaLead, LEAD_TRACKERS } from './area-lead'
import { areaPatterns, explaining, patternKey } from './area-patterns'
import { AreaTrackers } from './area-trackers'
import { TodayRoutines } from './area-routines'

/**
 * An Overview tab on the page grid. Main 8 columns: the lead chart with the connection that explains it, "Against your
 * targets" as status rows, then the area's own cards (`children`; Hobbies and People lead with theirs and the rows follow them). Rail 4: the area's
 * own check-in (`railTop`), today's routines, another connection if the area has one, and two link rows: All metrics and
 * Sources. Each block is its own Suspense island with a skeleton of its final size.
 *
 * On a phone the order is the lead, the rows, the rail, then the area's own cards: the main column's wrapper is
 * `display: contents` below 960px, so its blocks take their place in the grid through `order`.
 */
export function OverviewShell({ def, user, today, railTop, trackers = true, children }: { def: AreaDef; user: User; today: string; railTop?: React.ReactNode; trackers?: boolean; children?: React.ReactNode }) {
  const hasLead = !!LEAD_TRACKERS[def.slug]
  return (
    <PageGrid>
      <div className="col-span-full contents min-w-0 grid-lg:col-span-8 grid-lg:flex grid-lg:flex-col grid-lg:gap-6 grid-lg:[&>:last-child]:flex-1">
        {hasLead ? <GridItem className="order-1"><Suspense fallback={<Skeleton className="h-[420px] rounded-lg" />}><AreaLead user={user} def={def} today={today} /></Suspense></GridItem> : null}
        {trackers ? <GridItem className={hasLead ? 'order-2' : 'order-5'}><Suspense fallback={<Skeleton className="h-[420px] rounded-lg" />}><AreaTrackers user={user} def={def} today={today} /></Suspense></GridItem> : null}
        {children ? <GridItem className={cn('@container flex flex-col gap-6 grid-lg:[&>:last-child]:flex-1', hasLead ? 'order-4' : 'order-1')}>{children}</GridItem> : null}
      </div>
      <Rail span={{ base: 12, lg: 4 }} className="order-3 grid-lg:self-start">
        {railTop}
        <Suspense fallback={<Skeleton className="h-[320px] rounded-lg" />}><TodayRoutines user={user} def={def} /></Suspense>
        <Suspense fallback={null}><AlsoMoves user={user} def={def} today={today} /></Suspense>
        <Suspense fallback={<Skeleton className="h-[132px] rounded-lg" />}><LinkRows user={user} def={def} today={today} /></Suspense>
      </Rail>
    </PageGrid>
  )
}

/** The next pattern of the area, other than the one the lead card shows: "Also moves with sleep". Nothing when there is none. */
async function AlsoMoves({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  const all = await areaPatterns(user, def)
  const lead = (LEAD_TRACKERS[def.slug] ?? []).map((s) => explaining(all, `tracker:${s}`)).find(Boolean)
  const next = all.find((p) => !lead || patternKey(p) !== patternKey(lead))
  if (!next) return null
  return (
    <Card as="div" aria-label="Also moves">
      <p className="mb-3 text-label text-ink-2">{'change' in next ? 'Also changed this week' : 'Also moves together'}</p>
      <Connection {...next} today={today} />
    </Card>
  )
}

const DAY = 86_400_000
const ROW = 'grid min-h-14 grid-cols-[32px_minmax(0,1fr)_16px] items-center gap-x-3 px-5 py-2 transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pill'

/** All metrics (every tracker is a row on Trends) and the sources that feed the area, with the one problem if there is one. */
async function LinkRows({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  await connection()
  const [trackers, rows] = await Promise.all([
    loadAreaTrackers(user, def.category!, today),
    def.connectors.length
      ? db.select().from(schema.connections).where(and(eq(schema.connections.userId, (await getUser()).id), eq(schema.connections.enabled, true), inArray(schema.connections.connectorId, def.connectors)))
      : [],
  ])
  const count = trackers.filter((x) => x.tile.state !== 'none').length
  const name = (id: string) => connectors.find((c) => c.id === id)?.name ?? id
  const failing = rows.find((r) => r.status === 'error')
  const stale = rows.filter((r) => r.lastSyncAt && Date.now() - r.lastSyncAt.getTime() > 2 * DAY).sort((a, b) => a.lastSyncAt!.getTime() - b.lastSyncAt!.getTime())[0]
  const problem = failing ? `${name(failing.connectorId)} sync is failing` : stale ? `${name(stale.connectorId)} last synced ${Math.round((Date.now() - stale.lastSyncAt!.getTime()) / DAY)} days ago` : null
  const chevron = <ChevronRight aria-hidden className="size-4 text-ink-3" strokeWidth={1.5} />
  return (
    <Card as="div" className="p-0 *:rounded-none [&>:first-child]:rounded-t-lg [&>:last-child]:rounded-b-lg [&>*+*]:shadow-[0_-1px_0_var(--divider)]">
      <Link href={`/${def.slug}/trends`} className={ROW}>
        <ChartLine aria-hidden className="size-5 justify-self-center text-ink-3" strokeWidth={1.5} />
        <span className="min-w-0"><span className="block text-body font-medium text-ink">All metrics</span><span className="block truncate text-small text-ink-3">{count ? `${count} ${count === 1 ? 'number, opens its trend' : 'numbers, each opens its trend'}` : 'Nothing tracked here yet'}</span></span>
        {chevron}
      </Link>
      <Link href={`/${def.slug}/sources`} className={ROW}>
        <Picture of="connector" id={rows[0]?.connectorId ?? 'laptop'} name={rows[0] ? name(rows[0].connectorId) : undefined} size={32} />
        <span className="min-w-0"><span className="block text-body font-medium text-ink">{rows.length ? `${rows.length} source${rows.length === 1 ? '' : 's'}` : 'No sources yet'}</span><span className={`block truncate text-small ${problem ? 'text-warn-ink' : 'text-ink-3'}`}>{problem ?? (rows.length ? 'All syncing' : 'Connect one to fill this in')}</span></span>
        {chevron}
      </Link>
    </Card>
  )
}
