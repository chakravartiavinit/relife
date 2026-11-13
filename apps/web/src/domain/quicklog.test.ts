import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LAST_VALUE, parseQuickLog, quickLogUndo, slugify } from './quicklog'

test('quick log grammar', () => {
  assert.deepEqual(parseQuickLog('water 250'), { type: 'entry', slug: 'water', value: 250 })
  assert.deepEqual(parseQuickLog('water 1.5 l'), { type: 'entry', slug: 'water', value: 1500 })
  assert.deepEqual(parseQuickLog('read 30 min'), { type: 'entry', slug: 'read', value: 30 })
  assert.deepEqual(parseQuickLog('Cold shower 1'), { type: 'entry', slug: 'cold-shower', value: 1 })
  assert.deepEqual(parseQuickLog('spent 120 chai'), { type: 'spend', amount: 120, currency: 'INR', note: 'chai' })
  assert.deepEqual(parseQuickLog('spent 20 usd claude pro'), { type: 'spend', amount: 20, currency: 'USD', note: 'claude pro' })
  assert.equal(parseQuickLog('hello there'), null)
})

test('quick log edge cases', () => {
  assert.deepEqual(parseQuickLog('  Water   250  '), { type: 'entry', slug: 'water', value: 250 })
  assert.deepEqual(parseQuickLog('water -250'), { type: 'entry', slug: 'water', value: -250 })
  assert.deepEqual(parseQuickLog('₹80 auto'), { type: 'spend', amount: 80, currency: 'INR', note: 'auto' })
  assert.deepEqual(parseQuickLog('spent 40'), { type: 'spend', amount: 40, currency: 'INR', note: 'Manual' })
  assert.equal(parseQuickLog('water 250 gallons'), null)
  assert.deepEqual(parseQuickLog('spent 40', 'USD'), { type: 'spend', amount: 40, currency: 'USD', note: 'Manual' })
  assert.deepEqual(parseQuickLog('spent 12 coffee', 'EUR'), { type: 'spend', amount: 12, currency: 'EUR', note: 'coffee' })
  assert.deepEqual(parseQuickLog('₹80 auto', 'USD'), { type: 'spend', amount: 80, currency: 'INR', note: 'auto' }, 'the rupee sign means INR')
  assert.deepEqual(parseQuickLog('spent 9 jpy lunch', 'INR'), { type: 'spend', amount: 9, currency: 'JPY', note: 'lunch' }, 'any ISO code')
  assert.deepEqual(parseQuickLog('spent 5 usdt tea'), { type: 'spend', amount: 5, currency: 'USDT', note: 'tea' })
  assert.deepEqual(parseQuickLog('spent 200 cup coffee'), { type: 'spend', amount: 200, currency: 'INR', note: 'cup coffee' }, 'a lower-case rare code is a word')
  assert.deepEqual(parseQuickLog('spent 300 all groceries'), { type: 'spend', amount: 300, currency: 'INR', note: 'all groceries' })
  assert.deepEqual(parseQuickLog('spent 40 PEN pens'), { type: 'spend', amount: 40, currency: 'PEN', note: 'pens' }, 'in capitals any ISO code counts')
  assert.deepEqual(parseQuickLog('spent 5 abc tea', 'GBP'), { type: 'spend', amount: 5, currency: 'GBP', note: 'abc tea' }, 'not a code: part of the note')
  assert.equal(parseQuickLog(''), null)
})

test('slugify and the set-not-add trackers', () => {
  assert.equal(slugify('  Cold Shower! '), 'cold-shower')
  assert.equal(slugify('sleep.hours'), 'sleep.hours')
  assert.ok(LAST_VALUE.has('mood') && !LAST_VALUE.has('water'))
})

test('undo tokens', () => {
  const ctx = { date: '2026-11-12', prev: null as number | null, externalRef: 'manual:1' }
  assert.deepEqual(quickLogUndo({ type: 'entry', slug: 'water', value: 250 }, ctx), { kind: 'entry', slug: 'water', date: '2026-11-12', ref: 'manual:1' })
  assert.deepEqual(quickLogUndo({ type: 'entry', slug: 'mood', value: 4 }, ctx), { kind: 'set', slug: 'mood', date: '2026-11-12', prev: null })
  assert.deepEqual(quickLogUndo({ type: 'entry', slug: 'weight', value: 71 }, { ...ctx, prev: 72 }), { kind: 'set', slug: 'weight', date: '2026-11-12', prev: 72 })
  assert.deepEqual(quickLogUndo({ type: 'spend', amount: 120, currency: 'INR', note: 'chai' }, ctx), { kind: 'spend', externalRef: 'manual:1' })
})
