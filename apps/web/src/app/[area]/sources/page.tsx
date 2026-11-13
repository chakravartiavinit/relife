import { connection } from 'next/server'
import { Suspense } from 'react'
import { AREAS, TEMPLATE_SLUGS } from '@/core/areas'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { AreaSources } from '@/ui/components/area/area-sources'
import { Skeleton } from '@/ui/components/card'

export default function AreaSourcesPage({ params }: PageProps<'/[area]/sources'>) {
  return (
    <Suspense fallback={<div aria-busy className="flex flex-col gap-6"><Skeleton className="h-[240px] rounded-lg" /><Skeleton className="h-[200px] rounded-lg" /></div>}>
      <Sources params={params} />
    </Suspense>
  )
}

async function Sources({ params }: Pick<PageProps<'/[area]/sources'>, 'params'>) {
  const slug = (await params).area as (typeof TEMPLATE_SLUGS)[number]
  await connection()
  const user = await getUser()
  return <AreaSources user={user} def={AREAS[slug]} today={localDate(new Date(), user.timezone)} />
}
