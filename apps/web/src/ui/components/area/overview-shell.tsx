import { and, eq, inArray } from 'drizzle-orm'
import { ChevronRight, Cable } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { connectors } from '@/connectors'
import type { AreaDef } from '@/core/areas'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import type { User } from '@/core/user'
import { Skeleton } from '../card'
import { TargetTable } from '../category/target-table'
import { GridItem, PageGrid } from '../page-grid'
import { Rail } from '../rail'
import { AllMetrics } from './all-metrics'
import { TodayRoutines } from './area-routines'

/**
 * An Overview tab on the page grid. Main 8 columns: "Against your targets", then the area's own cards (`children`, its
 * lead chart first). Rail 4: today's routines with the check-off, and the sources summary at its foot; the rail is as tall as
 * its own content (it does not stretch to the main column, which would leave a blank band between the last routine and
 * the sources line when there are few routines), and the main column's last card grows when the rail is the taller one. Full width: All
 * metrics in 6 columns. Each block is its own Suspense island with a skeleton of its final size.
 *
 * On a phone the order is the targets, the routines (the next two, the rest folded), the area's cards, All metrics
 * folded: the main column's wrapper is `display: contents` below 960px, so its blocks take their place in the grid
 * through `order` and from 960px it is one flex column.
 */
export function OverviewShell({ def, user, today, children }: { def: AreaDef; user: User; today: string; children: React.ReactNode }) {
  return (
    <PageGrid>
      <div className="col-span-full contents min-w-0 grid-lg:col-span-8 grid-lg:flex grid-lg:flex-col grid-lg:gap-6 grid-lg:[&>:last-child]:flex-1">
        <GridItem className="order-1"><Suspense fallback={<TargetsSkeleton />}><TargetTable user={user} def={def} today={today} /></Suspense></GridItem>
        <GridItem className="order-3 @container flex flex-col gap-6 grid-lg:[&>:last-child]:flex-1">{children}</GridItem>
      </div>
      <Rail span={{ base: 12, lg: 4 }} className="order-2 grid-lg:self-start">
        <Suspense fallback={<Skeleton className="h-[420px] rounded-lg" />}>
          <TodayRoutines user={user} def={def} foot={<Suspense fallback={<div className="h-[72px]" />}><SourcesMini def={def} /></Suspense>} />
        </Suspense>
      </Rail>
      <GridItem className="order-4"><Suspense fallback={<Skeleton className="h-[68px] rounded-lg grid-md:h-[360px]" />}><AllMetrics user={user} def={def} today={today} /></Suspense></GridItem>
    </PageGrid>
  )
}

/** The targets table's shape while it loads: the head, the column row and six rows. */
export const TargetsSkeleton = () => <Skeleton className="h-[540px] rounded-lg" />

const DAY = 86_400_000

/** How many sources feed the area and the one problem, linking to the Sources tab. */
async function SourcesMini({ def }: { def: AreaDef }) {
  await connection()
  const user = await getUser()
  const rows = def.connectors.length
    ? await db.select().from(schema.connections).where(and(eq(schema.connections.userId, user.id), eq(schema.connections.enabled, true), inArray(schema.connections.connectorId, def.connectors)))
    : []
  const name = (id: string) => connectors.find((c) => c.id === id)?.name ?? id
  const failing = rows.find((r) => r.status === 'error')
  const stale = rows.filter((r) => r.lastSyncAt && Date.now() - r.lastSyncAt.getTime() > 2 * DAY).sort((a, b) => a.lastSyncAt!.getTime() - b.lastSyncAt!.getTime())[0]
  const problem = failing ? { text: `${name(failing.connectorId)} sync is failing` } : stale ? { text: `${name(stale.connectorId)} last synced ${Math.round((Date.now() - stale.lastSyncAt!.getTime()) / DAY)} days ago` } : null
  return (
    <Link href={`/${def.slug}/sources`} className="flex min-h-[72px] items-center gap-3 rounded-b-lg border-t border-divider px-5 py-4 transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pill">
        <Cable aria-hidden className="size-5 shrink-0 text-ink-3" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          <span className="block text-heading text-ink">{rows.length ? `${rows.length} source${rows.length === 1 ? '' : 's'}` : 'No sources yet'}</span>
          <span className={`block truncate text-small ${problem ? 'text-warn' : 'text-ink-3'}`}>{problem ? problem.text : rows.length ? 'All syncing' : 'Connect one to fill this in'}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} />
    </Link>
  )
}
