import { connection } from 'next/server'
import { addDays } from '@/core/time'
import type { loadTime } from '@/core/areas/time'
import type { ActivityKind } from '@/domain/activity'
import type { Link, Signal } from '@/domain/patterns'
import type { schema } from '@/db'
import { TimeBoard } from '@/app/(app)/time/time-board'
import { LibraryRow } from './library'

// "Time" in /dev/ui: the page body from fixtures, in both themes, with today's numbers filled in (the mock data has
// none for today) and a sleep → next-day deep work connection.

const TODAY = '2026-11-23'
const DAYS = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i - 6))
const min = (n: number) => n * 60

// Minutes per kind for each of the last 7 days (today so far last).
const PER_DAY: Partial<Record<ActivityKind, number>>[] = [
  { learning: 95, work: 150, communication: 60, social: 40, entertainment: 30 },
  { learning: 120, work: 165, communication: 45, social: 30, entertainment: 20 },
  { learning: 70, work: 140, communication: 80, social: 70, entertainment: 50 },
  { learning: 60, work: 120, communication: 55, social: 50, entertainment: 40, news: 15 },
  { learning: 20, work: 30, communication: 10, social: 80, entertainment: 110 },
  { learning: 25, work: 55, communication: 20, social: 60, entertainment: 70 },
  { learning: 92, work: 65, communication: 75, social: 18, entertainment: 30, shopping: 8 },
]

const byDay = new Map(DAYS.map((d, i) => [d, new Map(Object.entries(PER_DAY[i]).map(([k, v]) => [k as ActivityKind, min(v as number)]))]))
const byKind = [...[...byDay.values()].reduce((acc, m) => { for (const [k, v] of m) acc.set(k, (acc.get(k) ?? 0) + v); return acc }, new Map<ActivityKind, number>())]
  .map(([kind, seconds]) => ({ kind, label: kind, seconds })).sort((a, b) => b.seconds - a.seconds)
const total = byKind.reduce((a, k) => a + k.seconds, 0)
const place = (name: string, source: 'browser' | 'mac', kind: ActivityKind, mins: number) => ({ name, source, kind, seconds: min(mins), kinds: new Map([[kind, min(mins)]]) })
const places = [
  place('developer.mozilla.org', 'browser', 'learning', 469), place('x.com', 'browser', 'social', 366), place('Visual Studio Code', 'mac', 'work', 355),
  place('slack.com', 'browser', 'communication', 305), place('youtube.com', 'browser', 'entertainment', 234), place('github.com', 'browser', 'work', 231), place('leetcode.com', 'browser', 'learning', 145),
]
const KIND_LABEL: Record<string, string> = { learning: 'Learning', work: 'Deep work', social: 'Social media', communication: 'Messages & email', entertainment: 'Entertainment', news: 'News', shopping: 'Shopping' }

const T = {
  s: {
    total, rows: 400,
    byKind: byKind.map((k) => ({ ...k, label: KIND_LABEL[k.kind] ?? k.kind })),
    places,
    pages: [{ title: 'Designing Data-Intensive Applications, chapter 6', place: 'developer.mozilla.org', source: 'browser' as const, kind: 'learning' as const, seconds: min(74) }],
    placesByKind: new Map(byKind.map((k) => [k.kind, places.filter((p) => p.kind === k.kind).slice(0, 2).map((p) => ({ name: p.name, source: p.source, seconds: p.seconds }))])),
    byDay,
  },
  from: DAYS[0], days: DAYS, tracked: 7,
  todayKinds: byDay.get(TODAY)!, todayTotal: [...byDay.get(TODAY)!.values()].reduce((a, b) => a + b, 0),
  focusToday: min(92 + 65), distractToday: min(48), focusAvg: min(171),
} as unknown as Awaited<ReturnType<typeof loadTime>>

const series = (id: string, name: string, area: string, f: (i: number) => number, unit: string): Signal => ({
  id, name, area, group: id, unit, direction: 'up',
  days: new Map(Array.from({ length: 41 }, (_, i) => [addDays(TODAY, i - 40), f(i)] as const)),
})
const sleep = series('tracker:sleep.hours', 'Sleep', 'health', (i) => 7 + 0.8 * Math.sin(i * 0.9), 'h')
const deep = series('tracker:screen.work', 'Deep work', 'skills', (i) => 140 + 30 * Math.sin(i * 0.9 + 0.8), 'min')
const LINK: Link = { a: sleep, b: deep, lag: 1, rho: 0.52, n: 41, high: 168, low: 112, split: 7.5 }

const ITEMS = [
  { id: 'g1', kind: 'course', title: '100xDevs Cohort 3', provider: 'Harkirat Singh', url: 'https://100xdevs.com', image: false, status: 'active', progressDone: 34, progressTotal: 120, minutesLogged: 2140, lastActiveAt: new Date(`${addDays(TODAY, -1)}T12:00:00Z`), cost: 6000, currency: 'INR', meta: {} },
  { id: 'g2', kind: 'course', title: 'Backend path', provider: 'boot.dev', url: 'https://boot.dev', image: false, status: 'active', progressDone: 18, progressTotal: 42, minutesLogged: 1250, lastActiveAt: new Date(`${addDays(TODAY, -3)}T12:00:00Z`), cost: null, currency: null, meta: {} },
  { id: 'g3', kind: 'book', title: 'Designing Data-Intensive Applications', provider: null, url: '', image: false, status: 'active', progressDone: 6, progressTotal: 12, minutesLogged: 640, lastActiveAt: new Date(`${addDays(TODAY, -12)}T12:00:00Z`), cost: null, currency: null, meta: {} },
] as unknown as (typeof schema.learningItems.$inferSelect)[]

function Pane({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div data-theme={theme} className="flex min-w-0 flex-col gap-4 rounded-xl bg-bg p-5 text-ink shadow-1">
      <p className="text-caption text-ink-3">{theme === 'light' ? 'Light' : 'Dark'}</p>
      <TimeBoard
        t={T} today={TODAY} link={{ link: LINK, today: TODAY }}
        library={<div className="flex flex-col">{ITEMS.map((i) => <LibraryRow key={i.id} item={i} episodes={[]} timeZone="Asia/Kolkata" />)}</div>}
      />
    </div>
  )
}

/** Async: the library rows read the clock ("opened 2 d ago"), so the page must be rendered per request. */
export async function TimeGallery() {
  await connection()
  return (
    <div className="flex flex-col gap-6">
      <Pane theme="light" />
      <Pane theme="dark" />
    </div>
  )
}
