import { Suspense } from 'react'
import { connection } from 'next/server'
import { AREAS } from '@/core/areas'
import { summarizeTracker, type TileTracker } from '@/domain/metric-tile'
import { buildWeek } from '@/domain/life-week'
import { addDays } from '@/core/time'
import { Skeleton } from '../card'
import { AreaHeader } from './area-header'
import { MetricTile } from './metric-tile'
import { AreaTile, type TileData } from '../life/area-tile'
import { TimeTile } from '../life/time-tile'
import { WeekTable } from '../life/week-table'

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
const KPIS = [{ label: 'Sleep, 7-day avg', value: '6h 10m', tone: 'bad' as const }, { label: 'Steps today', value: '4,210' }, { label: 'Resting HR', value: '58 bpm', tone: 'good' as const }]
const TILE: TileData = {
  def: health, level: { level: 7, progress: 0.4, xp: 1480 }, plan: { done: 3, total: 5 },
  brief: 'Sleep is 40 min under your usual, and 3 of 5 routines are done today.', kpis: KPIS,
  spark: { name: 'Sleep', points: Array.from(wave(7, 0.8, 14), ([date, value]) => ({ date, value })).reverse() },
}
const XP = ['health', 'mind', 'skills', 'wealth'].flatMap((area, a) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((i) => (i + a) % 3 !== 0).map((i) => ({ date: addDays('2026-11-05', i), area, amount: 20 + a * 10 })))
const WEEK = buildWeek(XP, TODAY, ['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships'])

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
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div><div className="mb-2 text-small text-ink-2">Life hub tile, with a brief</div><AreaTile d={TILE} /></div>
        <div><div className="mb-2 text-small text-ink-2">Life hub tile, nothing tracked yet</div><AreaTile d={{ def: AREAS.mind, kpis: [] }} /></div>
      </div>
      <div><div className="mb-2 text-small text-ink-2">Life hub: Time</div><div className="grid"><TimeTile kinds={[{ kind: 'work', seconds: 18 * 3600 }, { kind: 'learning', seconds: 6 * 3600 }, { kind: 'communication', seconds: 4 * 3600 }, { kind: 'social', seconds: 2 * 3600 }, { kind: 'entertainment', seconds: 3600 }]} kpis={[{ label: 'Today', value: '5h 20m' }, { label: 'Focus', value: '3h 05m' }, { label: 'Distraction', value: '45m' }, { label: 'Top place', value: 'GitHub' }]} brief="Focus time is up 20% on your usual week." /></div></div>
      <div><div className="mb-2 text-small text-ink-2">Life hub: the week by area</div><WeekTable week={WEEK} show={['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships']} changes={{ health: { text: 'Sleep 40 min under usual' }, wealth: { text: 'Spending 12% up' } }} /></div>
    </div>
  )
}
