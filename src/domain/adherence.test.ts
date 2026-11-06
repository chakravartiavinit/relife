import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adherenceRate, dayStatus, scheduleStreak, type DayStatus } from './adherence'

test('day status from checks and time', () => {
  const now = new Date('2026-01-05T12:00:00Z')
  const a = new Date('2026-01-05T08:00:00Z')
  const b = new Date('2026-01-05T20:00:00Z')
  assert.equal(dayStatus([], () => undefined, now), 'none')
  assert.equal(dayStatus([a, b], (o) => (o === a ? 'done' : undefined), now), 'partial')
  assert.equal(dayStatus([a], () => undefined, now), 'missed')
  assert.equal(dayStatus([b], () => undefined, now), 'pending')
  assert.equal(dayStatus([a, b], () => 'done', now), 'done')
  assert.equal(dayStatus([a], () => 'skipped', now), 'skipped')
})

test('streak ignores unscheduled days and pending today', () => {
  const m = new Map<string, DayStatus>([
    ['2026-01-07', 'pending'], ['2026-01-06', 'none'], ['2026-01-05', 'done'],
    ['2026-01-04', 'skipped'], ['2026-01-03', 'done'], ['2026-01-02', 'missed'], ['2026-01-01', 'done'],
  ])
  assert.equal(scheduleStreak(m, '2026-01-07'), 2)
  assert.equal(adherenceRate(['done', 'missed', 'skipped', 'none', 'done']), 2 / 3)
  assert.equal(adherenceRate(['none', 'pending']), null)
})
