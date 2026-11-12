import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSecureRequest, requestOrigin, sessionCookieOf, tokenOf } from './trust'

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })

test('requestOrigin uses the Host the browser used, not localhost', () => {
  assert.equal(requestOrigin(h({ host: '127.0.0.1:3030' })), 'http://127.0.0.1:3030')
})

test('requestOrigin prefers the forwarded address behind an https tunnel', () => {
  assert.equal(requestOrigin(h({ host: '127.0.0.1:3030', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'mac.tail.ts.net' })), 'https://mac.tail.ts.net')
})

test('requestOrigin takes the first value when proxies chain them', () => {
  assert.equal(requestOrigin(h({ host: '127.0.0.1:3030', 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'mac.tail.ts.net, proxy' })), 'https://mac.tail.ts.net')
})

test('a forwarded host or protocol nobody vouches for is ignored', () => {
  assert.equal(requestOrigin(h({ host: '127.0.0.1:3030', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' })), 'http://127.0.0.1:3030')
  assert.equal(requestOrigin(h({ host: 'localhost:3030', 'x-forwarded-proto': 'https' })), 'http://localhost:3030', 'a direct loopback connection is HTTP whatever it claims')
})

test('HTTPS comes from the request, not from the Host being off-loopback', () => {
  assert.equal(isSecureRequest(h({ host: 'mac.tail.ts.net', 'x-forwarded-proto': 'https' })), true)
  assert.equal(isSecureRequest(h({ host: 'mac.tail.ts.net', 'x-forwarded-proto': 'http' })), false)
  assert.equal(isSecureRequest(h({ host: 'mac.tail.ts.net' })), false, 'a ts.net Host reached over plain HTTP is not secure')
  assert.equal(isSecureRequest(h({ host: '127.0.0.1:3030' })), false)
  assert.equal(requestOrigin(h({ host: 'mac.tail.ts.net' })), 'http://mac.tail.ts.net')
})

test('only the cookie name for the request protocol is read, never the other', () => {
  const both = 'relife=rlf_b_plain; __Host-relife=rlf_b_secure'
  assert.equal(sessionCookieOf(h({ host: '127.0.0.1:3030', cookie: both })), 'rlf_b_plain')
  assert.equal(sessionCookieOf(h({ host: 'mac.tail.ts.net', 'x-forwarded-proto': 'https', cookie: both })), 'rlf_b_secure')
  assert.equal(sessionCookieOf(h({ host: '127.0.0.1:3030', cookie: '__Host-relife=rlf_b_secure' })), undefined, 'a __Host- cookie means nothing over HTTP')
  assert.equal(sessionCookieOf(h({ host: 'mac.tail.ts.net', 'x-forwarded-proto': 'https', cookie: 'relife=rlf_b_plain' })), undefined, 'and a plain one means nothing over HTTPS')
  assert.deepEqual(tokenOf(h({ host: '127.0.0.1:3030', cookie: 'relife=rlf_b_plain' })), { token: 'rlf_b_plain', via: 'cookie' })
  assert.equal(tokenOf(h({ host: '127.0.0.1:3030', cookie: '__Host-relife=x' })), null)
})
