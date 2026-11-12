import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { z } from 'zod'
import { Clock } from 'lucide-react'
import { buttonClass } from '@/ui/components/button'
import { Card, Skeleton } from '@/ui/components/card'
import { ApproveCard } from '@/ui/components/devices/approve-card'
import { requestById } from '@/core/auth/pairing'
import { toWaiting } from '@/core/auth/device-view'

export const metadata: Metadata = { title: 'Approve a device' }

// The Mac app and the extension open this (`/pair/approve?r=<id>`) in the default browser, where the owner is already
// signed in: one click to approve. A visitor without a session never gets here: the proxy sends them to /signin.

export default function ApprovePage({ searchParams }: PageProps<'/pair/approve'>) {
  return (
    <div className="mx-auto flex max-w-[520px] flex-col pt-4 lg:pt-12">
      <Suspense fallback={<Skeleton className="h-[460px] rounded-xl" />}>
        <Request searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Request({ searchParams }: { searchParams: PageProps<'/pair/approve'>['searchParams'] }) {
  await connection()
  const id = z.uuid().safeParse((await searchParams).r)
  const p = id.success ? await requestById(id.data) : null
  if (!p) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-surface-2 text-ink-3"><Clock className="size-6" strokeWidth={1.5} /></span>
        <h1 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">This request is no longer open</h1>
        <p className="max-w-[40ch] text-[13.5px] text-ink-3">It expired, or someone already answered it. Ask the device to connect again, and a new request will show up here.</p>
        <Link href="/settings/devices" className={buttonClass({ variant: 'secondary' })}>Open Devices</Link>
      </Card>
    )
  }
  return <Card className="rounded-xl p-6 shadow-3"><ApproveCard device={toWaiting(p)} /></Card>
}
