import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { AREAS } from '@/core/areas'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { AreaSources } from '@/ui/components/area/area-sources'
import { Skeleton } from '@/ui/components/card'

export const metadata: Metadata = { title: 'Wealth sources' }

export default function WealthSourcesPage() {
  return (
    <Suspense fallback={<div aria-busy className="flex flex-col gap-6"><Skeleton className="h-[240px] rounded-lg" /><Skeleton className="h-[200px] rounded-lg" /></div>}>
      <Sources />
    </Suspense>
  )
}

async function Sources() {
  await connection()
  const user = await getUser()
  return <AreaSources user={user} def={AREAS.wealth} today={localDate(new Date(), user.timezone)} />
}
