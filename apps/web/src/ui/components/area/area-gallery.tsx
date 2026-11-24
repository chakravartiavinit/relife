import { Suspense } from 'react'
import { connection } from 'next/server'
import { AREAS } from '@/core/areas'
import { Skeleton } from '../card'
import { AreaHeader } from './area-header'
import { LifeGallery } from '../life/life-gallery'

// /dev/ui: the area template's pieces.

const health = AREAS.health

export async function AreaGallery() {
  await connection()
  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-2 text-small text-ink-2">Area header (live: its brief line streams in, or the description shows when none is written)</div>
        <Suspense fallback={<Skeleton className="h-[160px] rounded-xl" />}><AreaHeader def={health} /></Suspense>
      </div>
      <div><div className="mb-2 text-small text-ink-2">Life hub: the balance, the area ledger and Time</div><LifeGallery /></div>
    </div>
  )
}
