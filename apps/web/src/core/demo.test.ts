import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertDemoSafe, demoDevice, demoMethodAllowed, isDemo, seedDemoAllowed } from './demo'

test('the demo is on only for RELIFE_DEMO=1', () => {
  assert.ok(isDemo({ RELIFE_DEMO: '1' }))
  for (const v of [undefined, '', '0', 'true']) assert.ok(!isDemo({ RELIFE_DEMO: v }))
})

test('a demo without the mock database is refused', () => {
  assert.throws(() => assertDemoSafe({ RELIFE_DEMO: '1' }), /RELIFE_DEMO needs RELIFE_MOCK=1/)
  assert.throws(() => assertDemoSafe({ RELIFE_DEMO: '1', RELIFE_MOCK: '0' }), /mock database only/)
  assertDemoSafe({ RELIFE_DEMO: '1', RELIFE_MOCK: '1' })
  assertDemoSafe({ RELIFE_MOCK: '1' })
  assertDemoSafe({})
})

test('only reads pass the demo gate', () => {
  for (const m of ['GET', 'HEAD', 'OPTIONS']) assert.ok(demoMethodAllowed(m))
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.ok(!demoMethodAllowed(m))
})

test('the demo visitor is a full-scope browser that never expires', () => {
  const d = demoDevice('u1')
  assert.equal(d.userId, 'u1'); assert.deepEqual(d.scopes, ['full']); assert.equal(d.kind, 'browser'); assert.equal(d.revokedAt, null)
  assert.ok(d.expiresAt.getTime() > Date.now())
})

test('seed-demo refuses a database that holds data, and the demo itself', () => {
  const empty = { schedules: 0, entries: 0, transactions: 0 }
  assert.deepEqual(seedDemoAllowed({ dbName: 'relife', counts: empty, env: {} }), { ok: true })
  const used = seedDemoAllowed({ dbName: 'relife', counts: { schedules: 3, entries: 10, transactions: 0 }, env: {} })
  assert.ok(!used.ok && /relife/.test(used.reason) && /3 schedules/.test(used.reason) && /--force/.test(used.reason))
  assert.deepEqual(seedDemoAllowed({ dbName: 'relife', counts: { schedules: 3, entries: 0, transactions: 0 }, force: true, env: {} }), { ok: true })
  assert.ok(!seedDemoAllowed({ dbName: 'relife_mock', counts: empty, force: true, env: { RELIFE_DEMO: '1' } }).ok, 'not even with --force')
})
