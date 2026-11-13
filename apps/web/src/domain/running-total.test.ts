import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addGain } from './running-total'

test('addGain records nothing on the first sync, then adds each gain to its day', () => {
  const first = addGain(null, 1000, '2026-11-10', '2026-11-10')
  assert.deepEqual(first, { last: 1000, days: {}, known: false })
  const later = addGain(first, 1040, '2026-11-10', '2026-11-10')
  assert.deepEqual(later.days, { '2026-11-10': 40 })
  // Next morning, a lesson done late last night still goes to yesterday; today starts at 0.
  const late = addGain(later, 1060, '2026-11-10', '2026-11-11')
  assert.deepEqual(late.days, { '2026-11-10': 60, '2026-11-11': 0 })
  const today = addGain(late, 1075, '2026-11-11', '2026-11-11')
  assert.deepEqual(today.days, { '2026-11-10': 60, '2026-11-11': 15 })
})

test('addGain never goes negative and keeps only the last 3 days', () => {
  const prev = { last: 520, days: { '2026-11-08': 5, '2026-11-09': 5, '2026-11-10': 5, '2026-11-11': 20 } }
  const r = addGain(prev, 300, '2026-11-11', '2026-11-11')
  assert.deepEqual(r, { last: 300, days: { '2026-11-11': 20, '2026-11-10': 5, '2026-11-09': 5 }, known: true })
})
