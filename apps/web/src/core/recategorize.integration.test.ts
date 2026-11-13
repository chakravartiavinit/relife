import assert from 'node:assert/strict'
import test from 'node:test'
import { and, eq } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database:
 *
 * RELIFE_MOCK=1 RELIFE_RECATEGORIZE_INTEGRATION=1 npx tsx --env-file=.env --test src/core/recategorize.integration.test.ts
 */
const enabled = process.env.RELIFE_RECATEGORIZE_INTEGRATION === '1'

test('recategorize Undo puts every moved payment and the rule back', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema, sql } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { recategorizeTxns, undoRecategorizeTxns } = await import('./recategorize')

  const [user] = await db.insert(schema.users).values({ name: 'Recategorize Integration', timezone: 'Asia/Kolkata', baseCurrency: 'INR' }).returning()
  const [account] = await db.insert(schema.accounts).values({ userId: user.id, key: 'test:cash', kind: 'manual_asset', name: 'Cash', currency: 'INR' }).returning()
  const t = schema.transactions
  const pay = async (merchant: string, category: string) => (await db.insert(t).values({
    userId: user.id, accountId: account.id, at: new Date('2026-11-11T06:00:00Z'), localDate: '2026-11-11', amount: -100, currency: 'INR',
    merchant, upiId: `${merchant.toLowerCase()}@upi`, category, source: 'test', externalRef: crypto.randomUUID(),
  }).returning())[0].id
  const categories = async () => Object.fromEntries((await db.select({ id: t.id, category: t.category }).from(t).where(eq(t.userId, user.id))).map((r) => [r.id, r.category]))
  const rule = async (pattern: string) => (await db.select({ category: schema.merchantRules.category }).from(schema.merchantRules)
    .where(and(eq(schema.merchantRules.userId, user.id), eq(schema.merchantRules.pattern, pattern))))[0]?.category ?? null

  try {
    // Remember: payments already filed elsewhere move too, and Undo puts each one back.
    const waiting = await pay('Chaipoint', 'Uncategorized')
    const filed = await pay('Chaipoint', 'Food delivery')
    const other = await pay('Elsewhere', 'Uncategorized')
    const before = await categories()
    const undo = await recategorizeTxns(user, waiting, 'Eating out', true)
    assert.equal(undo.moved.length, 2)
    assert.equal((await categories())[filed], 'Eating out')
    assert.equal(await rule('chaipoint@upi'), 'Eating out')
    await undoRecategorizeTxns(user, undo)
    await undoRecategorizeTxns(user, undo)
    assert.deepEqual(await categories(), before)
    assert.equal(await rule('chaipoint@upi'), null)
    assert.equal((await categories())[other], 'Uncategorized')

    // A rule that existed goes back to its old category.
    await db.insert(schema.merchantRules).values({ userId: user.id, pattern: 'chaipoint@upi', merchant: 'Chaipoint', category: 'Food delivery' })
    const again = await recategorizeTxns(user, waiting, 'Eating out', true)
    await undoRecategorizeTxns(user, again)
    assert.equal(await rule('chaipoint@upi'), 'Food delivery')

    // Without remember: a payment that was not waiting gets its own category back.
    const one = await recategorizeTxns(user, filed, 'Groceries', false)
    assert.deepEqual(one.moved, [{ id: filed, from: 'Food delivery' }])
    await undoRecategorizeTxns(user, one)
    assert.equal((await categories())[filed], 'Food delivery')

    // A payment changed again after the recategorize keeps the newer category.
    const later = await recategorizeTxns(user, waiting, 'Eating out', true)
    await db.update(t).set({ category: 'Gifts' }).where(eq(t.id, filed))
    await undoRecategorizeTxns(user, later)
    assert.equal((await categories())[filed], 'Gifts')
    assert.equal((await categories())[waiting], 'Uncategorized')
  } finally {
    await db.delete(schema.merchantRules).where(eq(schema.merchantRules.userId, user.id))
    await db.delete(t).where(eq(t.userId, user.id))
    await db.delete(schema.accounts).where(eq(schema.accounts.userId, user.id))
    await db.delete(schema.users).where(eq(schema.users.id, user.id))
    await sql.end()
  }
})
