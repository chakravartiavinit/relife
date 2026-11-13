import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { Skeleton } from '@/ui/components/card'
import { NewTrackerButton } from '@/ui/components/forms/tracker-forms'
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
    <div>
      <div className="mb-4 flex justify-end"><NewTrackerButton /></div>
      <TrackersGrid user={user} />
    </div>
  )
}

function TrackersSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-4 ml-auto h-10 w-36" />
      <Skeleton className="h-[420px] rounded-lg" />
    </div>
  )
}
