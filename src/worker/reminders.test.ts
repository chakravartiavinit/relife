import { test } from 'node:test'
import assert from 'node:assert/strict'
import { delivery, occurrenceWindow, reminderAt } from './due'

test('occurrence window shifts by the reminder offset', () => {
  const now = new Date('2026-01-10T10:00:00Z')
  const last = new Date('2026-01-10T09:59:00Z')
  const [from, to] = occurrenceWindow(3 * 1440, last, now) // remind 3 days before
  assert.equal(from.toISOString(), '2026-01-13T09:59:00.001Z')
  assert.equal(to.toISOString(), '2026-01-13T10:00:00.000Z')
  assert.equal(reminderAt(to, 3 * 1440).toISOString(), now.toISOString())
})

test('downtime is clamped to 12h and stale reminders go to the digest', () => {
  const now = new Date('2026-01-10T10:00:00Z')
  const [from] = occurrenceWindow(0, new Date('2026-01-01T00:00:00Z'), now)
  assert.equal(from.toISOString(), '2026-01-09T22:00:00.001Z')
  assert.equal(delivery(new Date('2026-01-10T09:50:00Z'), now), 'send')
  assert.equal(delivery(new Date('2026-01-10T09:30:00Z'), now), 'digest')
})
