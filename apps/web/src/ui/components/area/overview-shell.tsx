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
import { Card, Skeleton } from '../card'
import { TodayRoutines } from './area-routines'

/**
 * An Overview tab: the area's own cards on the left, today's routines (with check-off) and a sources summary on
 * the right. On a phone the routines come first, because checking off is what you open the page for.
 */
export function OverviewShell({ def, user, children }: { def: AreaDef; user: User; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
      <div className="@container order-2 flex min-w-0 flex-col gap-6 lg:order-none lg:col-start-1 lg:row-span-2">{children}</div>
      {def.category ? (
        <div className="order-1 min-w-0 lg:order-none lg:col-start-2">
          <Suspense fallback={<Skeleton className="h-[260px] rounded-lg" />}><TodayRoutines user={user} def={def} /></Suspense>
        </div>
      ) : null}
      <div className="order-3 min-w-0 lg:order-none lg:col-start-2">
        <Suspense fallback={<Skeleton className="h-[84px] rounded-lg" />}><SourcesMini def={def} /></Suspense>
      </div>
    </div>
  )
}

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
    <Card className="p-0">
      <Link href={`/${def.slug}/sources`} className="flex min-h-[72px] items-center gap-3 rounded-lg px-5 py-4 transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill">
        <Cable aria-hidden className="size-5 shrink-0 text-ink-3" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          <span className="block text-heading text-ink">{rows.length ? `${rows.length} source${rows.length === 1 ? '' : 's'}` : 'No sources yet'}</span>
          <span className={`block truncate text-small ${problem ? 'text-warn' : 'text-ink-3'}`}>{problem ? problem.text : rows.length ? 'All syncing' : 'Connect one to fill this in'}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} />
      </Link>
    </Card>
  )
}
