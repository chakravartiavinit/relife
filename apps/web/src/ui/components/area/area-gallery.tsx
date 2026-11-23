import { Suspense } from 'react'
import { connection } from 'next/server'
import { AREAS } from '@/core/areas'
import { summarizeTracker, type TileTracker } from '@/domain/metric-tile'
import { addDays } from '@/core/time'
import { Skeleton } from '../card'
import { AreaHeader } from './area-header'
import { MetricTile } from './metric-tile'
import { LifeGallery } from '../life/life-gallery'

// /dev/ui: the area template's pieces from fixed data (one fixed "today"), so every tile state can be seen without a database.

const TODAY = '2026-11-12'
const wave = (base: number, amp: number, n = 40, skip = 0) => new Map(Array.from({ length: n }, (_, i) => [addDays(TODAY, -(i + skip)), Math.round((base + Math.sin(i / 2.5) * amp) * 10) / 10] as const))
const tracker = (slug: string, name: string, unit: string | null, over: Partial<TileTracker> = {}): TileTracker => ({ slug, name, unit, target: null, direction: 'up', aggregate: 'last', kind: 'number', ...over })
const sleep = tracker('sleep', 'Sleep', 'h', { target: 7.5, aggregate: 'sum' })

// Recent days a little under the 28 before: the delta is "worse" for a tracker with a target, "neutral" without one.
const falling = new Map([...wave(7.4, 0.3)].map(([d, v], i) => [d, i < 7 ? v - 0.8 : v] as const))
const TILES = [
  { label: 'Better than usual', t: summarizeTracker(tracker('hrv', 'HRV', 'ms', { target: 55 }), new Map([...wave(52, 4)].map(([d, v], i) => [d, i < 7 ? v + 6 : v] as const)), TODAY, { sources: ['oura'] }) },
  { label: 'Worse than usual', t: summarizeTracker(sleep, new Map([...falling]), TODAY, { sources: ['garmin'] }) },
  { label: 'No target: neutral', t: summarizeTracker(tracker('vol', 'Volume lifted', 'kg', { aggregate: 'sum' }), new Map([...wave(4200, 600)].map(([d, v], i) => [d, i < 7 ? v + 900 : v] as const)), TODAY, { sources: ['hevy'] }) },
  { label: 'A note instead of a delta', t: summarizeTracker(tracker('lastfm', 'Songs played', null, { aggregate: 'sum' }), wave(34, 8), TODAY, { sources: ['lastfm'], note: 'Top: Khruangbin' }) },
  { label: 'Stale (sync stopped)', t: summarizeTracker(tracker('weight', 'Weight', 'kg'), wave(71, 0.4, 30, 4), TODAY, { sources: ['withings'] }) },
  { label: 'No data yet', t: summarizeTracker(tracker('body-fat', 'Body fat', '%'), new Map(), TODAY, { sources: [] }) },
]

const health = AREAS.health

export async function AreaGallery() {
  await connection()
  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-2 text-small text-ink-2">Area header (live: its brief line streams in, or the description shows when none is written)</div>
        <Suspense fallback={<Skeleton className="h-[160px] rounded-xl" />}><AreaHeader def={health} /></Suspense>
      </div>
      <div>
        <div className="mb-2 text-small text-ink-2">Metric tiles: every state</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {TILES.map((x) => <div key={x.label} className="min-w-0"><div className="mb-1 truncate text-caption text-ink-3">{x.label}</div><MetricTile t={x.t} color={health.color} /></div>)}
        </div>
      </div>
      <div><div className="mb-2 text-small text-ink-2">Life hub: the balance, the area ledger and Time</div><LifeGallery /></div>
    </div>
  )
}
