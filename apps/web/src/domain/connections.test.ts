import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isInline, needsFix } from './connections'

test('needsFix: failing, key missing or sign-in unfinished; not a first sync or an off source', () => {
  assert.equal(needsFix({ connected: true, status: 'error' }), true)
  assert.equal(needsFix({ connected: true, status: 'setup' }), true)
  assert.equal(needsFix({ connected: true, status: 'waiting', oauth: { signedIn: false } }), true)
  assert.equal(needsFix({ connected: true, status: 'waiting', oauth: { signedIn: true } }), false)
  assert.equal(needsFix({ connected: true, status: 'waiting' }), false)
  assert.equal(needsFix({ connected: true, status: 'ok' }), false)
  assert.equal(needsFix({ connected: false, status: 'error' }), false)
})

test('isInline: exactly one plain field, no key, sign-in or browser login', () => {
  assert.equal(isInline({ fields: [{ secret: false }] }), true)
  assert.equal(isInline({ fields: [{}] }), true)
  assert.equal(isInline({ fields: [{ secret: true }] }), false)
  assert.equal(isInline({ fields: [] }), false)
  assert.equal(isInline({ fields: [{}, {}] }), false)
  assert.equal(isInline({ fields: [{}], oauth: {} }), false)
  assert.equal(isInline({ fields: [{}], login: true }), false)
})
