import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { localDate } from '@/core/time'
import { Skeleton } from '@/ui/components/card'
import { NewScheduleButton } from '@/ui/components/forms/schedule-form'
import { RoutinesList } from '@/ui/components/habits/routines-list'

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
    <div>
      <div className="mb-4 flex justify-end"><NewScheduleButton today={localDate(new Date(), user.timezone)} listenToUrl /></div>
      <RoutinesList user={user} />
    </div>
  )
}

function RoutinesSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-4 ml-auto h-10 w-36" />
      <Skeleton className="h-[420px] rounded-lg" />
    </div>
  )
}
