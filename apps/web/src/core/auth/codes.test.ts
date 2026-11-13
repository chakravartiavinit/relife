import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCode, hashToken, isCode, makeToken, newCode, normalizeCode } from './tokens'

test('tokens: prefix by kind, long, and only the hash is derived', () => {
  const m = makeToken('mac')
  assert.match(m.token, /^rlf_m_[A-Za-z0-9_-]{43}$/)
  assert.match(makeToken('extension').token, /^rlf_e_/)
  assert.deepEqual(m.hash, hashToken(m.token))
  assert.notDeepEqual(makeToken('mac').hash, m.hash)
})

test('codes: 8 characters from the alphabet without look-alikes, shown XXXX-XXXX', () => {
  for (let i = 0; i < 200; i++) {
    const c = newCode()
    assert.equal(c.length, 8)
    assert.ok(isCode(c), c)
    assert.ok(!/[01ILOU]/.test(c), c)
  }
  assert.equal(formatCode('K7FQ2M9X'), 'K7FQ-2M9X')
})

test('codes: typed input ignores case, dashes and spaces; look-alikes never match', () => {
  assert.equal(normalizeCode('k7fq-2m9x'), 'K7FQ2M9X')
  assert.equal(normalizeCode(' K7FQ 2M9X '), 'K7FQ2M9X')
  assert.ok(isCode(normalizeCode('k7fq-2m9x')))
  assert.ok(!isCode(normalizeCode('K7FQ-2M9O')))
  assert.ok(!isCode(normalizeCode('K7FQ-2M9')))
})
