import { connection } from 'next/server'
import { Suspense } from 'react'
import { AREAS, TEMPLATE_SLUGS } from '@/core/areas'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { OverviewShell } from '@/ui/components/area/overview-shell'
import { OverviewSkeleton } from '@/ui/components/category/skeleton'
import { Skeleton } from '@/ui/components/card'
import { OVERVIEWS, RAIL_TOPS } from '@/ui/areas'

/** Overview: the lead chart and the tracker rows (the area's own cards for Hobbies and People), today's routines and two link rows on the right. */
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
  const Body = OVERVIEWS[slug], RailTop = RAIL_TOPS[slug]
  return (
    <OverviewShell
      def={AREAS[slug]} user={user} today={today} trackers={slug !== 'people'}
      railTop={RailTop ? <Suspense fallback={<Skeleton className="h-[260px] rounded-lg" />}><RailTop user={user} today={today} /></Suspense> : undefined}
    >
      {Body ? <Suspense fallback={<Skeleton className="h-[360px] flex-1 rounded-lg" />}><Body user={user} today={today} /></Suspense> : null}
    </OverviewShell>
  )
}
