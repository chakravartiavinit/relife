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
    <div>
      {/* Nothing here reads the database, so the hero paints at once and only the grid streams. */}
      <PageHeader
        eyebrow="Plan"
        title="Trackers"
        description="Numbers you count, like water or steps. Log them here, from ⌘K or on Telegram."
        actions={<NewTrackerButton />}
        tabs={<PageTabs label="Routines" current="/routines/trackers" items={TABS['/routines']} />}
      />
      <Suspense fallback={<Skeleton className="h-[420px] rounded-lg" />}>
        <Trackers />
      </Suspense>
    </div>
  )
}

async function Trackers() {
  await connection()
  return <TrackersGrid user={await getUser()} />
}
