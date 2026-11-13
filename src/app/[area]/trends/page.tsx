import { connection } from 'next/server'
import { Suspense } from 'react'
import { AREAS, TEMPLATE_SLUGS } from '@/core/areas'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { AreaTrends } from '@/ui/components/area/area-trends'
import { CategorySkeleton } from '@/ui/components/category/skeleton'

export default function AreaTrendsPage({ params }: PageProps<'/[area]/trends'>) {
  return (
    <Suspense fallback={<CategorySkeleton cards={4} />}>
      <Trends params={params} />
    </Suspense>
  )
}

async function Trends({ params }: Pick<PageProps<'/[area]/trends'>, 'params'>) {
  const slug = (await params).area as (typeof TEMPLATE_SLUGS)[number]
  await connection()
  const user = await getUser()
  return <AreaTrends user={user} def={AREAS[slug]} today={localDate(new Date(), user.timezone)} />
}
