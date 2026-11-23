import { Suspense } from 'react'
import { connection } from 'next/server'
import { AREAS } from '@/core/areas'
import { addDays } from '@/core/time'
import { summarizeTracker, type TileTracker } from '@/domain/metric-tile'
import { fillDays } from '@/domain/series'
import type { TargetTracker } from '@/core/areas/trackers'
import { needsLookFirst, trackerLine, trackerStatus } from '@/domain/tracker-row'
import { Card, CardHeader, Skeleton } from '../card'
import { LeadChart } from '../charts'
import { Connection } from '../connection'
import { WealthOverviewView, type WealthOverview } from '../wealth/overview'
import { OverviewSkeleton } from '../category/skeleton'
import { TrackerRows } from './area-trackers'
import { TrendsExplorer, type TrendSeries } from './trends-explorer'

// /dev/ui: the area Overview's new blocks from fixed data (one fixed "today"): the targets table with bars, trend, rows
// without a target, headline-only rows and the "N more" fold; the sleep chart with direct labels; the Wealth Overview.

const TODAY = '2026-11-12'
const wave = (base: number, amp: number, n = 40, skip = 0) => new Map(Array.from({ length: n }, (_, i) => [addDays(TODAY, -(i + skip)), Math.round((base + Math.sin(i / 2.5) * amp) * 10) / 10] as const))
const tr = (slug: string, name: string, unit: string | null, over: Partial<TileTracker> = {}): TileTracker => ({ slug, name, unit, target: null, direction: 'up', aggregate: 'sum', kind: 'number', ...over })
const mk = (t: TileTracker, days: Map<string, number>): TargetTracker => ({ tracker: t, days, tile: summarizeTracker(t, days, TODAY, { sources: ['oura'] }) })

const TRACKERS = [
  mk(tr('sleep.hours', 'Sleep', 'h', { target: 7.5, aggregate: 'last' }), wave(7.1, 0.9)),
  mk(tr('steps', 'Steps', null, { target: 8000 }), wave(7600, 2200)),
  mk(tr('water', 'Drink water', 'ml', { target: 3000 }), wave(2400, 700)),
  mk(tr('weight', 'Weight', 'kg', { target: 72, direction: 'down', aggregate: 'last' }), wave(77.4, 0.6)),
  mk(tr('hrv', 'HRV', 'ms'), wave(52, 6)),
  mk(tr('mood', 'Mood', null, { kind: 'scale', aggregate: 'last' }), wave(3.6, 0.7)),
  mk(tr('exercise.minutes', 'Active minutes', 'min', { target: 30 }), wave(22, 12)),
  mk(tr('resting.hr', 'Resting HR', 'bpm'), wave(58, 3)),
  mk(tr('oura.readiness', 'Readiness', null), wave(78, 7)),
  mk(tr('few', 'Body fat', '%', { target: 18 }), new Map([[TODAY, 20.1], [addDays(TODAY, -3), 20.3]])),
]
const health = AREAS.health
const ROWS = needsLookFirst([
  { key: 'kpi:meds', name: 'Medicines kept', line: '82%, 2 medicines, last 60 days', status: 'On track' as const, picture: { of: 'tracker' as const, name: 'Medicines kept', area: 'health' }, peek: { type: 'brief' as const, id: 'health' } },
  ...TRACKERS.map(({ tracker, tile }) => ({ key: tracker.slug, name: tile.name, line: trackerLine(tracker, tile), status: trackerStatus(tracker, tile), picture: { of: 'tracker' as const, name: tile.name, area: 'health' }, peek: { type: 'metric' as const, id: tracker.slug } })),
])
const SERIES: TrendSeries[] = TRACKERS.map(({ tracker, tile, days }, i) => ({
  tracker, picture: { of: 'tracker', name: tile.name, area: 'health' }, status: trackerStatus(tracker, tile), line: trackerLine(tracker, tile),
  peek: { type: 'metric', id: tracker.slug }, points: fillDays(days, addDays(TODAY, -89), TODAY),
  connection: i === 0 ? <Connection link={{ a: { id: 'routines', name: 'Routines done', area: 'mind', group: 'routines', direction: 'up', days: new Map() }, b: { id: 'tracker:sleep.hours', name: 'Sleep', area: 'health', group: 'sleep', unit: 'h', direction: 'up', days: new Map() }, lag: 1, rho: 0.52, n: 42, high: 7.6, low: 6.8, split: 8 }} /> : null,
}))

const USUAL = ['Rent', 'Shopping', 'Eating out', 'Groceries', 'Health']
const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']
const WEALTH = {
  base: 'INR', today: TODAY, month: '2026-11', months: MONTHS, activeMonths: 4,
  categories: USUAL,
  byMonthCat: new Map(MONTHS.map((m, i) => [m, new Map(USUAL.map((c, j) => [c, i === 0 ? 0 : Math.round(28000 / (j + 1) * (0.8 + i * 0.07))]))])),
  byMonth: new Map(), year: 321369,
  pace: { spent: 82503, day: 12, daysInMonth: 30, usual: 59716, oneOff: 28000, projected: 99091, expected: 23886, vsUsual: 0.66 },
  thisMonthCats: [{ label: 'Shopping', value: 28066 }, { label: 'Rent', value: 28000 }, { label: 'Eating out', value: 10030 }, { label: 'Groceries', value: 3327 }, { label: 'Health', value: 2916 }, { label: 'Subscriptions', value: 2532 }],
  apps: [{ name: 'Rent', orders: 4, total: 112000, last30: 1, avg: 28000 }, { name: 'Amazon', orders: 25, total: 58886, last30: 9, avg: 2355 }, { name: 'Myntra', orders: 18, total: 35622, last30: 6, avg: 1979 }, { name: 'Blinkit', orders: 19, total: 13413, last30: 9, avg: 706 }],
  allTime: [{ category: 'Rent', first: '2026-07-01', orders: 5, total: 140000 }, { category: 'Shopping', first: '2026-07-04', orders: 60, total: 98000 }, { category: 'Eating out', first: '2026-07-04', orders: 90, total: 61000 }],
  repeat: [], subs: {
    monthly: 7864, count: 9, top: [],
    next: [{ schedule: { id: 's1', name: 'GitHub Copilot' }, daysLeft: 9, amount: 10, currency: 'USD' }, { schedule: { id: 's2', name: 'Airtel postpaid' }, daysLeft: 12, amount: 599, currency: 'INR' }, { schedule: { id: 's3', name: 'Netflix' }, daysLeft: 16, amount: 649, currency: 'INR' }],
  },
  invest: { empty: false, worth: 902373, spot: 902373, futures: 0, pnl: 26644, open: 28132, positions: [], coins: [{ asset: 'BTC', value: 394938 }, { asset: 'ETH', value: 313333 }, { asset: 'SOL', value: 166728 }, { asset: 'USDT', value: 27374 }] },
  netWorth: 1407535, history: [], nudges: [], empty: false,
} as unknown as WealthOverview

export async function OverviewGallery() {
  await connection()
  const sleepDays = fillDays(TRACKERS[0].days, addDays(TODAY, -27), TODAY)
  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-2 text-small text-ink-2">Against your targets: status rows with tracker pictures, the ones that need a look first, the fold after six</div>
        <TrackerRows rows={ROWS} trendsHref="/health/trends" />
      </div>
      <div>
        <div className="mb-2 text-small text-ink-2">The lead chart against its target, with the connection that explains it</div>
        <Card className="flex flex-col gap-4">
          <CardHeader className="mb-0" title="Sleep, last 28 nights" description="On target 9 of 28 nights · 7h 18m on average" />
          <LeadChart data={sleepDays} color={health.color} unit="h" reference={{ value: 7.5, label: 'Target' }} label="Sleep, last 28 days" height={240} />
          <div className="rounded-md bg-surface-2 p-4">{SERIES[0].connection}</div>
        </Card>
      </div>
      <div>
        <div className="mb-2 text-small text-ink-2">Trends: pick a tracker row, the chart follows; the 7, 28 and 90 day chips</div>
        <TrendsExplorer series={SERIES} color={health.color} intro="10 trackers from Oura, WHOOP and you" />
      </div>
      <div>
        <div className="mb-2 text-small text-ink-2">Overview skeleton (the shape the page loads into)</div>
        <OverviewSkeleton />
      </div>
      <div>
        <div className="mb-2 text-small text-ink-2">Wealth Overview from a fixture (open the window narrow for the phone folds)</div>
        <Suspense fallback={<Skeleton className="h-[780px] rounded-lg" />}><WealthOverviewView o={WEALTH} logos={{}} /></Suspense>
      </div>
    </div>
  )
}
