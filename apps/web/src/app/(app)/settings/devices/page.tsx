import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { headers } from 'next/headers'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { SettingsRail } from '@/ui/components/settings-rail'
import { ConnectButton } from '@/ui/components/devices/connect-button'
import { DevicesPanel } from '@/ui/components/devices/devices-panel'
import { listDevices } from '@/core/auth/devices'
import { toListItem, toWaiting } from '@/core/auth/device-view'
import { mode } from '@/core/auth/mode'
import { pendingRequests } from '@/core/auth/pairing'
import { viewerDevice } from '@/core/auth/viewer'
import { isLoopbackHost } from '@/core/auth/trust'
import { getUser } from '@/core/user'

export const metadata: Metadata = { title: 'Devices' }

export default function DevicesPage({ searchParams }: PageProps<'/settings/devices'>) {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Devices" description="Everything signed in to your ReLife. Disconnect anything you don’t recognise." actions={<ConnectButton />} />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-12">
        <SettingsRail current="devices" />
        <div className="flex max-w-3xl min-w-0 flex-col gap-10">
          <Suspense fallback={<DevicesSkeleton />}>
            <Devices searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </>
  )
}

async function Devices({ searchParams }: { searchParams: PageProps<'/settings/devices'>['searchParams'] }) {
  await connection()
  const user = await getUser()
  const me = await viewerDevice()
  const q = await searchParams
  const [devices, waiting] = await Promise.all([listDevices(user.id), pendingRequests()])
  return (
    <DevicesPanel
      initial={devices.map((d) => toListItem(d, me?.id ?? null))}
      waiting={waiting.map(toWaiting)}
      requireSignIn={!!user.profile.requireSignIn}
      loopbackTrust={mode() === 'self-host' && isLoopbackHost((await headers()).get('host'))}
      approveCode={typeof q.approve === 'string' ? q.approve.slice(0, 16) : undefined}
      openConnect={q.connect !== undefined}
    />
  )
}

function DevicesSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy>
      <Skeleton className="h-[340px] rounded-lg" />
    </div>
  )
}
