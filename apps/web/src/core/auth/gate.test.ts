import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { gate, type GateDeps } from './gate'

// The edge rules (src/core/auth/gate.ts) with the database replaced by a few fakes.

const GOOD = 'rlf_b_good'
const device = (scopes: string[] = ['full']) => ({ id: 'd1', userId: 'u1', scopes, tokenHash: Buffer.alloc(0), revokedAt: null, expiresAt: new Date(Date.now() + 1e9), meta: {} }) as never

function deps(o: { minted?: string[]; requireSignIn?: boolean; tokens?: Record<string, ReturnType<typeof device> | 'revoked' | 'expired'> } = {}): GateDeps {
  const tokens = { [GOOD]: device(), ...o.tokens }
  return {
    findByToken: (async (t: string) => {
      const d = tokens[t]
      if (!d) return { ok: false, reason: 'invalid' }
      if (d === 'revoked' || d === 'expired') return { ok: false, reason: d }
      return { ok: true, device: d }
    }) as never,
    touchIfDue: (async () => false) as never,
    requireSignIn: async () => o.requireSignIn ?? false,
    mintLoopbackDevice: async () => { o.minted?.push('x'); return 'rlf_b_minted' },
  }
}

const NAV = { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', accept: 'text/html,application/xhtml+xml' }
const req = (path: string, o: { method?: string; host?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://${o.host ?? '127.0.0.1:3030'}${path}`, { method: o.method ?? 'GET', headers: { host: o.host ?? '127.0.0.1:3030', ...o.headers } })
const kind = (r: Response) => (r.headers.get('x-middleware-next') === '1' ? 'next' : r.status === 307 ? `redirect ${new URL(r.headers.get('location')!).pathname}` : String(r.status))
const setsCookie = (r: Response) => /^(__Host-)?relife(-mock)?=/.test(r.headers.get('set-cookie') ?? '')

test('a person opening a page on this Mac is signed in without asking', async () => {
  const minted: string[] = []
  const r = await gate(req('/', { headers: NAV }), deps({ minted }))
  assert.equal(kind(r), 'next')
  assert.ok(setsCookie(r))
  assert.equal(minted.length, 1)
})

test('only a top-level GET navigation mints: nothing else on loopback gets a device', async () => {
  const cases: [string, { method?: string; headers?: Record<string, string> }][] = [
    ['/api/ingest', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'content-type': 'text/plain' } }],
    ['/api/companion', { method: 'POST', headers: { 'content-type': 'text/plain' } }],
    ['/api/activity', { method: 'POST' }],
    ['/api/v1/today/actions', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' } }],
    ['/api/v1/today', { method: 'GET', headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' } }],
    ['/', { method: 'GET', headers: { ...NAV, 'sec-fetch-site': 'cross-site' } }],
    ['/', { method: 'GET', headers: { ...NAV, 'sec-fetch-dest': 'iframe' } }],
    ['/', { method: 'POST', headers: NAV }],
    ['/api/v1/today', { method: 'GET', headers: { accept: '*/*' } }],
    ['/', { method: 'GET', headers: { accept: 'application/json' } }],
  ]
  for (const [path, o] of cases) {
    const minted: string[] = []
    const r = await gate(req(path, o), deps({ minted }))
    assert.equal(minted.length, 0, `${o.method ?? 'GET'} ${path} ${JSON.stringify(o.headers)}`)
    assert.ok(!setsCookie(r), path)
    assert.ok(kind(r) !== 'next', `${o.method ?? 'GET'} ${path}`)
  }
})

test('without Sec-Fetch headers a GET that asks for HTML is a page; a curl is not', async () => {
  assert.equal(kind(await gate(req('/goals', { headers: { accept: 'text/html,*/*;q=0.8' } }), deps())), 'next')
  assert.equal(kind(await gate(req('/goals', { headers: { accept: '*/*' } }), deps())), 'redirect /signin')
  assert.equal(kind(await gate(req('/goals'), deps())), 'redirect /signin')
})

test('the legacy bearer routes need their bearer again', async () => {
  for (const path of ['/api/ingest', '/api/companion', '/api/activity']) {
    const r = await gate(req(path, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' } }), deps())
    assert.equal(r.status, 401, path)
    assert.equal(typeof (await r.json()).error, 'string', `${path} keeps the old { error: string } body`)
  }
  assert.equal(kind(await gate(req('/api/ingest', { method: 'POST', headers: { authorization: 'Bearer rlf_i_whatever' } }), deps())), 'next', 'a bearer goes on to the route')
})

test('no session: pages redirect to /signin (with next), API calls and server actions get 401 JSON', async () => {
  const noTrust = deps({ requireSignIn: true })
  const page = await gate(req('/goals?x=1', { headers: NAV }), noTrust)
  assert.equal(page.status, 307)
  const to = new URL(page.headers.get('location')!)
  assert.equal(to.pathname, '/signin'); assert.equal(to.searchParams.get('next'), '/goals?x=1')
  assert.equal(new URL((await gate(req('/', { headers: NAV }), noTrust)).headers.get('location')!).searchParams.has('next'), false, 'the home page needs no next')
  const api = await gate(req('/api/v1/me', { headers: NAV }), noTrust)
  assert.equal(api.status, 401); assert.equal((await api.json()).error.code, 'unauthorized')
  const action = await gate(req('/', { method: 'POST', headers: { 'next-action': 'abc' } }), noTrust)
  assert.equal(action.status, 401)
})

test('other hosts are never trusted: a tailnet or tunnel visitor is sent to /signin', async () => {
  const r = await gate(req('/', { host: 'mac.tail1234.ts.net', headers: { ...NAV, 'x-forwarded-for': '100.64.0.7' } }), deps())
  assert.equal(kind(r), 'redirect /signin')
  const viaProxy = await gate(req('/', { headers: { ...NAV, 'x-forwarded-for': '100.64.0.7' } }), deps())
  assert.equal(kind(viaProxy), 'redirect /signin', 'a loopback Host behind a proxy is not this Mac')
})

test('a valid cookie passes; a revoked one says so', async () => {
  const ok = await gate(req('/goals', { headers: { cookie: `${'relife'}=${GOOD}` } }), deps({ requireSignIn: true }))
  assert.equal(kind(ok), 'next')
  const revoked = await gate(req('/goals', { headers: { ...NAV, cookie: 'relife=rlf_b_gone' } }), deps({ requireSignIn: true, tokens: { rlf_b_gone: 'revoked' } }))
  assert.equal(new URL(revoked.headers.get('location')!).searchParams.get('reason'), 'revoked')
  const apiRevoked = await gate(req('/api/v1/me', { headers: { cookie: 'relife=rlf_b_gone' } }), deps({ requireSignIn: true, tokens: { rlf_b_gone: 'revoked' } }))
  assert.equal((await apiRevoked.json()).error.code, 'revoked')
})

test('public paths need nothing; /api/health is for this Mac only; unknown hosts get 421', async () => {
  for (const p of ['/signin', '/pair', '/api/v1/hello', '/api/v1/pair/redeem', '/manifest.webmanifest']) assert.equal(kind(await gate(req(p, { host: 'x.ts.net' }), deps())), 'next', p)
  assert.equal(kind(await gate(req('/api/health'), deps())), 'next')
  assert.equal(kind(await gate(req('/api/health', { host: 'x.ts.net' }), deps())), '404')
  assert.equal((await gate(req('/', { host: 'evil.example' }), deps())).status, 421)
})
