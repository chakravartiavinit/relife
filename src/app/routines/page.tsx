import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { localDate } from '@/core/time'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { NewScheduleButton } from '@/ui/components/forms/schedule-form'
import { RoutinesList } from '@/ui/components/habits/routines-list'
import { HeroSkeleton } from '@/ui/components/kit/hero'
import { PageTabs } from '@/ui/components/kit/page-tabs'
import { TABS } from '@/ui/nav-model'

export const metadata: Metadata = { title: 'Routines' }

export default function RoutinesPage({ searchParams }: PageProps<'/routines'>) {
  return (
    <Suspense fallback={<RoutinesSkeleton />}>
      <Routines searchParams={searchParams} />
    </Suspense>
  )
}

async function Routines({ searchParams }: { searchParams: PageProps<'/routines'>['searchParams'] }) {
  await connection()
  const [user, sp] = await Promise.all([getUser(), searchParams])
  const today = localDate(new Date(), user.timezone)
  return (
    <div>
      <PageHeader
        eyebrow="Plan"
        title="Routines"
        description="Routines you do, medicines you take. Each one gets a Telegram reminder and a streak."
        actions={<NewScheduleButton today={today} autoOpen={sp.new === '1'} />}
        tabs={<PageTabs label="Routines" current="/routines" items={TABS['/routines']} />}
      />
      <RoutinesList user={user} />
    </div>
  )
}

function RoutinesSkeleton() {
  return (
    <div aria-busy>
      <HeroSkeleton tabs />
      <Skeleton className="h-[420px] rounded-lg" />
    </div>
  )
}
