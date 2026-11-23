import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { Skeleton } from '@/ui/components/card'
import { NewTrackerButton } from '@/ui/components/forms/tracker-forms'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { TrackersGrid } from '@/ui/components/habits/trackers-grid'

export const metadata: Metadata = { title: 'Trackers' }

export default function TrackersPage() {
  return (
    <Suspense fallback={<TrackersSkeleton />}>
      <Trackers />
    </Suspense>
  )
}

async function Trackers() {
  await connection()
  const user = await getUser()
  return (
    <PageGrid>
      <GridItem className="flex justify-end"><NewTrackerButton /></GridItem>
      <GridItem><TrackersGrid user={user} /></GridItem>
    </PageGrid>
  )
}

function TrackersSkeleton() {
  return (
    <PageGrid aria-busy>
      <GridItem><Skeleton className="ml-auto h-10 w-36" /></GridItem>
      <GridItem><Skeleton className="h-[420px] rounded-lg" /></GridItem>
    </PageGrid>
  )
}
