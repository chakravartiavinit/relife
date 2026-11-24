import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { Skeleton } from '@/ui/components/card'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { NotificationSettings } from '@/ui/components/notification-settings'
import { NotificationChannel } from '@/ui/components/notification-channel'
import { env } from '@/core/env'
import { ownerUser } from '@/core/multi-user'
import { telegramConfigured } from '@/core/notify'
import { weeklyNotifications } from '@/core/outbox'
import { pushDeviceCount } from '@/core/push'
import { DEMO_MESSAGE, isDemo } from '@/core/demo'

export const metadata: Metadata = { title: 'Notifications' }

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageGrid aria-busy><GridItem span={{ base: 12, lg: 8 }}><Skeleton className="h-[420px] rounded-lg" /></GridItem><GridItem span={{ base: 12, lg: 4 }}><Skeleton className="h-[360px] rounded-lg" /></GridItem></PageGrid>}>
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
  const telegram = telegramConfigured(user)
  const owner = await ownerUser()
  const link = { bot: !!env('TELEGRAM_BOT_TOKEN'), linked: !!user.profile.telegram?.chatId, member: user.role !== 'owner', owner: owner?.name }
  return (
    <PageGrid className="items-start">
      <GridItem span={{ base: 12, lg: 8 }} className="order-2 grid-lg:order-none"><NotificationSettings initial={user.profile.notifications} both={telegram && pushDevices > 0} /></GridItem>
      <GridItem span={{ base: 12, lg: 4 }} className="order-1 grid-lg:order-none grid-lg:sticky grid-lg:top-6"><NotificationChannel telegram={telegram} stats={stats} pushDevices={pushDevices} locked={isDemo() ? DEMO_MESSAGE : undefined} link={link} /></GridItem>
    </PageGrid>
  )
}
