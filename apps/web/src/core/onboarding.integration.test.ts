import assert from 'node:assert/strict'
import test from 'node:test'
import { eq, sql } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database:
 *
 * RELIFE_MOCK=1 RELIFE_ONBOARDING_INTEGRATION=1 npx tsx --env-file=.env --test src/core/onboarding.integration.test.ts
 */
const enabled = process.env.RELIFE_ONBOARDING_INTEGRATION === '1'

test('profile writes merge keys, and setup is one locked step that a double submit cannot repeat', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { mergeProfile } = await import('./user')
  const { completeOnboarding, skipOnboarding } = await import('./onboarding')

  const [user] = await db.insert(schema.users).values({ name: 'Onboarding Integration', timezone: 'Asia/Kolkata', baseCurrency: 'INR' }).returning()
  const saved = async () => (await db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0]
  const count = async (table: typeof schema.xpEvents | typeof schema.schedules) =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(table).where(eq(table.userId, user.id)))[0].n)
  const now = new Date('2026-11-13T06:00:00.000Z')
  const input = {
    name: 'Ada', timezone: 'Asia/Kolkata', baseCurrency: 'INR', areas: ['health', 'mind'] as ('health' | 'mind')[], improve: [],
    templates: ['water', 'journal'], waterMl: 2500,
  }
  try {
    // mergeProfile writes only its keys: another writer's key (celebratedLevel, set by the worker) survives.
    await db.update(schema.users).set({ profile: sql`'{"celebratedLevel": 7, "paymentsSeenAt": "2026-11-01T00:00:00.000Z"}'::jsonb` }).where(eq(schema.users.id, user.id))
    await mergeProfile(user.id, { areas: ['health'], goals: undefined })
    let p = (await saved()).profile as Record<string, unknown>
    assert.deepEqual([p.celebratedLevel, p.paymentsSeenAt, p.areas], [7, '2026-11-01T00:00:00.000Z', ['health']])

    // A stale cached user (no celebratedLevel) must not reset it, and an old user object must not undo a newer key.
    const stale = await saved()
    await db.update(schema.users).set({ profile: sql`${schema.users.profile} || '{"celebratedLevel": 9}'::jsonb` }).where(eq(schema.users.id, user.id))
    await db.insert(schema.xpEvents).values({ userId: user.id, localDate: '2026-11-12', area: 'health', kind: 'standard', source: 'old', amount: 10, verified: true, reason: 'old', ref: 'old:1' })

    // Double submit: both start together, one wipes and sets up, the other sees setup done.
    const [a, b] = await Promise.all([completeOnboarding(stale, input, now), completeOnboarding(stale, input, now)])
    assert.deepEqual([a.fresh, b.fresh].sort(), [false, true])
    assert.equal(a.added + b.added, 2)
    assert.equal(await count(schema.schedules), 2)
    assert.equal(await count(schema.xpEvents), 0)
    p = (await saved()).profile as Record<string, unknown>
    assert.equal(p.celebratedLevel, 9)
    assert.equal(p.xpSince, '2026-11-13')
    assert.equal(p.onboardedAt, now.toISOString())
    assert.equal((await saved()).name, 'Ada')

    // Running it again from Settings never wipes XP earned since.
    await db.insert(schema.xpEvents).values({ userId: user.id, localDate: '2026-11-13', area: 'health', kind: 'standard', source: 'new', amount: 10, verified: true, reason: 'new', ref: 'new:1' })
    assert.equal((await completeOnboarding(stale, { ...input, name: 'Ada L' }, now)).fresh, false)
    assert.equal(await count(schema.xpEvents), 1)
    assert.equal(await count(schema.schedules), 2)

    // Skipping touches only onboardedAt.
    const later = new Date('2026-11-14T06:00:00.000Z')
    await skipOnboarding(stale, later)
    p = (await saved()).profile as Record<string, unknown>
    assert.deepEqual([p.onboardedAt, p.celebratedLevel, p.xpSince], [later.toISOString(), 9, '2026-11-13'])
  } finally {
    await db.delete(schema.users).where(eq(schema.users.id, user.id))
    const { sql: client } = await import('@/db')
    await client.end({ timeout: 1 })
  }
})
