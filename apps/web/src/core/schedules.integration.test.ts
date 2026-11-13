import assert from 'node:assert/strict'
import test from 'node:test'
import { and, eq } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database:
 *
 * RELIFE_MOCK=1 RELIFE_SCHEDULES_INTEGRATION=1 npx tsx --env-file=.env --test src/core/schedules.integration.test.ts
 */
const enabled = process.env.RELIFE_SCHEDULES_INTEGRATION === '1'

test('goal steps undo exactly once, medicine stock and insights survive double taps, bad rules do not break the day', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema, sql } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { addGoalProgress, undoLastGoalStep, setCheck, dayAgenda } = await import('./schedules')
  const { undoQuickLogWrite } = await import('./quicklog')
  const { acceptInsight } = await import('./insights')
  const { buildRRule } = await import('@/domain/recurrence')

  const [user] = await db.insert(schema.users).values({ name: 'Schedules Integration', timezone: 'Asia/Kolkata', baseCurrency: 'INR' }).returning()
  const at = new Date('2026-11-11T06:00:00.000Z')
  const total = async (slug: string) => {
    const rows = await db.select({ value: schema.entries.value }).from(schema.entries)
      .innerJoin(schema.trackers, eq(schema.trackers.id, schema.entries.trackerId))
      .where(and(eq(schema.entries.userId, user.id), eq(schema.trackers.slug, slug), eq(schema.entries.localDate, '2026-11-11')))
    return rows.length ? Number(rows[0].value) : null
  }
  try {
    // Goal steps: the token undoes its own step once, even sent twice, and still finds its day later.
    const [water] = await db.insert(schema.schedules).values({
      userId: user.id, name: 'Water', kind: 'routine', category: 'health', target: 3000, unit: 'ml',
      rrule: buildRRule({ freq: 'daily', times: ['09:00'], start: '2026-11-01' }), meta: { trackerSlug: 'water', step: 250 },
    }).returning()
    const a = await addGoalProgress(user, water.id, 250, at)
    await addGoalProgress(user, water.id, 500, new Date(at.getTime() + 1000))
    assert.equal(await total('water'), 750)
    await Promise.all([undoQuickLogWrite(user, a), undoQuickLogWrite(user, a)])
    assert.equal(await total('water'), 500)
    assert.equal(await undoLastGoalStep(user, water.id, at), true)
    assert.equal(await total('water'), null)
    assert.equal(await undoLastGoalStep(user, water.id, at), false)

    // Medicine: two "done" taps at once take one dose from stock and add the tracker value once.
    const [med] = await db.insert(schema.schedules).values({
      userId: user.id, name: 'Vitamin', kind: 'medicine', category: 'health', target: 2, unit: 'x',
      rrule: buildRRule({ freq: 'daily', times: ['09:00'], start: '2026-11-01' }), meta: { stock: 10, doseCount: 2, trackerSlug: 'vitamin' },
    }).returning()
    const occ = new Date('2026-11-11T03:30:00.000Z')
    await Promise.all([setCheck(user, med.id, occ, 'done', 2), setCheck(user, med.id, occ, 'done', 2)])
    const stock = async () => ((await db.select().from(schema.schedules).where(eq(schema.schedules.id, med.id)))[0].meta as { stock: number }).stock
    assert.equal(await stock(), 8)
    assert.equal(await total('vitamin'), 2)
    await Promise.all([setCheck(user, med.id, occ, null), setCheck(user, med.id, occ, null)])
    assert.equal(await stock(), 10, 'clearing twice gives the dose back once')

    // Insights: a double approve adds the proposed routine once; an invalid rule is refused and stays pending.
    const propose = async (rrule: string) => (await db.insert(schema.insights).values({
      userId: user.id, kind: 'plan', title: 'Plan', body: 'x', payload: { actions: [{ type: 'schedule', name: `Walk ${rrule}`, kind: 'routine', category: 'health', rrule }] },
    }).returning())[0]
    const rule = 'FREQ=DAILY;BYHOUR=7;BYMINUTE=0'
    const ok = await propose(rule)
    await Promise.all([acceptInsight(user, ok.id), acceptInsight(user, ok.id)])
    const walks = await db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.name, `Walk ${rule}`)))
    assert.equal(walks.length, 1)
    assert.equal((await db.select().from(schema.plans).where(eq(schema.plans.insightId, ok.id))).length, 1)
    const bad = await propose('FREQ=MINUTELY;BYHOUR=7')
    assert.equal(await acceptInsight(user, bad.id), null)
    assert.equal((await db.select().from(schema.insights).where(eq(schema.insights.id, bad.id)))[0].status, 'pending')

    // A bad stored rule skips that routine only.
    await db.insert(schema.schedules).values({ userId: user.id, name: 'Broken', kind: 'routine', category: 'health', rrule: 'FREQ=EVERYDAY' })
    const agenda = await dayAgenda(user, '2026-11-11', at)
    assert.ok(agenda.some((i) => i.schedule.name === 'Water'))
    assert.ok(!agenda.some((i) => i.schedule.name === 'Broken'))
  } finally {
    await db.delete(schema.users).where(eq(schema.users.id, user.id))
    await sql.end()
  }
})
