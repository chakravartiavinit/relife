import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeNext } from './next'

const O = 'http://127.0.0.1:3030'

test('a path on this site is kept', () => {
  assert.equal(safeNext('/goals', O), '/goals')
  assert.equal(safeNext('/settings/devices?x=1#top', O), '/settings/devices?x=1#top')
  assert.equal(safeNext('http://127.0.0.1:3030/goals?a=b', O), '/goals?a=b', 'the same origin, written out')
  assert.equal(safeNext('/a/../goals', O), '/goals')
})

test('anything that leaves the site is refused', () => {
  const evil = [
    '//evil.example', '//evil.example/x', '/\\evil.example', '/\\\\evil.example', '\\\\evil.example', '/\t/evil.example', '/\n/evil.example', '/\r/evil.example',
    '\t//evil.example', ' //evil.example', 'https://evil.example', 'http://127.0.0.1.evil.example/', 'http://127.0.0.1:3031/', 'javascript:alert(1)',
    'data:text/html,hi', '///evil.example', 'http:evil.example', '/%2F%2Fevil.example/../..//evil.example',
  ]
  for (const n of evil) {
    const out = safeNext(n, O)
    assert.ok(out === '/' || (out.startsWith('/') && !out.startsWith('//')), `${JSON.stringify(n)} -> ${out}`)
    assert.equal(new URL(out, O).origin, O, `${JSON.stringify(n)} -> ${out}`)
  }
  for (const n of ['//evil.example', '/\\evil.example', '/\t/evil.example', 'https://evil.example', 'javascript:alert(1)']) assert.equal(safeNext(n, O), '/', n)
})

test('nothing, or something that is not an address, is the home page', () => {
  for (const n of [undefined, null, '']) assert.equal(safeNext(n, O), '/')
})
