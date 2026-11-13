import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PEEK_TYPES, parsePeek, peekFromSearch, peekParam, withPeek, type PeekRef } from './peek'

test('parse and format round trip for every type', () => {
  for (const type of PEEK_TYPES) {
    const ref: PeekRef = { type, id: 'abc' }
    assert.deepEqual(parsePeek(peekParam(ref)), ref)
  }
})

test('dotted slugs and ids with colons', () => {
  assert.deepEqual(parsePeek('metric:sleep.hours'), { type: 'metric', id: 'sleep.hours' })
  assert.deepEqual(parsePeek('quest:weekly.steps'), { type: 'quest', id: 'weekly.steps' })
  assert.deepEqual(parsePeek('sync:status'), { type: 'sync', id: 'status' })
  assert.deepEqual(parsePeek('merchant:a:b'), { type: 'merchant', id: 'a:b' })
})

test('encoded merchants', () => {
  const ref: PeekRef = { type: 'merchant', id: 'Big Basket & Co 100%' }
  assert.equal(peekParam(ref), 'merchant:Big%20Basket%20%26%20Co%20100%25')
  assert.deepEqual(parsePeek(peekParam(ref)), ref)
  // Through a real query string, as the browser sees it.
  assert.deepEqual(peekFromSearch(withPeek('', ref)), ref)
  assert.deepEqual(peekFromSearch(withPeek('?m=1', { type: 'merchant', id: 'swiggy@upi' })), { type: 'merchant', id: 'swiggy@upi' })
})

test('unknown or empty input is null', () => {
  assert.equal(parsePeek(null), null)
  assert.equal(parsePeek(''), null)
  assert.equal(parsePeek('nope:1'), null)
  assert.equal(parsePeek('metric'), null)
  assert.equal(parsePeek('metric:'), null)
  assert.equal(parsePeek(':x'), null)
  assert.equal(parsePeek('metric:%E0%A4%A'), null) // broken escape
})

test('withPeek keeps other params and swaps or removes peek', () => {
  assert.equal(withPeek('', { type: 'metric', id: 'sleep.hours' }), '?peek=metric:sleep.hours')
  assert.equal(withPeek('?tab=trackers&m=2', { type: 'goal', id: 'g1' }), '?tab=trackers&m=2&peek=goal:g1')
  assert.equal(withPeek('?peek=metric:water&tab=a', { type: 'goal', id: 'g1' }), '?tab=a&peek=goal:g1')
  assert.equal(withPeek('?peek=metric:water&tab=a', null), '?tab=a')
  assert.equal(withPeek('peek=metric:water', null), '')
})
