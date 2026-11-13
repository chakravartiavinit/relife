import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { and, eq } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database:
 *
 * RELIFE_MOCK=1 RELIFE_INGEST_INTEGRATION=1 npx tsx --env-file=../../.env --test src/core/ingest.integration.test.ts
 */
const enabled = process.env.RELIFE_INGEST_INTEGRATION === '1'
after(async () => { if (enabled) await (await import('@/db')).sql.end() })

test('a day that goes A to B to A is parsed again each time, and an unchanged day is left alone', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { emitRawMany, processOne } = await import('./ingest')
  const { emitDays } = await import('@/connectors/daily')
  const { getUser } = await import('./user')

  const user = await getUser()
  const source = 'todoist'
  const date = '2026-11-11'
  const emitted: { source: string; externalId: string; at: Date; body: unknown }[] = []
  const ctx = { emit: async (e: (typeof emitted)[number]) => { emitted.push(e) } } as never
  const row = async () => (await db.select().from(schema.rawEvents).where(and(eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.source, source), eq(schema.rawEvents.externalId, `day:${date}`))))[0]
  const sync = async (done: number) => {
    emitted.length = 0
    await emitDays(ctx, source, [{ date, done }])
    return emitRawMany(user.id, emitted)
  }
  const done = async () => {
    const r = await row()
    await processOne(user, r)
    const [e] = await db.select({ value: schema.entries.value }).from(schema.entries)
      .innerJoin(schema.trackers, eq(schema.trackers.id, schema.entries.trackerId))
      .where(and(eq(schema.entries.userId, user.id), eq(schema.trackers.slug, 'tasks.done'), eq(schema.entries.localDate, date), eq(schema.entries.source, source)))
    return Number(e?.value)
  }
  try {
    assert.equal(await sync(3), 1)
    assert.equal(await done(), 3)
    assert.equal(await sync(3), 0, 'unchanged: no new work')
    assert.equal((await row()).status, 'parsed')
    assert.equal(await sync(2), 1)
    assert.equal((await row()).status, 'new')
    assert.equal(await done(), 2)
    assert.equal(await sync(3), 1, 'back to the first numbers: parsed again, not stuck on B')
    assert.equal(await done(), 3)
  } finally {
    await db.delete(schema.rawEvents).where(and(eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.source, source), eq(schema.rawEvents.externalId, `day:${date}`)))
  }
})

test('an app order follows a changed total and disappears when it is cancelled', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { emitRawMany, processOne } = await import('./ingest')
  const { getUser } = await import('./user')

  const user = await getUser()
  const ref = 'zepto:ORDER-1'
  const order = { platform: 'zepto', name: 'Zepto', orderId: 'ORDER-1', at: '2026-11-11T06:00:00.000Z', total: 500, currency: 'INR', items: [{ name: 'Milk', qty: 1 }] }
  const txns = () => db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, user.id), eq(schema.transactions.source, 'zepto'), eq(schema.transactions.externalRef, ref)))
  const read = async (externalId: string, body: object) => {
    await emitRawMany(user.id, [{ source: 'zepto', externalId, at: new Date(order.at), body }])
    const [r] = await db.select().from(schema.rawEvents).where(and(eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.source, 'zepto'), eq(schema.rawEvents.externalId, externalId)))
    return processOne(user, r)
  }
  try {
    assert.equal(await read('zepto:ORDER-1', order), 'parsed')
    assert.equal(Number((await txns())[0].amount), -500)
    // A partial refund: the same order again with a smaller total updates it, once, not twice.
    await db.update(schema.rawEvents).set({ status: 'new' }).where(eq(schema.rawEvents.source, 'zepto'))
    assert.equal(await read('zepto:ORDER-1:total-400', { ...order, total: 400 }), 'parsed')
    const rows = await txns()
    assert.deepEqual([rows.length, Number(rows[0].amount)], [1, -400])
    // Cancelled later: the spending goes away.
    assert.equal(await read('zepto:ORDER-1:cancelled', { ...order, status: 'Cancelled' }), 'parsed')
    assert.equal((await txns()).length, 0)
  } finally {
    await db.delete(schema.transactions).where(and(eq(schema.transactions.userId, user.id), eq(schema.transactions.source, 'zepto')))
    await db.delete(schema.rawEvents).where(and(eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.source, 'zepto')))
  }
})
