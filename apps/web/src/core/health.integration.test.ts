import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { and, eq, inArray } from 'drizzle-orm'

/**
 * Opt-in (needs PostgreSQL): normal `npm test` never imports the DB client. Runs against the mock database. It posts the shared
 * Health Connect fixture the way the Android app does:
 *
 *   RELIFE_MOCK=1 RELIFE_HEALTH_INTEGRATION=1 npx tsx --env-file=../../.env --test src/core/health.integration.test.ts
 */
const enabled = process.env.RELIFE_HEALTH_INTEGRATION === '1'
const fixture = JSON.parse(readFileSync(new URL('../../../../packages/contract/fixtures/HealthBatch.full.json', import.meta.url), 'utf8')) as { source: string; days: { date: string; steps: number }[] }

test('a Health Connect batch lands as entries, a resend changes nothing, a changed day overwrites', { skip: !enabled }, async (t) => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'these tests need RELIFE_MOCK=1')
  const { db, databaseUrl, schema } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'the effective database must be a _mock one')
  const { createDevice } = await import('./auth/devices')
  const { getUser } = await import('./user')
  const { postHealth } = await import('./v1/health')
  const { GET: getToday } = await import('@/app/api/v1/today/route')
  const { GET: getMe } = await import('@/app/api/v1/me/route')
  const { POST: revoke } = await import('@/app/api/v1/devices/[id]/revoke/route')

  const user = await getUser()
  const dates = fixture.days.map((d) => d.date)
  const { device, token } = await createDevice({ userId: user.id, kind: 'phone', name: 'Pixel test · Health Connect', scopes: ['ingest'], meta: { platform: 'android-app/0.1.0' } })
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const post = (body: unknown) => postHealth(new Request('http://127.0.0.1:3030/api/v1/health', { method: 'POST', headers, body: JSON.stringify(body) }))
  const steps = async (date: string) => {
    const [e] = await db.select({ value: schema.entries.value }).from(schema.entries)
      .innerJoin(schema.trackers, eq(schema.trackers.id, schema.entries.trackerId))
      .where(and(eq(schema.entries.userId, user.id), eq(schema.trackers.slug, 'health-connect.steps'), eq(schema.entries.localDate, date), eq(schema.entries.source, 'health-connect')))
    return e ? Number(e.value) : undefined
  }
  t.after(async () => {
    await db.delete(schema.rawEvents).where(and(eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.source, 'health-connect'), inArray(schema.rawEvents.externalId, dates.map((d) => `day:${d}`))))
    await db.delete(schema.entries).where(and(eq(schema.entries.userId, user.id), eq(schema.entries.source, 'health-connect')))
    await db.delete(schema.devices).where(eq(schema.devices.id, device.id))
    await db.$client.end({ timeout: 2 })
  })

  await t.test('the first POST lands as entries and reports the server time zone', async () => {
    const res = await post(fixture)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual({ ok: body.ok, received: body.received, inserted: body.inserted, timezone: body.timezone }, { ok: true, received: 2, inserted: 2, timezone: user.timezone })
    assert.equal(await steps('2026-11-12'), 9120)
    assert.equal(await steps('2026-11-13'), 3150)
  })

  await t.test('sending the same days again inserts nothing', async () => {
    const body = await (await post(fixture)).json()
    assert.equal(body.received, 2)
    assert.equal(body.inserted, 0)
  })

  await t.test('a changed day overwrites its entries', async () => {
    const changed = { ...fixture, days: [{ ...fixture.days[0], steps: 9500 }] }
    const body = await (await post(changed)).json()
    assert.equal(body.inserted, 1)
    assert.equal(await steps('2026-11-12'), 9500)
    assert.equal(await steps('2026-11-13'), 3150, 'the other day is untouched')
  })

  await t.test('an empty batch only returns the time zone', async () => {
    const body = await (await post({ source: 'health-connect', days: [] })).json()
    assert.deepEqual(body, { ok: true, received: 0, inserted: 0, timezone: user.timezone })
  })

  await t.test('bad bodies are refused', async () => {
    assert.equal((await post({ source: 'health-connect', days: [{ date: 'yesterday' }] })).status, 400)
    assert.equal((await post({ source: 'health-connect', days: [{ date: '2026-11-12', steps: -5 }] })).status, 400)
    assert.equal((await post({ source: 'fitbit', days: [] })).status, 400)
  })

  await t.test('an ingest token reads nothing: 403 on Today and on /me, but it may sign itself out', async () => {
    assert.equal((await getToday(new Request('http://127.0.0.1:3030/api/v1/today', { headers }))).status, 403)
    const me = await getMe(new Request('http://127.0.0.1:3030/api/v1/me', { headers }))
    assert.equal(me.status, 403, 'it cannot read the account, as the approval card says')
    const out = await revoke(new Request('http://127.0.0.1:3030/api/v1/devices/me/revoke', { method: 'POST', headers }), { params: Promise.resolve({ id: 'me' }) } as never)
    assert.equal(out.status, 200)
    assert.equal((await post(fixture)).status, 401, 'signed out: the token is dead')
  })
})
