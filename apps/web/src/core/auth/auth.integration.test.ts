import assert from 'node:assert/strict'
import test from 'node:test'
import { eq } from 'drizzle-orm'

/**
 * Opt-in (needs PostgreSQL): normal `npm test` never imports the DB client. Runs against the mock database
 * (`relife_mock`, made by `npm run dev:mock` or `npm run mock:seed`), never your real one:
 *
 *   npm run test:auth -w apps/web
 */
const enabled = process.env.RELIFE_AUTH_INTEGRATION === '1'
const MIN = 60_000

test('devices, pairing and legacy tokens against PostgreSQL', { skip: !enabled }, async (t) => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'these tests need RELIFE_MOCK=1')
  const { db, databaseUrl, schema } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'the effective database must be a _mock one')
  const devices = await import('./devices')
  const pairing = await import('./pairing')
  const { hashToken } = await import('./tokens')
  const { scopeAllows } = await import('./trust')
  const { blockedFor } = await import('./ratelimit')

  const run = crypto.randomUUID().slice(0, 8)
  const [user] = await db.insert(schema.users).values({ name: `Auth test ${run}` }).returning()
  const ip = (n: number) => `test-${run}-${n}`
  const base = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1', via: '127.0.0.1' }
  t.after(async () => {
    await db.delete(schema.pairings).where(eq(schema.pairings.method, 'request')) // unowned requests of these tests
    await db.delete(schema.users).where(eq(schema.users.id, user.id)) // cascades devices and pairings
    await db.$client.end({ timeout: 2 })
  })

  await t.test('a device: find by token, scopes, touch at most every 5 minutes, revoke, expiry', async () => {
    const { device, token } = await devices.createDevice({ userId: user.id, kind: 'extension', name: 'Chrome', scopes: ['companion'] })
    assert.match(token, /^rlf_e_/)
    assert.deepEqual(device.tokenHash, hashToken(token))
    const found = await devices.findByToken(token)
    assert.ok(found.ok && found.device.id === device.id)
    assert.ok(found.ok && scopeAllows(found.device.scopes, 'companion') && !scopeAllows(found.device.scopes, 'full'))
    assert.deepEqual(await devices.findByToken('rlf_e_nothing'), { ok: false, reason: 'invalid' })

    const later = new Date(Date.now() + 6 * MIN)
    assert.equal(await devices.touchIfDue(device, new Date(Date.now() + MIN)), false, 'seen a minute ago: no write')
    assert.equal(await devices.touchIfDue(device, later), true)
    assert.equal(await devices.touchIfDue(device, new Date(later.getTime() + MIN)), false)

    assert.equal(await devices.revokeDevice(user.id, device.id), true)
    assert.deepEqual(await devices.findByToken(token), { ok: false, reason: 'revoked' }, 'a revoke shows at once, not after the 30 s cache')
    assert.equal(await devices.revokeDevice(user.id, device.id), false)

    const old = await devices.createDevice({ userId: user.id, kind: 'browser', name: 'Old', scopes: ['full'], now: new Date(Date.now() - 200 * 86_400_000) })
    assert.deepEqual(await devices.findByToken(old.token), { ok: false, reason: 'expired' }, '180 days unused')
  })

  await t.test('devices are scoped to their user', async () => {
    const [other] = await db.insert(schema.users).values({ name: `Other ${run}` }).returning()
    try {
      const { device } = await devices.createDevice({ userId: other.id, kind: 'browser', name: 'Theirs', scopes: ['full'] })
      assert.equal(await devices.revokeDevice(user.id, device.id), false, 'not yours to revoke')
      assert.equal(await devices.renameDevice(user.id, device.id, 'Mine now'), false)
      assert.ok(!(await devices.listDevices(user.id)).some((d) => d.id === device.id))
    } finally { await db.delete(schema.users).where(eq(schema.users.id, other.id)) }
  })

  await t.test('legacy ACTIVITY_TOKEN and INGEST_TOKEN become devices with their own scope only', async () => {
    const tokens: Record<string, string | undefined> = { ACTIVITY_TOKEN: `legacy-activity-${run}`, INGEST_TOKEN: `legacy-ingest-${run}` }
    await devices.syncLegacyTokens(user.id, (n) => tokens[n])
    const a = await devices.findByToken(tokens.ACTIVITY_TOKEN!)
    assert.ok(a.ok && a.device.kind === 'extension' && (a.device.meta as { legacy?: boolean }).legacy)
    assert.ok(a.ok && scopeAllows(a.device.scopes, 'companion') && !scopeAllows(a.device.scopes, 'full') && !scopeAllows(a.device.scopes, 'ingest'))
    const i = await devices.findByToken(tokens.INGEST_TOKEN!)
    assert.ok(i.ok && scopeAllows(i.device.scopes, 'ingest') && !scopeAllows(i.device.scopes, 'companion'))

    await devices.syncLegacyTokens(user.id, (n) => tokens[n]) // again: still one row each
    assert.equal((await devices.listDevices(user.id)).filter((d) => (d.meta as { legacy?: boolean }).legacy).length, 2)

    // The owner removes the old extension token in Devices: it stays removed while the same token is configured.
    assert.ok(a.ok && (await devices.revokeDevice(user.id, a.device.id)))
    await devices.syncLegacyTokens(user.id, (n) => tokens[n])
    assert.deepEqual(await devices.findByToken(tokens.ACTIVITY_TOKEN!), { ok: false, reason: 'revoked' })

    // A changed or cleared token retires the old one.
    tokens.INGEST_TOKEN = undefined
    await devices.syncLegacyTokens(user.id, (n) => tokens[n])
    assert.deepEqual(await devices.findByToken(`legacy-ingest-${run}`), { ok: false, reason: 'invalid' })
  })

  await t.test('flow A: an offer redeems once, then fails', async () => {
    const offer = await pairing.createOffer({ userId: user.id, deviceId: null, baseUrl: 'https://mac.tailnet.ts.net' })
    assert.match(offer.userCode, /^[2-9A-HJKMNP-TV-Z]{8}$/)
    const r = await pairing.redeem({ secret: offer.secret, ip: ip(1), ...base })
    assert.equal(r.device.kind, 'phone', 'an iPhone user agent is a phone')
    assert.equal(r.device.userId, user.id)
    assert.deepEqual(r.device.scopes, ['full'])
    await assert.rejects(pairing.redeem({ secret: offer.secret, ip: ip(1), ...base }), /expired or was already used/)
    await assert.rejects(pairing.redeem({ code: offer.userCode, ip: ip(1), ...base }), pairing.PairError)
    const s = await pairing.offerStatus(user.id, offer.id)
    assert.equal(s?.status, 'redeemed')
    assert.equal(s?.deviceId, r.device.id)
  })

  await t.test('flow A: a typed code works in any case with or without the dash, and the Mac app gets a full token in the body', async () => {
    const offer = await pairing.createOffer({ userId: user.id, deviceId: null, baseUrl: null })
    const typed = `${offer.userCode.slice(0, 4)} ${offer.userCode.slice(4)}`.toLowerCase()
    const r = await pairing.redeem({ code: typed, kind: 'mac', name: 'MacBook Pro', ip: ip(2), ...base })
    assert.equal(r.device.kind, 'mac')
    assert.equal(r.device.name, 'MacBook Pro')
    assert.match(r.token, /^rlf_m_/)
  })

  await t.test('flow A: expiry after 2 minutes', async () => {
    const offer = await pairing.createOffer({ userId: user.id, deviceId: null, baseUrl: null })
    await assert.rejects(pairing.redeem({ secret: offer.secret, ip: ip(3), ...base, now: new Date(Date.now() + 2 * MIN + 1000) }), pairing.PairError)
  })

  await t.test('flow A: at most 3 live offers, older ones expire', async () => {
    const offers = []
    for (let i = 0; i < 4; i++) offers.push(await pairing.createOffer({ userId: user.id, deviceId: null, baseUrl: null }))
    assert.equal((await pairing.offerStatus(user.id, offers[0].id))?.status, 'expired')
    for (const o of offers.slice(1)) assert.equal((await pairing.offerStatus(user.id, o.id))?.status, 'pending')
  })

  await t.test('flow A: 5 wrong codes expire the live offers; 20 failures per IP lock that IP out', async () => {
    const offer = await pairing.createOffer({ userId: user.id, deviceId: null, baseUrl: null })
    const wrong = offer.userCode.startsWith('2') ? '3AAAAAAA' : '2AAAAAAA'
    for (let i = 0; i < 5; i++) await assert.rejects(pairing.redeem({ code: wrong, ip: ip(4), ...base }), pairing.PairError)
    assert.equal((await pairing.offerStatus(user.id, offer.id))?.status, 'expired', 'five guesses and the offer is gone')
    await assert.rejects(pairing.redeem({ code: offer.userCode, ip: ip(5), ...base }), pairing.PairError)

    for (let i = 0; i < 15; i++) await assert.rejects(pairing.redeem({ code: wrong, ip: ip(4), ...base }), pairing.PairError)
    await assert.rejects(pairing.redeem({ code: wrong, ip: ip(4), ...base }), (e: unknown) => e instanceof pairing.PairError && e.code === 'rate_limited' && (e.retryAfter ?? 0) > 0)
    assert.ok((await blockedFor(`redeem:${ip(4)}`, 20, 10 * MIN)) > 0)
    assert.equal(await blockedFor(`redeem:${ip(6)}`, 20, 10 * MIN), 0, 'another IP is not locked')
  })

  const request = (o: Partial<Parameters<typeof pairing.startRequest>[0]> = {}) =>
    pairing.startRequest({ kind: 'mac', name: 'MacBook Pro', ip: ip(10), userAgent: 'ReLife/1', baseUrl: 'http://127.0.0.1:3030', via: '127.0.0.1', ...o })

  await t.test('flow B: request, approve, poll returns the token exactly once', async () => {
    const r = await request({ name: `Mac ${run} a` })
    assert.match(r.approveUrl, /^http:\/\/127\.0\.0\.1:3030\/pair\/approve\?r=/)
    assert.equal(r.interval, 2)
    assert.ok(r.expiresAt.getTime() - Date.now() > 9 * MIN)
    const t0 = new Date()
    assert.deepEqual(await pairing.poll(r.id, r.pollSecret, t0), { status: 'pending' })
    assert.ok((await pairing.pendingRequests()).some((p) => p.id === r.id))
    assert.equal((await pairing.requestByCode(r.userCode.toLowerCase(), ip(11)))?.id, r.id)

    assert.ok(await pairing.approveRequest({ id: r.id, userId: user.id, deviceId: null }))
    assert.equal(await pairing.approveRequest({ id: r.id, userId: user.id, deviceId: null }), null, 'approved once')
    const done = await pairing.poll(r.id, r.pollSecret, new Date(t0.getTime() + 2100))
    assert.ok(done.status === 'approved' && /^rlf_m_/.test(done.token) && done.device.userId === user.id)
    const again = await pairing.poll(r.id, r.pollSecret, new Date(t0.getTime() + 4200))
    assert.equal(again.status, 'expired', 'the token is handed over only once')
    const found = await devices.findByToken(done.status === 'approved' ? done.token : '')
    assert.ok(found.ok)
  })

  await t.test('flow B: polling faster than 2 seconds gets slow_down; a wrong poll secret is refused', async () => {
    const r = await request({ name: `Mac ${run} b` })
    const t0 = new Date()
    await pairing.poll(r.id, r.pollSecret, t0)
    await assert.rejects(pairing.poll(r.id, r.pollSecret, new Date(t0.getTime() + 300)), (e: unknown) => e instanceof pairing.PairError && e.code === 'rate_limited' && e.message === 'slow_down')
    assert.deepEqual(await pairing.poll(r.id, r.pollSecret, new Date(t0.getTime() + 2000)), { status: 'pending' })
    await assert.rejects(pairing.poll(r.id, 'not-the-secret', new Date(t0.getTime() + 9000)), pairing.PairError)
  })

  await t.test('flow B: deny, and expiry after 10 minutes', async () => {
    const d = await request({ name: `Mac ${run} c` })
    assert.equal(await pairing.denyRequest({ id: d.id, userId: user.id }), true)
    assert.deepEqual(await pairing.poll(d.id, d.pollSecret), { status: 'denied' })
    assert.equal(await pairing.approveRequest({ id: d.id, userId: user.id, deviceId: null }), null, 'a denied request cannot be approved')

    const e = await request({ name: `Mac ${run} d` })
    assert.deepEqual(await pairing.poll(e.id, e.pollSecret, new Date(Date.now() + 10 * MIN + 1000)), { status: 'expired' })
    assert.equal(await pairing.approveRequest({ id: e.id, userId: user.id, deviceId: null, now: new Date(Date.now() + 10 * MIN + 1000) }), null)
  })

  await t.test('flow B: the same kind, name and IP replaces the old request; at most 5 wait at once', async () => {
    await db.delete(schema.pairings).where(eq(schema.pairings.method, 'request'))
    const first = await request({ name: `Same ${run}`, ip: ip(20) })
    const second = await request({ name: `Same ${run}`, ip: ip(20) })
    assert.equal(await pairing.requestById(first.id), null, 'replaced')
    assert.ok(await pairing.requestById(second.id))
    for (let i = 0; i < 4; i++) await request({ name: `Many ${run} ${i}`, ip: ip(21 + i) })
    await assert.rejects(request({ name: `Too many ${run}`, ip: ip(30) }), (e: unknown) => e instanceof pairing.PairError && e.code === 'rate_limited')
    await db.delete(schema.pairings).where(eq(schema.pairings.method, 'request'))
  })

  await t.test('approving needs the exact code: a wrong code finds nothing', async () => {
    const r = await request({ name: `Code ${run}` })
    const wrong = r.userCode.startsWith('2') ? '3AAAAAAA' : '2AAAAAAA'
    assert.equal(await pairing.requestByCode(wrong, ip(40)), null)
    assert.equal(await pairing.requestByCode('abc', ip(40)), null)
  })
})
