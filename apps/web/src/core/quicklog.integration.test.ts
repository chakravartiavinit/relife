import assert from 'node:assert/strict'
import test from 'node:test'
import { and, eq } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database:
 *
 * RELIFE_MOCK=1 RELIFE_QUICKLOG_INTEGRATION=1 npx tsx --env-file=.env --test src/core/quicklog.integration.test.ts
 */
const enabled = process.env.RELIFE_QUICKLOG_INTEGRATION === '1'

test('quick-log Undo round-trips and is safe to repeat', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema, sql } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { applyQuickLogWithUndo, undoQuickLogWrite } = await import('./quicklog')

  const [user] = await db.insert(schema.users).values({ name: 'Quicklog Integration', timezone: 'Asia/Kolkata', baseCurrency: 'INR' }).returning()
  const at = (ms: number) => new Date(Date.parse('2026-11-11T06:00:00.000Z') + ms)
  const manual = async (slug: string) => {
    const rows = await db.select({ value: schema.entries.value }).from(schema.entries)
      .innerJoin(schema.trackers, eq(schema.trackers.id, schema.entries.trackerId))
      .where(and(eq(schema.entries.userId, user.id), eq(schema.trackers.slug, slug), eq(schema.entries.localDate, '2026-11-11'), eq(schema.entries.source, 'manual')))
    return rows.length ? Number(rows[0].value) : null
  }
  try {
    // An add, undone twice (double tap, retry or a second tab), takes back only that one log.
    const first = await applyQuickLogWithUndo(user, { type: 'entry', slug: 'water', value: 250 }, at(0))
    const second = await applyQuickLogWithUndo(user, { type: 'entry', slug: 'water', value: 500 }, at(1))
    assert.equal(await manual('water'), 750)
    await undoQuickLogWrite(user, first.undo)
    await undoQuickLogWrite(user, first.undo)
    assert.equal(await manual('water'), 500)
    // Two Undos at the same moment still take it back once.
    await Promise.all([undoQuickLogWrite(user, second.undo), undoQuickLogWrite(user, second.undo)])
    assert.equal(await manual('water'), null, 'a day back at 0 has no manual row')
    // An add after the row went away starts clean; the old tokens stay spent.
    await applyQuickLogWithUndo(user, { type: 'entry', slug: 'water', value: 100 }, at(2))
    await undoQuickLogWrite(user, first.undo)
    assert.equal(await manual('water'), 100)

    // A set with nothing before it: Undo removes the manual value, again a no-op.
    const mood = await applyQuickLogWithUndo(user, { type: 'entry', slug: 'mood', value: 4 }, at(3))
    assert.deepEqual(mood.undo, { kind: 'set', slug: 'mood', date: '2026-11-11', prev: null })
    await undoQuickLogWrite(user, mood.undo)
    await undoQuickLogWrite(user, mood.undo)
    assert.equal(await manual('mood'), null)

    // A set over an earlier value goes back to it.
    await applyQuickLogWithUndo(user, { type: 'entry', slug: 'weight', value: 72 }, at(4))
    const weight = await applyQuickLogWithUndo(user, { type: 'entry', slug: 'weight', value: 71 }, at(5))
    await undoQuickLogWrite(user, weight.undo)
    await undoQuickLogWrite(user, weight.undo)
    assert.equal(await manual('weight'), 72)

    // A spend is deleted by its reference.
    const spend = await applyQuickLogWithUndo(user, { type: 'spend', amount: 120, currency: 'INR', note: 'chai' }, at(6))
    const spent = () => db.select({ id: schema.transactions.id }).from(schema.transactions).where(eq(schema.transactions.userId, user.id))
    assert.equal((await spent()).length, 1)
    await undoQuickLogWrite(user, spend.undo)
    await undoQuickLogWrite(user, spend.undo)
    assert.equal((await spent()).length, 0)
  } finally {
    await db.delete(schema.entries).where(eq(schema.entries.userId, user.id))
    await db.delete(schema.trackers).where(eq(schema.trackers.userId, user.id))
    await db.delete(schema.transactions).where(eq(schema.transactions.userId, user.id))
    await db.delete(schema.accounts).where(eq(schema.accounts.userId, user.id))
    await db.delete(schema.users).where(eq(schema.users.id, user.id))
    await sql.end()
  }
})
