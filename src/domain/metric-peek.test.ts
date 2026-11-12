import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '@/core/time'
import { METRIC_DAYS, metTarget, summarizeMetric } from './metric-peek'

const today = '2026-11-12'

test('the series is 90 days, oldest first, with gaps left empty', () => {
  const s = summarizeMetric(new Map([[today, 5], [addDays(today, -2), 3]]), today, null, 'up')
  assert.equal(s.series.length, METRIC_DAYS)
  assert.equal(s.series.at(-1)?.date, today)
  assert.equal(s.series.at(-2)?.value, null)
  assert.equal(s.series.at(-3)?.value, 3)
})

test('averages skip days with no entry', () => {
  const s = summarizeMetric(new Map([[today, 6], [addDays(today, -1), 2]]), today, null, 'up')
  assert.equal(s.avg.d7, 4)
  assert.equal(s.avg.d90, 4)
  assert.equal(summarizeMetric(new Map(), today, null, 'up').avg.d7, null)
})

test('target direction decides what counts as met', () => {
  assert.equal(metTarget(3000, 3000, 'up'), true)
  assert.equal(metTarget(2999, 3000, 'up'), false)
  assert.equal(metTarget(2, 2, 'down'), true)
  assert.equal(metTarget(3, 2, 'down'), false)
  assert.equal(metTarget(0, null, 'up'), false)
  assert.equal(metTarget(1, null, 'up'), true)
})

test('streak and on-target count use the target', () => {
  const days = new Map([[today, 8], [addDays(today, -1), 8], [addDays(today, -2), 4], [addDays(today, -3), 8]])
  const s = summarizeMetric(days, today, 7, 'up')
  assert.deepEqual(s.streak, { current: 2, best: 2 })
  assert.deepEqual(s.onTarget, { hit: 3, days: 28 })
  assert.equal(summarizeMetric(days, today, null, 'up').onTarget, null)
})
