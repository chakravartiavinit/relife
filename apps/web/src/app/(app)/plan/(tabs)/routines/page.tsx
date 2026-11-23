import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { DEMO_MESSAGE, isDemo } from '@/core/demo'
import { getUser } from '@/core/user'
import { localDate } from '@/core/time'
import { Skeleton } from '@/ui/components/card'
import { NewScheduleButton } from '@/ui/components/forms/schedule-form'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { PlanRoutines } from '@/ui/components/habits/routines-list'
import { TemplatesButton } from '@/ui/components/templates/templates-button'

export const metadata: Metadata = { title: 'Routines' }

export default function RoutinesPage() {
  return (
    <Suspense fallback={<RoutinesSkeleton />}>
      <Routines />
    </Suspense>
  )
}

async function Routines() {
  await connection()
  const user = await getUser()
  return (
    <PageGrid>
      <GridItem className="flex flex-wrap justify-end gap-2">
        <TemplatesButton locked={isDemo() ? DEMO_MESSAGE : undefined} />
        <NewScheduleButton today={localDate(new Date(), user.timezone)} listenToUrl />
      </GridItem>
      <GridItem><PlanRoutines user={user} /></GridItem>
    </PageGrid>
  )
}

function RoutinesSkeleton() {
  return (
    <PageGrid aria-busy>
      <GridItem><Skeleton className="ml-auto h-10 w-72" /></GridItem>
      <GridItem><Skeleton className="h-[420px] rounded-lg" /></GridItem>
    </PageGrid>
  )
}
