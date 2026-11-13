import brand from '@relife/brand/brand.json'
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
import { isDemo } from '@/core/demo'
import { inContainer } from '@/core/platform'
import { EmptyState } from '@/ui/components/empty'
import { MonitorOff } from 'lucide-react'

export const metadata: Metadata = { title: 'Devices' }

export default function DevicesPage({ searchParams }: PageProps<'/you/settings/devices'>) {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Devices" description={`Everything signed in to your ${brand.name}. Disconnect anything you don’t recognise.`} actions={<ConnectButton />} />
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

async function Devices({ searchParams }: { searchParams: PageProps<'/you/settings/devices'>['searchParams'] }) {
  await connection()
  if (isDemo()) return <DevicesOff />
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
      container={inContainer()}
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

/** The read-only demo has no devices: nobody signs in. */
function DevicesOff() {
  return <EmptyState icon={MonitorOff} title="Devices are off in the demo" description="Nobody signs in to the demo, so there is nothing to connect or disconnect. Run your own copy to pair your phone and laptop." />
}
