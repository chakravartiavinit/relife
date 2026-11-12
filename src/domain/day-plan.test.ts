import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayState, goalPace, greeting, periodOf, planLine, planPeriods, recapLine, xpShare, type PlanRow } from './day-plan'

const row = (time: string, status: PlanRow['status'] = 'pending', name = time): PlanRow => ({ time, name, status })

test('periodOf: 12:00 starts the afternoon, 17:00 the evening, the night folds into the evening', () => {
  assert.equal(periodOf('00:30'), 'morning')
  assert.equal(periodOf('11:59'), 'morning')
  assert.equal(periodOf('12:00'), 'afternoon')
  assert.equal(periodOf('16:59'), 'afternoon')
  assert.equal(periodOf('17:00'), 'evening')
  assert.equal(periodOf('23:59'), 'evening')
})

test('greeting by local hour', () => {
  assert.deepEqual([3, 4, 5, 11, 12, 16, 17, 20, 21, 23].map(greeting), [
    'Still up', 'Still up', 'Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening', 'Good night', 'Good night',
  ])
})

test('xpShare splits 100 XP over the plan and never divides by zero', () => {
  assert.equal(xpShare(0), 0)
  assert.equal(xpShare(4), 25)
  assert.equal(xpShare(16), 6)
})

test('planPeriods: overdue first, then pending by time; done rows kept apart; empty periods left out', () => {
  const rows = [row('09:00', 'done'), row('08:30', 'missed'), row('10:00'), row('07:00', 'skipped'), row('14:00'), row('22:30')]
  const g = planPeriods(rows)
  assert.deepEqual(g.map((p) => p.key), ['morning', 'afternoon', 'evening'])
  assert.deepEqual(g[0].open.map((r) => r.time), ['08:30', '10:00'])
  assert.deepEqual(g[0].closed.map((r) => r.time), ['07:00', '09:00'])
  assert.equal(g[0].summary, '1 overdue · 1 left · 2 done')
  assert.equal(planPeriods([row('14:00')]).length, 1)
})

test('planPeriods: the Now line sits before the first pending row after now, in the period it falls in', () => {
  const rows = [row('08:30', 'missed'), row('14:00'), row('15:00'), row('16:30'), row('19:00')]
  const g = planPeriods(rows, '14:10')
  assert.equal(g[0].nowAt, null)
  assert.equal(g[1].key, 'afternoon')
  assert.deepEqual(g[1].open.map((r) => r.time), ['14:00', '15:00', '16:30'])
  assert.equal(g[1].nowAt, 1)
  assert.equal(g[2].nowAt, null)
})

test('planPeriods: Now after the last row goes at the end; in a period with no rows there is no line', () => {
  assert.equal(planPeriods([row('09:00'), row('10:00')], '10:30')[0].nowAt, 2)
  assert.equal(planPeriods([row('09:00')], '14:00')[0].nowAt, null)
  assert.equal(planPeriods([row('09:00')], undefined)[0].nowAt, null)
})

test('dayState', () => {
  assert.equal(dayState(0, 0), 'empty')
  assert.equal(dayState(5, 2), 'open')
  assert.equal(dayState(5, 5), 'complete')
})

test('planLine and recapLine', () => {
  assert.match(planLine({ total: 0, done: 0 }), /Nothing planned/)
  assert.equal(planLine({ total: 16, done: 6, next: { name: 'Gym', time: '07:00' } }), '6 of 16 done. Next: Gym at 07:00.')
  assert.equal(planLine({ total: 16, done: 6 }), '6 of 16 done.')
  assert.equal(planLine({ total: 3, done: 3 }), 'All 3 done. Nice.')
  assert.equal(recapLine({ total: 16, tomorrow: { name: 'Gym', time: '07:00' } }), 'All 16 done. Tomorrow starts with Gym at 07:00.')
  assert.equal(recapLine({ total: 16 }), 'All 16 done.')
})

test('goalPace: progress against the share of time gone', () => {
  const g = { startedOn: '2026-01-01', targetDate: '2026-01-11' }
  assert.equal(goalPace({ ...g, share: 0.9, met: false }, '2026-01-06').label, 'Ahead')
  assert.equal(goalPace({ ...g, share: 0.45, met: false }, '2026-01-06').label, 'On pace')
  assert.equal(goalPace({ ...g, share: 0.1, met: false }, '2026-01-06').label, 'Behind')
  assert.equal(goalPace({ ...g, share: null, met: false }, '2026-01-06').label, 'Too early')
  assert.equal(goalPace({ ...g, share: 1, met: true }, '2026-01-20').label, 'Reached')
  assert.equal(goalPace({ ...g, share: 0.5, met: false }, '2026-01-06').elapsed, 0.5)
  // Past the target date without reaching it: the whole period has passed, nothing divides by zero.
  assert.equal(goalPace({ startedOn: '2026-01-01', targetDate: '2026-01-01', share: 0.2, met: false }, '2026-02-01').elapsed, 1)
})
