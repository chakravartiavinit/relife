import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agoShort, closed, left, progressState, syncLabel, syncTone, workerAlive } from './shell'
import { needsYou } from './needs-you'

test('needsYou adds decisions to data', () => {
  assert.deepEqual(needsYou(2, 1, 3), { total: 6, decisions: 2, data: 4 })
  assert.deepEqual(needsYou(0, 0, 0), { total: 0, decisions: 0, data: 0 })
})

test('sync tone: offline worker beats a failing connector', () => {
  assert.equal(syncTone(false, 2), 'bad')
  assert.equal(syncTone(true, 2), 'warn')
  assert.equal(syncTone(true, 0), 'good')
})

test('worker alive under 3 minutes', () => {
  const now = Date.now()
  assert.equal(workerAlive(new Date(now - 2 * 60_000), now), true)
  assert.equal(workerAlive(new Date(now - 3 * 60_000), now), false)
  assert.equal(workerAlive(null, now), false)
})

test('sync labels', () => {
  const now = Date.now()
  assert.equal(syncLabel('good', 0, new Date(now - 2 * 60_000), now), 'Synced 2 min ago')
  assert.equal(syncLabel('good', 0, null, now), 'Not synced yet')
  assert.equal(syncLabel('warn', 1, null, now), '1 needs a fix')
  assert.equal(syncLabel('warn', 2, null, now), '2 need a fix')
  assert.equal(syncLabel('bad', 0, new Date(now - 2 * 3_600_000), now), 'Sync paused 2 h')
  assert.equal(agoShort(10_000), 'just now')
})

test('one area or the whole day: done, due or nothing due', () => {
  assert.equal(progressState({ done: 5, total: 11, skipped: 0 }), 'due')
  assert.equal(progressState({ done: 11, total: 11, skipped: 0 }), 'done')
  assert.equal(progressState({ done: 0, total: 0, skipped: 0 }), 'none')
  // Skipped is closed for the day, like done.
  assert.equal(progressState({ done: 9, total: 11, skipped: 2 }), 'done')
  assert.equal(progressState({ done: 9, total: 11, skipped: 1 }), 'due')
  assert.equal(closed({ done: 9, total: 11, skipped: 1 }), 10)
  assert.equal(left({ done: 9, total: 11, skipped: 1 }), 1)
})
