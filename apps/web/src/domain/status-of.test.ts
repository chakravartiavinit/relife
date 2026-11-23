import { test } from 'node:test'
import assert from 'node:assert/strict'
import { goalPace } from './day-plan'
import { monthPace } from './wealth'
import type { TileSummary } from './metric-tile'
import type { Signal } from './patterns'
import { STATUS_TONE, STATUSES, statusOf, type Status } from './status-of'

const word = (s: Parameters<typeof statusOf>[0]) => statusOf(s).word

test('goal pace: Reached and Ahead are Ahead, On pace is On track, Behind is Behind, Too early is Quiet', () => {
  const g = { met: false, startedOn: '2026-10-01', targetDate: '2026-12-01' }
  const today = '2026-11-01' // half of the time has passed
  assert.equal(word({ from: 'goal', pace: goalPace({ ...g, share: 0.5 }, today) }), 'On track')
  assert.equal(word({ from: 'goal', pace: goalPace({ ...g, share: 0.9 }, today) }), 'Ahead')
  assert.equal(word({ from: 'goal', pace: goalPace({ ...g, share: 0.1 }, today) }), 'Behind')
  assert.equal(word({ from: 'goal', pace: goalPace({ ...g, share: null }, today) }), 'Quiet')
  assert.equal(word({ from: 'goal', pace: goalPace({ ...g, share: 0.1, met: true }, today) }), 'Ahead')
})

const delta = (pct: number, tone: 'good' | 'bad' | 'neutral'): TileSummary['delta'] => ({ diff: pct, pct, tone })
test('trackers: no recent data is Quiet; a 10% move in the better or worse direction is Ahead or Slipping', () => {
  assert.equal(word({ from: 'tracker', tile: { state: 'none', delta: null } }), 'Quiet')
  assert.equal(word({ from: 'tracker', tile: { state: 'quiet', delta: delta(0.3, 'good') } }), 'Quiet')
  assert.equal(word({ from: 'tracker', tile: { state: 'active', delta: null } }), 'Steady')
  assert.equal(word({ from: 'tracker', tile: { state: 'active', delta: delta(0.05, 'good') } }), 'Steady')
  assert.equal(word({ from: 'tracker', tile: { state: 'active', delta: delta(0.2, 'good') } }), 'Ahead')
  assert.equal(word({ from: 'tracker', tile: { state: 'active', delta: delta(-0.2, 'bad') } }), 'Slipping')
  assert.equal(word({ from: 'tracker', tile: { state: 'active', delta: delta(0.4, 'neutral') } }), 'Steady')
})

const signal = (direction: Signal['direction']): Signal => ({ id: 's', name: 'S', area: 'health', group: 's', direction, days: new Map() })
test('changes: the signal direction decides Ahead or Slipping; no direction is Steady', () => {
  assert.equal(word({ from: 'change', change: { signal: signal('up'), pct: 0.2 } }), 'Ahead')
  assert.equal(word({ from: 'change', change: { signal: signal('up'), pct: -0.2 } }), 'Slipping')
  assert.equal(word({ from: 'change', change: { signal: signal('down'), pct: -0.2 } }), 'Ahead')
  assert.equal(word({ from: 'change', change: { signal: signal('none'), pct: 0.5 } }), 'Steady')
})

test('month pace: under usual is Ahead, near it On track, over it Slipping, far over Behind, no usual Quiet', () => {
  const vs = (spent: number) => monthPace(spent, 15, 30, 30000).vsUsual
  assert.equal(word({ from: 'month', vsUsual: vs(12000) }), 'Ahead') // projects 24000: 20% under
  assert.equal(word({ from: 'month', vsUsual: vs(15000) }), 'On track')
  assert.equal(word({ from: 'month', vsUsual: vs(17500) }), 'Slipping') // 35000: 17% over
  assert.equal(word({ from: 'month', vsUsual: vs(21000) }), 'Behind') // 42000: 40% over
  assert.equal(word({ from: 'month', vsUsual: monthPace(9000, 15, 30, null).vsUsual }), 'Quiet')
})

test('every status has a tone, and Quiet is its own ink', () => {
  assert.deepEqual(Object.keys(STATUS_TONE).sort(), [...STATUSES].sort())
  const tones = Object.fromEntries(STATUSES.map((s: Status) => [s, STATUS_TONE[s]]))
  assert.deepEqual(tones, { Ahead: 'good', 'On track': 'good', Steady: 'neutral', Slipping: 'warn', Behind: 'bad', Quiet: 'quiet' })
})
