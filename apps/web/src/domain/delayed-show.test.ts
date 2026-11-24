import { test } from 'node:test'
import assert from 'node:assert/strict'
import { delayedShow } from './delayed-show'

const base = { startedAt: 1000, delay: 400, minVisible: 500 }

test('nothing shows before the delay, and the caller is told when to look again', () => {
  assert.deepEqual(delayedShow({ ...base, endedAt: null, now: 1000 }), { visible: false, recheckIn: 400 })
  assert.deepEqual(delayedShow({ ...base, endedAt: null, now: 1399 }), { visible: false, recheckIn: 1 })
})

test('a wait that is still going shows once the delay has passed', () => {
  assert.deepEqual(delayedShow({ ...base, endedAt: null, now: 1400 }), { visible: true, recheckIn: null })
  assert.deepEqual(delayedShow({ ...base, endedAt: null, now: 9000 }), { visible: true, recheckIn: null })
})

test('a wait that ends before the delay never shows', () => {
  for (const now of [1200, 1399, 1400, 3000]) assert.deepEqual(delayedShow({ ...base, endedAt: 1399, now }), { visible: false, recheckIn: null })
})

test('once shown it stays at least minVisible', () => {
  // Shown at 1400; the wait ends at 1450. It hides at 1900, not 1450.
  assert.deepEqual(delayedShow({ ...base, endedAt: 1450, now: 1450 }), { visible: true, recheckIn: 450 })
  assert.deepEqual(delayedShow({ ...base, endedAt: 1450, now: 1899 }), { visible: true, recheckIn: 1 })
  assert.deepEqual(delayedShow({ ...base, endedAt: 1450, now: 1900 }), { visible: false, recheckIn: null })
})

test('a long wait that ends hides at once', () => {
  assert.deepEqual(delayedShow({ ...base, endedAt: 5000, now: 5000 }), { visible: false, recheckIn: null })
  assert.deepEqual(delayedShow({ ...base, endedAt: 5000, now: 4999 }), { visible: true, recheckIn: 1 })
})

test('a wait that ends exactly when the loader appears still shows for minVisible', () => {
  assert.deepEqual(delayedShow({ ...base, endedAt: 1400, now: 1400 }), { visible: true, recheckIn: 500 })
})

test('no minimum: the loader goes when the wait ends', () => {
  assert.deepEqual(delayedShow({ startedAt: 0, endedAt: 700, now: 700, delay: 300, minVisible: 0 }), { visible: false, recheckIn: null })
})
