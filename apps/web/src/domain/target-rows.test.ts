import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeTracker, type TileTracker } from './metric-tile'
import { targetRows, type TargetTracker } from './target-rows'

const TODAY = '2026-11-12'
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10)
const tracker = (o: Partial<TileTracker>): TileTracker => ({ slug: 't', name: 'T', unit: null, target: null, direction: 'up', aggregate: 'sum', kind: 'number', ...o })
/** `n` days ending today with the values from `f(i)`, i = days back. */
const series = (t: TileTracker, n: number, f: (i: number) => number): TargetTracker => {
  const days = new Map(Array.from({ length: n }, (_, i) => [day(i), f(i)] as const))
  return { tracker: t, days, tile: summarizeTracker(t, days, TODAY, { sources: ['manual'] }) }
}
const rows = (trackers: TargetTracker[], over: Partial<Parameters<typeof targetRows>[0]> = {}) =>
  targetRows({ today: TODAY, kpis: [], pinned: [], trackers, fallback: { type: 'brief', id: 'health' }, ...over })

test('a tracker row: 28-day average, days on target and a bar with the target mark inside the track', () => {
  const sleep = series(tracker({ slug: 'sleep.hours', name: 'Sleep', unit: 'h', target: 8 }), 28, (i) => (i < 10 ? 8 : 6))
  const [r] = rows([sleep], { pinned: ['sleep.hours'] })
  assert.equal(r.name, 'Sleep')
  assert.equal(r.onTarget, '10 of 28 nights')
  assert.equal(r.caption, 'target 8h 00m')
  assert.ok(r.bar && r.bar.mark! < 1 && r.bar.fill < r.bar.mark!)
  assert.equal(r.bar!.meets, false)
  assert.deepEqual(r.peek, { type: 'metric', id: 'sleep.hours' })
})

test('a tracker that is a headline number becomes its tracker row, at the headline position', () => {
  const steps = series(tracker({ slug: 'steps', name: 'Steps', target: 8000 }), 28, () => 9000)
  const list = rows([steps], { kpis: [
    { label: 'Medicines kept', value: '84%', sub: '2 medicines', ratio: 0.84 },
    { label: 'Steps, 7-day avg', value: '9,000', peek: { type: 'metric', id: 'steps' } },
  ] })
  assert.deepEqual(list.map((r) => r.key), ['steps', 'kpi:Medicines kept'])
  assert.equal(list[0].share, 1)
  assert.equal(list[1].bar?.fill, 0.84)
  assert.equal(list[1].onTarget, null)
  assert.equal(list[1].caption, '2 medicines')
})

test('rows with a share come first, highest first; the rest keep their order', () => {
  const a = series(tracker({ slug: 'a', name: 'A', target: 10 }), 28, (i) => (i < 5 ? 10 : 1))
  const b = series(tracker({ slug: 'b', name: 'B', target: 10 }), 28, (i) => (i < 20 ? 10 : 1))
  const hrv = series(tracker({ slug: 'hrv', name: 'HRV' }), 28, () => 50)
  const list = rows([hrv, a, b], { pinned: ['hrv', 'a', 'b'] })
  assert.deepEqual(list.map((r) => r.key), ['b', 'a', 'hrv'])
  assert.equal(list[2].bar, null)
  assert.equal(list[2].caption, 'no target')
})

test('pinned trackers without data are left out; any other tracker with a target is added', () => {
  const quiet = series(tracker({ slug: 'q', name: 'Quiet', target: 5 }), 3, () => 5)
  const old = { ...quiet, days: new Map([[day(40), 5]]), tile: summarizeTracker(quiet.tracker, new Map([[day(40), 5]]), TODAY) }
  const extra = series(tracker({ slug: 'weight', name: 'Weight', target: 72, direction: 'down', aggregate: 'last', unit: 'kg' }), 28, () => 77)
  const list = rows([old, extra], { pinned: ['q'] })
  assert.deepEqual(list.map((r) => r.key), ['weight'])
  assert.equal(list[0].onTarget, '0 of 28 weigh-ins')
  assert.equal(list[0].bar!.meets, false)
  assert.match(list[0].trend!.note!, /latest$/)
})

test('a scale tracker gets a bar out of 5 and no target', () => {
  const mood = series(tracker({ slug: 'mood', name: 'Mood', kind: 'scale', aggregate: 'last' }), 20, () => 4)
  const [r] = rows([mood], { pinned: ['mood'] })
  assert.equal(r.bar?.fill, 0.8)
  assert.equal(r.bar?.mark, null)
  assert.equal(r.caption, 'out of 5')
  assert.equal(r.onTarget, null)
})

test('a trend needs three logged days; the note stays', () => {
  const few = series(tracker({ slug: 'x', name: 'X', target: 1 }), 2, () => 1)
  const [r] = rows([few], { pinned: ['x'] })
  assert.equal(r.trend?.points, null)
  assert.ok(r.trend?.note)
})

test('a headline number with a tracker but no target stays as the area computes it, with the tracker trend', () => {
  const contacts = series(tracker({ slug: 'people.contacts', name: 'People contacted' }), 20, () => 1)
  const [r] = rows([contacts], { kpis: [{ label: 'Catch-ups, 30 days', value: '6', peek: { type: 'metric', id: 'people.contacts' } }] })
  assert.equal(r.name, 'Catch-ups, 30 days')
  assert.equal(r.value, '6')
  assert.ok(r.trend?.points)
  assert.equal(rows([contacts], { kpis: [{ label: 'Catch-ups, 30 days', value: '6', peek: { type: 'metric', id: 'people.contacts' } }] }).length, 1)
})
