import { connection } from 'next/server'
import { Suspense } from 'react'
import { AREAS, TEMPLATE_SLUGS } from '@/core/areas'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { OverviewShell } from '@/ui/components/area/overview-shell'
import { CategorySkeleton } from '@/ui/components/category/skeleton'
import { OVERVIEWS } from '@/ui/areas'

/** Overview: the area's own cards, then every metric. Today's routines and the sources summary sit on the right. */
export default function AreaOverviewPage({ params }: PageProps<'/[area]'>) {
  return (
    <Suspense fallback={<CategorySkeleton cards={2} />}>
      <Overview params={params} />
    </Suspense>
  )
}

async function Overview({ params }: Pick<PageProps<'/[area]'>, 'params'>) {
  const slug = (await params).area as (typeof TEMPLATE_SLUGS)[number]
  await connection()
  const user = await getUser()
  const Body = OVERVIEWS[slug]
  return (
    <OverviewShell def={AREAS[slug]} user={user}>
      <Body user={user} today={localDate(new Date(), user.timezone)} />
    </OverviewShell>
  )
}
