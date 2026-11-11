import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { NewTrackerButton } from '@/ui/components/forms/tracker-forms'
import { TrackersGrid } from '@/ui/components/habits/trackers-grid'
import { PageTabs } from '@/ui/components/kit/page-tabs'
import { TABS } from '@/ui/nav-model'

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
      <PageHeader
        eyebrow="Plan"
        title="Trackers"
        description="Numbers you count, like water or steps. Log them here, from ⌘K or on Telegram."
        actions={<NewTrackerButton />}
        tabs={<PageTabs label="Routines" current="/routines/trackers" items={TABS['/routines']} />}
      />
      <TrackersGrid user={user} />
    </div>
  )
}

function TrackersSkeleton() {
  return (
    <div aria-busy>
      <div className="mb-8 flex items-end justify-between">
        <div><Skeleton className="h-7 w-20 rounded-full" /><Skeleton className="mt-3 h-10 w-48" /><Skeleton className="mt-3 h-5 w-96 max-w-full" /></div>
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="mb-6 h-11 w-72 rounded-full" />
      <Skeleton className="h-[420px] rounded-lg" />
    </div>
  )
}
