import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQuickLog } from './quicklog'

test('quick log grammar', () => {
  assert.deepEqual(parseQuickLog('water 250'), { type: 'entry', slug: 'water', value: 250 })
  assert.deepEqual(parseQuickLog('water 1.5 l'), { type: 'entry', slug: 'water', value: 1500 })
  assert.deepEqual(parseQuickLog('read 30 min'), { type: 'entry', slug: 'read', value: 30 })
  assert.deepEqual(parseQuickLog('Cold shower 1'), { type: 'entry', slug: 'cold-shower', value: 1 })
  assert.deepEqual(parseQuickLog('spent 120 chai'), { type: 'spend', amount: 120, currency: 'INR', note: 'chai' })
  assert.deepEqual(parseQuickLog('spent 20 usd claude pro'), { type: 'spend', amount: 20, currency: 'USD', note: 'claude pro' })
  assert.equal(parseQuickLog('hello there'), null)
})
