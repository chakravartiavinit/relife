import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '@/core/time'
import { describeChange, describeLink, findChanges, findLinks, spearman, type Signal } from './patterns'

const signal = (id: string, values: number[], end = '2026-11-07', extra: Partial<Signal> = {}): Signal => ({
  id, name: id, area: 'mind', group: id, direction: 'up', ...extra,
  days: new Map(values.map((v, i) => [addDays(end, i - values.length + 1), v])),
})

// A wobbly but repeatable sequence, so tests don't depend on Math.random.
const wave = (n: number, seed: number) => Array.from({ length: n }, (_, i) => 5 + 3 * Math.sin(i * 1.7 + seed) + ((i * 7 + seed) % 3))
// Seeded pseudo-random noise (a small LCG): unrelated to everything else.
const noise = (n: number, seed: number) => Array.from({ length: n }, () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 * 10)

test('spearman is 1 for any rising pair and -1 for opposite', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 35, 90]), 1)
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1)
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), 0)
})

test('findLinks finds a real same-day link and ignores noise and same-group pairs', () => {
  const sleep = wave(40, 1)
  const links = findLinks([
    signal('Sleep', sleep, undefined, { unit: 'h' }),
    signal('Mood', sleep.map((v) => v * 0.8 + 1)),
    signal('Noise', noise(40, 7)),
    signal('Sleep copy', sleep, undefined, { group: 'Sleep' }),
  ])
  assert.ok(!links.some((l) => l.a.id === 'Noise' || l.b.id === 'Noise'))
  assert.ok(!links.some((l) => [l.a.id, l.b.id].sort().join() === 'Sleep,Sleep copy'))
  const l = links.find((x) => x.a.id === 'Sleep' && x.b.id === 'Mood')!
  assert.deepEqual([l.a.id, l.b.id, l.lag], ['Sleep', 'Mood', 0])
  assert.ok(l.rho > 0.9 && l.high > l.low)
  assert.match(describeLink(l), /^On days with more sleep \(over .+ h\): mood .+ on average, vs .+ on other days\.$/)
})

test('findLinks catches next-day effects', () => {
  const late = wave(40, 2)
  // Mood today follows yesterday's late orders, inversely.
  const mood = [5, ...late.slice(0, -1).map((v) => 10 - v)]
  const [l] = findLinks([signal('Late orders', late), signal('Mood', mood)])
  assert.deepEqual([l.a.id, l.b.id, l.lag], ['Late orders', 'Mood', 1])
  assert.ok(l.rho < -0.9)
})

test('findChanges flags this week and names partners that moved with it', () => {
  const base = wave(35, 3)
  const sleep = [...base.slice(0, 28), ...base.slice(28).map((v) => v - 3)]
  const mood = sleep.map((v) => v + 1)
  const flat = signal('Steps', Array(35).fill(8000))
  const s = signal('Sleep', sleep), m = signal('Mood', mood)
  const changes = findChanges([s, m, flat], findLinks([s, m, flat]), '2026-11-07')
  assert.deepEqual(changes.map((c) => c.signal.id).sort(), ['Mood', 'Sleep'])
  const mc = changes.find((c) => c.signal.id === 'Mood')!
  assert.ok(mc.pct < 0)
  assert.deepEqual(mc.with.map((w) => w.signal.id), ['Sleep'])
  assert.match(describeChange(mc), /^Mood down \d+% this week: .* It usually moves with sleep \(down \d+%\)/)
})
