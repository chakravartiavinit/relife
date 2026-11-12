import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orderTiles, summarizeTracker, type TileTracker } from './metric-tile'

const TODAY = '2026-11-12'
const day = (back: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10)
const tracker = (o: Partial<TileTracker> = {}): TileTracker => ({ slug: 't', name: 'T', unit: null, target: null, direction: 'up', aggregate: 'sum', kind: 'number', ...o })
const days = (entries: [number, number][]) => new Map(entries.map(([back, v]) => [day(back), v]))
/** `n` days ending `from` days ago, all the same value. */
const run = (from: number, n: number, v: number): [number, number][] => Array.from({ length: n }, (_, i) => [from + i, v])

test('sum trackers show today; last trackers show the latest logged value', () => {
  const steps = summarizeTracker(tracker({ slug: 'steps' }), days([[0, 5412], [1, 8000]]), TODAY)
  assert.equal(steps.latest, 5412)
  assert.equal(steps.latestDate, TODAY)
  // nothing today: a sum tracker has no latest, the average still reads
  const quietToday = summarizeTracker(tracker(), days([[1, 8000], [2, 6000]]), TODAY)
  assert.equal(quietToday.latest, null)
  assert.equal(quietToday.avg7, 7000)
  const weight = summarizeTracker(tracker({ aggregate: 'last', unit: 'kg' }), days([[3, 72.6], [9, 73]]), TODAY)
  assert.equal(weight.latest, 72.6)
  assert.equal(weight.latestDate, day(3))
})

test('7-day average skips days with no value', () => {
  const s = summarizeTracker(tracker(), days([[0, 10], [2, 20], [8, 1000]]), TODAY)
  assert.equal(s.avg7, 15)
})

test('delta compares the last 7 days with the 28 before, and needs data on both sides', () => {
  const t = tracker({ target: 7.5, aggregate: 'last' })
  const d = summarizeTracker(t, days([...run(0, 7, 6), ...run(7, 28, 8)]), TODAY).delta!
  assert.equal(d.diff, -2)
  assert.equal(d.pct, -0.25)
  assert.equal(d.tone, 'bad')
  assert.equal(summarizeTracker(t, days(run(0, 7, 6)), TODAY).delta, null)
  assert.equal(summarizeTracker(t, days([...run(0, 1, 6), ...run(7, 28, 8)]), TODAY).delta, null)
  // under 1% is not a change
  assert.equal(summarizeTracker(t, days([...run(0, 7, 100), ...run(7, 28, 100.5)]), TODAY).delta, null)
})

test('delta tone follows the direction, and is neutral without a goal', () => {
  const data = days([...run(0, 7, 6), ...run(7, 28, 8)])
  assert.equal(summarizeTracker(tracker({ target: 3, direction: 'down' }), data, TODAY).delta!.tone, 'good')
  assert.equal(summarizeTracker(tracker({ target: 3 }), data, TODAY).delta!.tone, 'bad')
  assert.equal(summarizeTracker(tracker(), data, TODAY).delta!.tone, 'neutral')
  // a 1–5 scale is directed even without a target
  assert.equal(summarizeTracker(tracker({ kind: 'scale' }), data, TODAY).delta!.tone, 'bad')
})

test('state: active within 14 days, quiet after, none with no data', () => {
  assert.equal(summarizeTracker(tracker(), days([[14, 1]]), TODAY).state, 'active')
  assert.equal(summarizeTracker(tracker(), days([[15, 1]]), TODAY).state, 'quiet')
  assert.equal(summarizeTracker(tracker(), new Map(), TODAY).state, 'none')
  assert.equal(summarizeTracker(tracker(), days([[15, 1]]), TODAY).daysSince, 15)
})

test('sparkline covers 28 days ending today with gaps as null', () => {
  const s = summarizeTracker(tracker(), days([[0, 4], [27, 2], [28, 9]]), TODAY)
  assert.equal(s.spark.length, 28)
  assert.equal(s.spark.at(-1)!.value, 4)
  assert.equal(s.spark[0].value, 2)
  assert.equal(s.spark[10].value, null)
  assert.equal(s.daysLogged, 2)
})

test('stale: a synced tracker 2+ days old; typed-in ones never', () => {
  const old = days([[3, 5]])
  assert.equal(summarizeTracker(tracker(), old, TODAY, { sources: ['withings'] }).stale, true)
  assert.equal(summarizeTracker(tracker(), old, TODAY, { sources: ['manual'] }).stale, false)
  assert.equal(summarizeTracker(tracker(), old, TODAY, { sources: ['withings', 'manual'] }).stale, false)
  assert.equal(summarizeTracker(tracker(), days([[1, 5]]), TODAY, { sources: ['withings'] }).stale, false)
})

test('the note passes through', () => {
  assert.equal(summarizeTracker(tracker(), days([[0, 3]]), TODAY, { note: 'Radiohead' }).note, 'Radiohead')
  assert.equal(summarizeTracker(tracker(), days([[0, 3]]), TODAY).note, null)
})

test('order: pinned first, synced before manual, quiet apart, empty dropped', () => {
  const mk = (slug: string, d: Map<string, number>, sources: string[]) => summarizeTracker(tracker({ slug, name: slug }), d, TODAY, { sources })
  const tiles = [
    mk('weight', days(run(0, 20, 1)), ['manual']),
    mk('hrv', days(run(0, 10, 1)), ['oura']),
    mk('steps', days(run(0, 25, 1)), ['apple']),
    mk('sleep', days(run(0, 5, 1)), ['oura']),
    mk('old', days([[40, 1]]), ['manual']),
    mk('never', new Map(), []),
    mk('stale-pin', days([[40, 1]]), ['oura']),
  ]
  const { shown, quiet } = orderTiles(tiles, ['sleep', 'stale-pin', 'missing'])
  assert.deepEqual(shown.map((t) => t.slug), ['sleep', 'steps', 'hrv', 'weight'])
  // a pinned tracker that has gone quiet is not pinned any more
  assert.deepEqual(quiet.map((t) => t.slug), ['stale-pin', 'old'])
})
