import { connection } from 'next/server'
import { Suspense } from 'react'
import { AREAS, TEMPLATE_SLUGS } from '@/core/areas'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { AreaRoutines } from '@/ui/components/area/area-routines'
import { Skeleton } from '@/ui/components/card'

export default function AreaRoutinesPage({ params }: PageProps<'/[area]/routines'>) {
  return (
    <Suspense fallback={<div aria-busy className="flex flex-col gap-6"><Skeleton className="h-[200px] rounded-lg" /><Skeleton className="h-[320px] rounded-lg" /></div>}>
      <Routines params={params} />
    </Suspense>
  )
}

async function Routines({ params }: Pick<PageProps<'/[area]/routines'>, 'params'>) {
  const slug = (await params).area as (typeof TEMPLATE_SLUGS)[number]
  await connection()
  const user = await getUser()
  return <AreaRoutines user={user} def={AREAS[slug]} today={localDate(new Date(), user.timezone)} />
}
