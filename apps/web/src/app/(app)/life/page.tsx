import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { loadLifeHub } from '@/core/life-hub'
import { formatDay } from '@/core/time'
import { getUser } from '@/core/user'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { Rail } from '@/ui/components/rail'
import { Skeleton, SystemLabel } from '@/ui/components/card'
import { InsightLine } from '@/ui/components/insight-line'
import { AreaLedger, LedgerSkeleton, WeekBalance } from '@/ui/components/life/area-ledger'
import { AreaRow } from '@/ui/components/life/area-row'
import { ConnectionsCard } from '@/ui/components/life/connections-card'

export const metadata: Metadata = { title: 'Life' }

/**
 * The Life hub: one sentence across the areas, one status row per area (and Time) with its level, the week's balance and up
 * to two connections that cross areas. Per-area numbers, trends and week dots live on the area pages and in their Peek.
 */
export default function LifePage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<HeadSkeleton />}><Head /></Suspense>
      <PageGrid>
        <GridItem span={{ base: 12, lg: 8 }} className="self-start">
          <Suspense fallback={<LedgerSkeleton />}><Areas /></Suspense>
        </GridItem>
        <Rail span={{ base: 12, lg: 4 }} pairs as="aside" aria-label="This week across areas" className="self-start">
          <Suspense fallback={<Skeleton className="h-[330px] rounded-lg" />}><Connections /></Suspense>
          <Suspense fallback={<Skeleton className="h-[250px] rounded-lg" />}><Balance /></Suspense>
        </Rail>
      </PageGrid>
    </div>
  )
}

/** The date label, the title and the opening sentence with a Why? that opens today's brief. */
async function Head() {
  await connection()
  const user = await getUser()
  const hub = await loadLifeHub(user)
  return (
    <header>
      <SystemLabel>{formatDay(hub.today, { weekday: 'long', day: 'numeric', month: 'long' })}</SystemLabel>
      <h1 className="mt-1.5 font-display text-hero text-ink">Life</h1>
      <InsightLine className="mt-2 max-w-[64ch]" peek={hub.brief ? { type: 'brief', id: 'today' } : undefined}>{hub.opening}</InsightLine>
    </header>
  )
}

function HeadSkeleton() {
  return (
    <div aria-busy className="grid gap-1">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="mt-1.5 h-10 w-32 grid-md:h-12" />
      <Skeleton className="mt-2 h-[22px] w-full max-w-[64ch]" />
    </div>
  )
}

async function Areas() {
  await connection()
  const hub = await loadLifeHub(await getUser())
  return (
    <AreaLedger>
      {hub.rows.map((r) => <AreaRow key={r.def.slug} d={r} />)}
      <AreaRow d={{ def: hub.timeRow.def, status: hub.timeRow.status, line: hub.timeRow.line, kinds: hub.timeRow.kinds }} />
    </AreaLedger>
  )
}

async function Connections() {
  await connection()
  const hub = await loadLifeHub(await getUser())
  return <ConnectionsCard items={hub.connections} today={hub.today} />
}

async function Balance() {
  await connection()
  const hub = await loadLifeHub(await getUser())
  return <WeekBalance week={hub.week} />
}
