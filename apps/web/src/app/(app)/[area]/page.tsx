import { connection } from 'next/server'
import { Suspense } from 'react'
import { AREAS, TEMPLATE_SLUGS } from '@/core/areas'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { OverviewShell } from '@/ui/components/area/overview-shell'
import { OverviewSkeleton } from '@/ui/components/category/skeleton'
import { Skeleton } from '@/ui/components/card'
import { OVERVIEWS } from '@/ui/areas'

/** Overview: the targets table and the area's own cards on the left, today's routines and the sources line on the right, every metric below. */
export default function AreaOverviewPage({ params }: PageProps<'/[area]'>) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview params={params} />
    </Suspense>
  )
}

async function Overview({ params }: Pick<PageProps<'/[area]'>, 'params'>) {
  const slug = (await params).area as (typeof TEMPLATE_SLUGS)[number]
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const Body = OVERVIEWS[slug]
  return (
    <OverviewShell def={AREAS[slug]} user={user} today={today}>
      <Suspense fallback={<Skeleton className="h-[360px] flex-1 rounded-lg" />}><Body user={user} today={today} /></Suspense>
    </OverviewShell>
  )
}
