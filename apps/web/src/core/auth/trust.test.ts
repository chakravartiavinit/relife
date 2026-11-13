import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindIsLoopback, clientIp, cookieName, limitKey, isPublicPath, loopbackTrusted, trustPossible, scopeAllows, tokenOf } from './trust'

process.env.RELIFE_BIND = '127.0.0.1' // what `npm run web` sets; without it nothing is trusted (see the bind test)

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null })

test('loopback trust: a loopback Host with no proxy headers, self-host only', () => {
  for (const host of ['127.0.0.1:3030', 'localhost:3001', '[::1]:3030']) assert.ok(loopbackTrusted(h({ host }), { mode: 'self-host' }), host)
  assert.ok(!loopbackTrusted(h({ host: 'mac.tail1234.ts.net' }), { mode: 'self-host' }))
  assert.ok(!loopbackTrusted(h({ host: '127.0.0.1:3030' }), { mode: 'cloud' }), 'cloud never trusts')
  assert.ok(!loopbackTrusted(h({ host: '127.0.0.1:3030' }), { mode: 'self-host', requireSignIn: true }), 'the setting turns it off')
})

test('loopback trust: any proxy header refuses, even with a loopback Host', () => {
  for (const name of ['x-forwarded-for', 'forwarded', 'tailscale-user-login', 'cf-connecting-ip', 'x-real-ip']) {
    assert.ok(!loopbackTrusted(h({ host: 'localhost:3030', [name]: '1.2.3.4' }), { mode: 'self-host' }), name)
  }
  assert.ok(!loopbackTrusted(h({ host: 'localhost:3030', 'x-forwarded-for': '127.0.0.1, 100.64.0.7' }), { mode: 'self-host' }), 'a non-loopback hop anywhere in the chain')
  assert.ok(!loopbackTrusted(h({ host: 'localhost:3030', 'x-forwarded-host': 'evil.example' }), { mode: 'self-host' }), 'a different forwarded host')
})

test('loopback trust: what Next itself adds to a direct request does not count', () => {
  const direct = h({ host: '127.0.0.1:3030', 'x-forwarded-for': '127.0.0.1', 'x-forwarded-host': '127.0.0.1:3030', 'x-forwarded-port': '3030', 'x-forwarded-proto': 'http' })
  assert.ok(loopbackTrusted(direct, { mode: 'self-host' }))
  assert.ok(loopbackTrusted(h({ host: '[::1]:3030', 'x-forwarded-for': '::1' }), { mode: 'self-host' }))
})

test('client ip comes from X-Forwarded-For only behind a known proxy', () => {
  assert.equal(clientIp(h({ host: 'mac.tail1.ts.net', 'x-forwarded-for': '100.64.0.7' }), { mode: 'self-host' }), '100.64.0.7')
  assert.equal(clientIp(h({ host: 'mac.tail1.ts.net', 'x-forwarded-for': '9.9.9.9, 100.64.0.7' }), { mode: 'self-host' }), '100.64.0.7', 'the hop our proxy wrote, not one the client made up')
  assert.equal(clientIp(h({ host: 'mac.tail1.ts.net', 'x-forwarded-for': '9.9.9.9, 100.64.0.7, 127.0.0.1' }), { mode: 'self-host' }), '100.64.0.7', 'this machine is skipped')
  assert.equal(clientIp(h({ host: '127.0.0.1:3030', 'x-forwarded-for': '9.9.9.9' }), { mode: 'self-host' }), 'local')
  assert.equal(clientIp(h({ host: 'relife.example.com', 'x-forwarded-for': '9.9.9.9' }), { mode: 'cloud' }), '9.9.9.9')
  assert.equal(clientIp(h({ host: 'mac.tail1.ts.net', 'x-forwarded-for': '<script>' }), { mode: 'self-host' }), 'local')
})

test('cookie names: __Host- only over HTTPS, mock mode apart', () => {
  assert.equal(cookieName(false, false), 'relife')
  assert.equal(cookieName(true, false), '__Host-relife')
  assert.equal(cookieName(false, true), 'relife-mock')
})

test('the token is the bearer first, else the cookie', () => {
  assert.deepEqual(tokenOf(h({ authorization: 'Bearer rlf_m_abc', cookie: 'relife=zzz' })), { token: 'rlf_m_abc', via: 'bearer' })
  assert.deepEqual(tokenOf(h({ cookie: 'a=1; relife=rlf_b_x; b=2' })), { token: 'rlf_b_x', via: 'cookie' })
  assert.deepEqual(tokenOf(h({ host: 'mac.tail1.ts.net', 'x-forwarded-proto': 'https', cookie: '__Host-relife=rlf_b_y' })), { token: 'rlf_b_y', via: 'cookie' })
  assert.equal(tokenOf(h({})), null)
  assert.equal(tokenOf(h({ authorization: 'Basic abc' })), null)
})

test('scopes: full opens everything, the others only themselves', () => {
  assert.ok(scopeAllows(['full'], 'companion') && scopeAllows(['full'], 'ingest'))
  assert.ok(scopeAllows(['companion'], 'companion'))
  assert.ok(!scopeAllows(['companion'], 'full') && !scopeAllows(['companion'], 'ingest'))
  assert.ok(!scopeAllows(['ingest'], 'companion'))
})

test('public paths', () => {
  for (const p of ['/signin', '/pair', '/api/v1/hello', '/api/v1/pair/redeem', '/api/v1/pair/requests/abc/poll', '/_next/static/x.js', '/brand/logo.png', '/manifest.webmanifest']) assert.ok(isPublicPath(p), p)
  for (const p of ['/', '/pair/approve', '/api/v1/today', '/api/v1/devices', '/api/companion', '/you/settings/devices', '/api/health']) assert.ok(!isPublicPath(p), p)
})

test('loopback trust is off once other hosts are allowed or the server listens beyond loopback', () => {
  const direct = h({ host: '127.0.0.1:3030' })
  assert.ok(loopbackTrusted(direct, { mode: 'self-host', env: { RELIFE_BIND: '127.0.0.1' } }))
  assert.ok(!loopbackTrusted(direct, { mode: 'self-host', env: {} }), 'a server whose bind is unknown (next start -H 0.0.0.0, no RELIFE_BIND) trusts no one: X-Forwarded-For: 127.0.0.1 is client-writable')
  assert.ok(!loopbackTrusted(h({ host: '127.0.0.1:3030', 'x-forwarded-for': '127.0.0.1' }), { mode: 'self-host', env: {} }))
  assert.ok(!bindIsLoopback({}) && !bindIsLoopback({ RELIFE_BIND: '  ' }))
  assert.ok(loopbackTrusted(direct, { mode: 'self-host', env: { RELIFE_BIND: 'localhost', RELIFE_ALLOWED_HOSTS: '  ', HOSTNAME: 'macbook' } }), 'blank list, a machine name')
  assert.ok(!loopbackTrusted(direct, { mode: 'self-host', env: { RELIFE_ALLOWED_HOSTS: 'relife.example.com' } }), 'a tunnel name is listed')
  for (const bind of ['0.0.0.0', '192.168.1.20', '::']) assert.ok(!loopbackTrusted(direct, { mode: 'self-host', env: { RELIFE_BIND: bind } }), `RELIFE_BIND=${bind}`)
  assert.ok(!loopbackTrusted(direct, { mode: 'self-host', env: { HOSTNAME: '0.0.0.0' } }), 'a container that binds every address')
  assert.ok(!bindIsLoopback({ RELIFE_BIND: '127.0.0.1', HOSTNAME: '0.0.0.0' }), 'a wide HOSTNAME overrides')
  for (const bind of ['127.0.0.1', 'localhost', '::1', '[::1]', '127.0.0.2']) assert.ok(bindIsLoopback({ RELIFE_BIND: bind }), bind)
  assert.ok(trustPossible({ RELIFE_BIND: '127.0.0.1' }) && !trustPossible({}) && !trustPossible({ RELIFE_BIND: '127.0.0.1', RELIFE_ALLOWED_HOSTS: 'x.example' }))
})

test('rate limits are kept per address, per Mac, or per tunnel name: never one shared bucket', () => {
  assert.equal(limitKey(h({ host: 'mac.tail1.ts.net', 'x-forwarded-for': '100.64.0.7' }), { mode: 'self-host' }), '100.64.0.7')
  assert.equal(limitKey(h({ host: '127.0.0.1:3030' }), { mode: 'self-host' }), 'local')
  assert.equal(limitKey(h({ host: 'relife.example.com', 'x-forwarded-for': '9.9.9.9' }), { mode: 'self-host' }), 'host:relife.example.com', 'an untrusted tunnel is its own bucket, whatever it claims')
  assert.notEqual(limitKey(h({ host: 'a.example.com' }), { mode: 'self-host' }), limitKey(h({ host: 'b.example.com' }), { mode: 'self-host' }))
  assert.equal(limitKey(h({ host: 'relife.example.com', 'x-forwarded-for': '9.9.9.9' }), { mode: 'cloud' }), '9.9.9.9')
})
