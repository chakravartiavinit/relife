import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { Skeleton } from '@/ui/components/card'
import { NotificationSettings } from '@/ui/components/notification-settings'
import { NotificationChannel } from '@/ui/components/notification-channel'
import { telegramConfigured } from '@/core/notify'
import { weeklyNotifications } from '@/core/outbox'

export const metadata: Metadata = { title: 'Notifications' }

export default function NotificationsPage() {
  return (
    <Suspense fallback={<div aria-busy><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><Skeleton className="h-[420px] rounded-lg" /><Skeleton className="h-[360px] rounded-lg" /></div></div>}>
      <Notifications />
    </Suspense>
  )
}

async function Notifications() {
  await connection()
  const user = await getUser()
  const stats = await weeklyNotifications(user).catch(() => ({ sent: 0, held: 0, skipped: 0 }))
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 max-lg:order-2"><NotificationSettings initial={user.profile.notifications} /></div>
      <div className="max-lg:order-1 lg:sticky lg:top-6"><NotificationChannel telegram={telegramConfigured()} stats={stats} /></div>
    </div>
  )
}
