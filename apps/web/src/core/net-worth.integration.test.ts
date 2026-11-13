import assert from 'node:assert/strict'
import test from 'node:test'
import { eq } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database:
 *
 * RELIFE_MOCK=1 RELIFE_NETWORTH_INTEGRATION=1 npx tsx --env-file=.env --test src/core/net-worth.integration.test.ts
 */
const enabled = process.env.RELIFE_NETWORTH_INTEGRATION === '1'

test('net worth history and achievement stats read in the current base currency, from SQL aggregates', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema, sql } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { netWorthHistory } = await import('./net-worth')
  const { achievementStats } = await import('./xp')
  const { convert } = await import('./fx')

  const [user] = await db.insert(schema.users).values({ name: 'Net worth Integration', timezone: 'Asia/Kolkata', baseCurrency: 'USD' }).returning()
  try {
    const now = new Date('2026-11-11T06:00:00.000Z')
    // One day saved while the base currency was INR, one saved in the current USD, one from before the column (null).
    await db.insert(schema.netWorthSnapshots).values([
      { userId: user.id, localDate: '2026-11-09', currency: null, total: 9_000, cash: 0, crypto: 0 },
      { userId: user.id, localDate: '2026-11-10', currency: 'INR', total: 880_000, cash: 0, crypto: 0 },
      { userId: user.id, localDate: '2026-11-11', currency: 'USD', total: 10_000, cash: 0, crypto: 0 },
    ])
    const h = await netWorthHistory(user, 7, now)
    assert.equal(h.days.get('2026-11-11'), 10_000)
    assert.equal(h.days.get('2026-11-09'), 9_000, 'a row with no currency is read in the current base currency')
    assert.equal(h.days.get('2026-11-10'), await convert(880_000, 'INR', 'USD', '2026-11-10'))
    assert.ok(Math.abs(h.days.get('2026-11-10')! - 10_000) < 2_000, 'INR rows are converted, not plotted as dollars')

    // XP stats: three consecutive XP days, a gap of 5 days, then one more day = one comeback.
    const day = (d: string, source: string, kind: 'consistency' | 'standard', amount: number) =>
      ({ userId: user.id, localDate: d, area: 'health' as const, kind, source, amount, ref: `${d}:${source}` })
    await db.insert(schema.xpEvents).values([
      day('2026-11-01', 'plan', 'consistency', 60), day('2026-11-01', 'plan2', 'consistency', 40),
      day('2026-11-02', 'steps8k', 'standard', 10), day('2026-11-03', 'steps8k', 'standard', 10),
      day('2026-11-09', 'plan', 'consistency', 50),
    ])
    const s = await achievementStats(user, now)
    assert.equal(s.comebacks, 1)
    assert.deepEqual([...s.fullPlanDays], ['2026-11-01'])
    assert.deepEqual([...(s.sources.get('steps8k') ?? [])].sort(), ['2026-11-02', '2026-11-03'])
    assert.equal(s.balanceWeeks, 0)
    assert.equal(s.level >= 1, true)
  } finally {
    await db.delete(schema.users).where(eq(schema.users.id, user.id))
    await sql.end()
  }
})
