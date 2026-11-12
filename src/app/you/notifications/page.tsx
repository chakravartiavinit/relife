import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { Skeleton } from '@/ui/components/card'
import { NotificationSettings } from '@/ui/components/notification-settings'

export const metadata: Metadata = { title: 'Notifications' }

export default function NotificationsPage() {
  return (
    <Suspense fallback={<div aria-busy><Skeleton className="h-[420px] max-w-3xl rounded-lg" /></div>}>
      <Notifications />
    </Suspense>
  )
}

async function Notifications() {
  await connection()
  const user = await getUser()
  return (
    <div className="max-w-3xl">
      <NotificationSettings initial={user.profile.notifications} />
    </div>
  )
}
