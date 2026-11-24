import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeTracker, type TileTracker } from './metric-tile'
import { leadSummary, needsLookFirst, trackerLine, trackerStatus } from './tracker-row'

const TODAY = '2026-11-23'
const day = (i: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10)
const days = (f: (i: number) => number, n = 30) => new Map(Array.from({ length: n }, (_, i) => [day(i), f(i)] as const))
const sleep: TileTracker = { slug: 'sleep.hours', name: 'Sleep', unit: 'h', target: 7.5, direction: 'up', aggregate: 'sum', kind: 'duration' }
const water: TileTracker = { slug: 'water', name: 'Water', unit: 'L', target: 3, direction: 'up', aggregate: 'sum', kind: 'quantity' }
const mood: TileTracker = { slug: 'mood', name: 'Mood', unit: null, target: null, direction: 'up', aggregate: 'last', kind: 'scale' }

test('a tracker with a target is judged against it; one without, against usual; one gone quiet is Quiet', () => {
  const s = summarizeTracker(sleep, days(() => 6.3), TODAY)
  assert.equal(trackerStatus(sleep, s), 'Slipping')
  assert.equal(trackerLine(sleep, s), '6h 18m a night this week, target 7h 30m')
  const w = summarizeTracker(water, days(() => 2.4), TODAY)
  assert.equal(trackerStatus(water, w), 'Slipping')
  assert.equal(trackerLine(water, w), '2.4 L a day this week, target 3 L')
  const m = summarizeTracker(mood, days((i) => (i < 7 ? 3.5 : 4.1)), TODAY)
  assert.equal(trackerStatus(mood, m), 'Slipping')
  const gone = summarizeTracker(water, new Map([[day(40), 3]]), TODAY)
  assert.equal(trackerStatus(water, gone), 'Quiet')
  assert.equal(trackerLine(water, gone), 'Last seen 40 days ago')
})

test('rows that need a look come first and equal ones keep their order', () => {
  const rows = [{ n: 'a', status: 'Steady' }, { n: 'b', status: 'Quiet' }, { n: 'c', status: 'Behind' }, { n: 'd', status: 'On track' }, { n: 'e', status: 'Slipping' }] as const
  assert.deepEqual(needsLookFirst([...rows]).map((r) => r.n), ['c', 'e', 'a', 'd', 'b'])
})

test('lead summary: days on target against a target, else the average as the usual line', () => {
  const pts = [7, 8, 6, 9].map((value, i) => ({ date: day(3 - i), value }))
  assert.deepEqual(leadSummary(sleep, pts), { reference: { value: 7.5, label: 'Target' }, line: 'On target 2 of 4 nights · 7h 30m on average' })
  assert.deepEqual(leadSummary(mood, [{ date: day(0), value: 4 }, { date: day(1), value: 3 }]), { reference: { value: 3.5, label: 'Usual' }, line: '3.5 on average over 2 days' })
  assert.deepEqual(leadSummary(mood, [{ date: day(0), value: null }]), { reference: null, line: 'No values in this range' })
})
