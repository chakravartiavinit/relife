import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { Skeleton } from '@/ui/components/card'
import { NotificationSettings } from '@/ui/components/notification-settings'
import { NotificationChannel } from '@/ui/components/notification-channel'
import { telegramConfigured } from '@/core/notify'
import { weeklyNotifications } from '@/core/outbox'
import { pushDeviceCount } from '@/core/push'
import { DEMO_MESSAGE, isDemo } from '@/core/demo'

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
  // Before `npm run db:push` adds push_subscriptions there are simply no push devices.
  const pushDevices = await pushDeviceCount(user.id).catch(() => 0)
  const telegram = telegramConfigured()
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 max-lg:order-2"><NotificationSettings initial={user.profile.notifications} both={telegram && pushDevices > 0} /></div>
      <div className="max-lg:order-1 lg:sticky lg:top-6"><NotificationChannel telegram={telegram} stats={stats} pushDevices={pushDevices} locked={isDemo() ? DEMO_MESSAGE : undefined} /></div>
    </div>
  )
}
