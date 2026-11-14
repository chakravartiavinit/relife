import brand from '@relife/brand/brand.json'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { headers } from 'next/headers'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { SettingsRail } from '@/ui/components/settings-rail'
import { PhoneSetup } from '@/ui/components/devices/phone-setup'
import { loadReach } from '@/core/auth/reach'
import { isPhoneUa } from '@/core/auth/names'
import { isDemo } from '@/core/demo'
import { EmptyState } from '@/ui/components/empty'
import { MonitorOff } from 'lucide-react'

export const metadata: Metadata = { title: 'Use on your phone' }

export default function PhonePage() {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Use on your phone" description={`Open ${brand.name} on your phone, add it to your Home Screen and get reminders there.`} />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-12">
        <SettingsRail current="devices" />
        <div className="flex max-w-4xl min-w-0 flex-col gap-10">
          <Suspense fallback={<PhoneSkeleton />}>
            <Phone />
          </Suspense>
        </div>
      </div>
    </>
  )
}

async function Phone() {
  await connection()
  // The demo has no devices, and the page would list this server's own network addresses.
  if (isDemo()) return <EmptyState icon={MonitorOff} title="Phones are off in the demo" description="Nobody signs in to the demo, so there is nothing to pair or notify. Run your own copy to use it on your phone." />
  const h = await headers()
  const reach = await loadReach(h)
  return <PhoneSetup reach={reach} phone={isPhoneUa(h.get('user-agent') ?? '')} />
}

/** Three option rows and the code, the size of what replaces them. */
function PhoneSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[92px] rounded-[16px]" />)}</div>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]"><Skeleton className="h-[380px] rounded-lg" /><Skeleton className="h-[380px] rounded-lg" /></div>
    </div>
  )
}
