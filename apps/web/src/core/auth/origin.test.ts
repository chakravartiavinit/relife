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

test('a cookie that is not valid percent-encoding is no token', () => {
  assert.equal(sessionCookieOf(h({ host: '127.0.0.1:3030', cookie: 'relife=%E0%A4%A' })), undefined)
  assert.equal(tokenOf(h({ host: '127.0.0.1:3030', cookie: 'relife=%' })), null)
  assert.equal(sessionCookieOf(h({ host: '127.0.0.1:3030', cookie: 'relife=rlf_b_a%2Db' })), 'rlf_b_a-b')
})

test('cookieWriteAllowed: only a same-site page may write with the cookie', async () => {
  const { cookieWriteAllowed } = await import('./request')
  for (const m of ['GET', 'HEAD', 'OPTIONS']) assert.ok(cookieWriteAllowed(m, h({ origin: 'http://evil.example', host: '127.0.0.1:3030', 'sec-fetch-site': 'cross-site' })), m)
  const ok: Record<string, string>[] = [{}, { 'sec-fetch-site': 'same-origin' }, { 'sec-fetch-site': 'none' }, { origin: 'http://127.0.0.1:3030', 'sec-fetch-site': 'same-origin' }]
  for (const o of ok) assert.ok(cookieWriteAllowed('POST', h({ host: '127.0.0.1:3030', ...o })), JSON.stringify(o))
  const bad: Record<string, string>[] = [{ origin: 'http://127.0.0.1:3001', 'sec-fetch-site': 'same-site' }, { origin: 'null' }, { origin: 'http://evil.example' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'cross-site' }]
  for (const o of bad) for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) assert.ok(!cookieWriteAllowed(m, h({ host: '127.0.0.1:3030', ...o })), `${m} ${JSON.stringify(o)}`)
})

test('pairOriginAllowed: this site, native clients and the extension may pair; another site may not', async () => {
  const { pairOriginAllowed, fromExtension } = await import('./request')
  const id = 'a'.repeat(32)
  for (const o of [{}, { origin: 'http://127.0.0.1:3030' }, { origin: `chrome-extension://${id}` }] as Record<string, string>[]) assert.ok(pairOriginAllowed(h({ host: '127.0.0.1:3030', ...o })), JSON.stringify(o))
  for (const o of [{ origin: 'http://evil.example' }, { origin: 'null' }, { origin: 'chrome-extension://short' }, { origin: `chrome-extension://${id}.evil.example` }, { origin: `moz-extension://${id}` }]) assert.ok(!pairOriginAllowed(h({ host: '127.0.0.1:3030', ...o })), JSON.stringify(o))
  assert.ok(fromExtension(h({ origin: `chrome-extension://${id}` })))
  assert.ok(!fromExtension(h({})))
})
