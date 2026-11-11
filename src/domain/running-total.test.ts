import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todayFromTotal } from './running-total'

test('todayFromTotal counts from the start of the day', () => {
  // First sync: today's amount is unknown.
  const first = todayFromTotal(null, 1000, '2026-11-10')
  assert.equal(first.value, null)
  // Later the same day: everything since the first sync.
  const later = todayFromTotal(first.cursor, 1040, '2026-11-10')
  assert.equal(later.value, 40)
  // Next day: starts from the last total seen yesterday.
  const next = todayFromTotal(later.cursor, 1055, '2026-11-11')
  assert.deepEqual(next, { value: 15, cursor: { day: '2026-11-11', base: 1040, last: 1055 } })
  // Same day again: base stays.
  assert.equal(todayFromTotal(next.cursor, 1100, '2026-11-11').value, 60)
})

test('todayFromTotal never goes negative when the total drops', () => {
  const r = todayFromTotal({ day: '2026-11-11', base: 500, last: 520 }, 300, '2026-11-11')
  assert.deepEqual(r, { value: 0, cursor: { day: '2026-11-11', base: 300, last: 300 } })
})
