import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { localDate } from '@/core/time'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { NewScheduleButton } from '@/ui/components/forms/schedule-form'
import { NewTrackerButton } from '@/ui/components/forms/tracker-forms'
import { RoutinesList } from '@/ui/components/habits/routines-list'
import { TrackersGrid } from '@/ui/components/habits/trackers-grid'
import { cn } from '@/ui/cn'

export const metadata: Metadata = { title: 'Habits' }

const TABS = [
  { key: 'routines', label: 'Routines & medicines' },
  { key: 'trackers', label: 'Trackers' },
] as const

export default function HabitsPage({ searchParams }: PageProps<'/habits'>) {
  return (
    <Suspense fallback={<HabitsSkeleton />}>
      <Habits searchParams={searchParams} />
    </Suspense>
  )
}

async function Habits({ searchParams }: { searchParams: PageProps<'/habits'>['searchParams'] }) {
  await connection()
  const [user, sp] = await Promise.all([getUser(), searchParams])
  const tab = sp.tab === 'trackers' ? 'trackers' : 'routines'
  const today = localDate(new Date(), user.timezone)
  return (
    <div>
      <PageHeader
        eyebrow="Plan"
        title="Habits"
        description="Routines you do and numbers you count. Each routine gets a Telegram reminder and a streak."
        actions={tab === 'trackers' ? <NewTrackerButton /> : <NewScheduleButton today={today} autoOpen={sp.new === '1'} />}
      />
      <nav aria-label="Habits" className="mb-6 inline-flex rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'routines' ? '/habits' : `/habits?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-full px-4 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-150',
              tab === t.key ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover:text-ink',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === 'trackers' ? <TrackersGrid user={user} /> : <RoutinesList user={user} />}
    </div>
  )
}

function HabitsSkeleton() {
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
