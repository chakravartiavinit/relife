import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { gate, type GateDeps } from './gate'

// The edge rules (src/core/auth/gate.ts) with the database replaced by a few fakes.

delete process.env.RELIFE_ALLOWED_HOSTS // the rules below are for a plain install; one test sets it
process.env.RELIFE_BIND = '127.0.0.1' // what `npm run web` sets

const GOOD = 'rlf_b_good'
const device = (scopes: string[] = ['full']) => ({ id: 'd1', userId: 'u1', scopes, tokenHash: Buffer.alloc(0), revokedAt: null, expiresAt: new Date(Date.now() + 1e9), meta: {} }) as never

function deps(o: { minted?: string[]; requireSignIn?: boolean; tokens?: Record<string, unknown> } = {}): GateDeps {
  const tokens: Record<string, unknown> = { [GOOD]: device(), ...o.tokens }
  return {
    warm: async () => undefined,
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
  assert.equal(kind(await gate(req('/api/ingest', { method: 'POST', headers: { authorization: `Bearer ${GOOD}` } }), deps())), 'next', 'a bearer goes on to the route')
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

test('a bearer is checked at the edge, on every API route', async () => {
  for (const path of ['/api/oauth/strava/start', '/api/oauth/strava/callback', '/api/library/abc/image', '/api/coins/BTC', '/api/v1/me']) {
    const bad = await gate(req(path, { headers: { authorization: 'Bearer rlf_b_nope' } }), deps())
    assert.equal(bad.status, 401, `${path} with a made-up bearer`)
    const revoked = await gate(req(path, { headers: { authorization: 'Bearer rlf_b_gone' } }), deps({ tokens: { rlf_b_gone: 'revoked' } }))
    assert.equal((await revoked.json()).error.code, 'revoked', path)
    assert.equal(kind(await gate(req(path, { headers: { authorization: `Bearer ${GOOD}` } }), deps())), 'next', `${path} with a real token goes on to the route`)
  }
  const legacy = await gate(req('/api/companion', { headers: { authorization: 'Bearer rlf_c_nope' } }), deps())
  assert.equal(legacy.status, 401)
  assert.equal(typeof (await legacy.json()).error, 'string', 'extensions before 0.7 still get { error: string }')
})

test('a bearer is not a way past the edge on a page, and loopback trust does not rescue a bad bearer', async () => {
  assert.equal(kind(await gate(req('/goals', { headers: { ...NAV, authorization: 'Bearer rlf_b_nope' } }), deps({ requireSignIn: true }))), 'redirect /signin')
  const minted: string[] = []
  const r = await gate(req('/api/v1/today', { headers: { ...NAV, authorization: 'Bearer rlf_b_nope' } }), deps({ minted }))
  assert.equal(r.status, 401); assert.equal(minted.length, 0)
})

test('naming other hosts turns "trust this Mac" off: this Mac connects by pairing like any device', async () => {
  process.env.RELIFE_ALLOWED_HOSTS = 'relife.example.com'
  try {
    const minted: string[] = []
    assert.equal(kind(await gate(req('/', { headers: NAV }), deps({ minted }))), 'redirect /signin')
    assert.equal(minted.length, 0)
  } finally { delete process.env.RELIFE_ALLOWED_HOSTS }
})

test('the cookie is read under the one name the request protocol allows', async () => {
  // A __Host- cookie sent over plain loopback HTTP (planted by a sibling subdomain, say) is not a session.
  const r = await gate(req('/goals', { headers: { cookie: `__Host-relife=${GOOD}` } }), deps({ requireSignIn: true }))
  assert.equal(kind(r), 'redirect /signin')
  const secure = await gate(req('/goals', { host: 'mac.tail1.ts.net', headers: { cookie: `__Host-relife=${GOOD}`, 'x-forwarded-proto': 'https', 'x-forwarded-for': '100.64.0.7' } }), deps())
  assert.equal(kind(secure), 'next')
  const wrongName = await gate(req('/goals', { host: 'mac.tail1.ts.net', headers: { cookie: `relife=${GOOD}`, 'x-forwarded-proto': 'https', 'x-forwarded-for': '100.64.0.7' } }), deps())
  assert.equal(kind(wrongName), 'redirect /signin')
})

test('a malformed cookie is no session, not a crash', async () => {
  const r = await gate(req('/goals', { headers: { cookie: 'relife=%E0%A4%A' } }), deps({ requireSignIn: true }))
  assert.equal(kind(r), 'redirect /signin')
  assert.equal((await gate(req('/api/v1/me', { headers: { cookie: 'relife=%' } }), deps({ requireSignIn: true }))).status, 401)
})

test('the sign-in redirect never carries an address that leaves the site', async () => {
  for (const path of ['//evil.example/x', '/%5Cevil.example']) {
    const r = await gate(req(path, { headers: NAV }), deps({ requireSignIn: true }))
    const next = new URL(r.headers.get('location')!).searchParams.get('next')
    assert.ok(next === null || (next.startsWith('/') && !next.startsWith('//')), `${path} -> ${next}`)
  }
})

test('a server with no declared bind trusts no one, even a client that sends X-Forwarded-For: 127.0.0.1', async () => {
  delete process.env.RELIFE_BIND
  try {
    const minted: string[] = []
    assert.equal(kind(await gate(req('/', { headers: { ...NAV, 'x-forwarded-for': '127.0.0.1' } }), deps({ minted }))), 'redirect /signin')
    assert.equal(minted.length, 0)
  } finally { process.env.RELIFE_BIND = '127.0.0.1' }
})

test('a write that rides on the session cookie must come from this site', async () => {
  const cookie = { cookie: `relife=${GOOD}` }
  const post = (path: string, headers: Record<string, string>) => gate(req(path, { method: 'POST', headers: { ...cookie, ...headers } }), deps())
  // The cross-origin text/plain POST a web page on another port can make: the browser attaches the cookie and says where it came from.
  for (const path of ['/api/v1/today/actions', '/api/companion', '/api/v1/activity', '/api/activity', '/api/ingest', '/api/v1/devices/abc/revoke']) {
    const r = await post(path, { origin: 'http://127.0.0.1:3001', 'content-type': 'text/plain', 'sec-fetch-site': 'same-site' })
    assert.equal(r.status, 403, path)
    assert.equal((await post(path, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).status, 403, path)
    assert.equal((await post(path, { origin: 'http://evil.example' })).status, 403, `${path}: an Origin that is not Host, no Sec-Fetch`)
    assert.equal((await post(path, { 'sec-fetch-site': 'cross-site' })).status, 403, `${path}: Sec-Fetch-Site alone`)
  }
  assert.equal(typeof (await (await post('/api/ingest', { origin: 'http://evil.example' })).json()).error, 'string', 'legacy routes keep the { error: string } body')
  // The app's own pages, a curl, and the Mac app (no Origin) are fine.
  assert.equal(kind(await post('/api/v1/today/actions', { origin: 'http://127.0.0.1:3030', 'sec-fetch-site': 'same-origin' })), 'next')
  assert.equal(kind(await post('/api/v1/today/actions', { 'sec-fetch-site': 'none' })), 'next')
  assert.equal(kind(await post('/api/v1/today/actions', {})), 'next')
  assert.equal(kind(await gate(req('/api/v1/today', { headers: { ...cookie, 'sec-fetch-site': 'cross-site' } }), deps())), 'next', 'reads are not writes')
  // A bearer is not a cookie: the extension and the Mac app are unaffected whatever they send.
  const bearer = await gate(req('/api/companion', { method: 'POST', headers: { authorization: `Bearer ${GOOD}`, origin: 'chrome-extension://abc', 'sec-fetch-site': 'cross-site' } }), deps())
  assert.equal(kind(bearer), 'next')
})

test('a Next-Action request is never public: /signin does not run server actions without a session', async () => {
  const action = (path: string) => gate(req(path, { method: 'POST', headers: { 'next-action': 'abc' } }), deps({ requireSignIn: true }))
  for (const path of ['/signin', '/pair', '/']) assert.equal((await action(path)).status, 401, path)
  assert.equal(kind(await gate(req('/signin', { method: 'POST' }), deps())), 'next', 'a plain page request to /signin is still public')
  const ok = await gate(req('/signin', { method: 'POST', headers: { 'next-action': 'abc', cookie: `relife=${GOOD}` } }), deps())
  assert.equal(kind(ok), 'next', 'with a session an action works')
})

// ── The read-only demo (RELIFE_DEMO=1, src/core/demo.ts) ──────────────────────────────────────────

async function inDemo<T>(f: () => Promise<T>) {
  process.env.RELIFE_DEMO = '1'
  try { return await f() } finally { delete process.env.RELIFE_DEMO }
}

test('demo: an anonymous page passes and nobody is minted a device or a cookie', async () => {
  await inDemo(async () => {
    const minted: string[] = []
    const r = await gate(req('/wealth/spending', { host: 'demo.example.com', headers: NAV }), deps({ minted, requireSignIn: true }))
    // The host check still comes first, so the demo needs its host named.
    assert.equal(r.status, 421)
    process.env.RELIFE_ALLOWED_HOSTS = 'demo.example.com'
    try {
      const ok = await gate(req('/wealth/spending', { host: 'demo.example.com', headers: NAV }), deps({ minted, requireSignIn: true }))
      assert.equal(kind(ok), 'next'); assert.ok(!setsCookie(ok)); assert.equal(minted.length, 0)
      assert.equal(kind(await gate(req('/api/capture', { host: 'demo.example.com' }), deps())), 'next', 'reads of the API pass')
    } finally { delete process.env.RELIFE_ALLOWED_HOSTS }
  })
})

test('demo: every write is refused with "Demo: changes are off", whatever its path', async () => {
  await inDemo(async () => {
    for (const [path, o] of [
      ['/', { method: 'POST' }], ['/api/ingest', { method: 'POST' }], ['/api/v1/today/actions', { method: 'POST' }],
      ['/api/v1/me', { method: 'DELETE' }], ['/coach', { method: 'PUT' }], ['/', { method: 'PATCH' }],
      ['/', { method: 'GET', headers: { 'next-action': 'abc' } }], ['/you/settings', { method: 'POST', headers: { 'next-action': 'abc' } }],
      ['/api/oauth/strava/start', { method: 'GET' }], ['/api/oauth/strava/callback', { method: 'GET' }], ['/api/v1/pair/redeem', { method: 'GET' }],
      // The phone: a Health Connect batch, a push subscription (add and remove) and a tapped notification button.
      ['/api/v1/health', { method: 'POST' }], ['/api/v1/push/subscription', { method: 'POST' }], ['/api/v1/push/subscription', { method: 'DELETE' }],
      ['/api/v1/push/action', { method: 'POST' }],
      // Imports: a chunk of an upload and its cancel.
      ['/api/import/00000000-0000-4000-8000-000000000001', { method: 'PUT' }], ['/api/import/00000000-0000-4000-8000-000000000001', { method: 'DELETE' }],
    ] as [string, { method?: string; headers?: Record<string, string> }][]) {
      const r = await gate(req(path, o), deps())
      assert.equal(r.status, 403, `${o.method} ${path}`)
      assert.equal(r.headers.get('x-relife-demo'), 'read-only', path)
      const body = await r.json()
      assert.equal(typeof body.error === 'string' ? body.error : body.error.message, 'Demo: changes are off', path)
    }
  })
})

test('demo: sign-in pages go home, health keeps its loopback rule, a bad host is 421', async () => {
  await inDemo(async () => {
    for (const p of ['/signin', '/pair']) {
      const r = await gate(req(p), deps())
      assert.equal(kind(r), 'redirect /', p)
    }
    assert.equal(kind(await gate(req('/api/health'), deps())), 'next')
    process.env.RELIFE_ALLOWED_HOSTS = 'demo.example.com'
    try { assert.equal((await gate(req('/api/health', { host: 'demo.example.com' }), deps())).status, 404) } finally { delete process.env.RELIFE_ALLOWED_HOSTS }
    assert.equal((await gate(req('/', { host: 'evil.example' }), deps())).status, 421)
  })
})
