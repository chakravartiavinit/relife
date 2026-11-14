import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database after `npm run mock:seed`:
 *
 * RELIFE_MOCK=1 RELIFE_NEEDS_INTEGRATION=1 npx tsx --env-file=.env --test src/core/needs-you.integration.test.ts
 */
const enabled = process.env.RELIFE_NEEDS_INTEGRATION === '1'

test('the shell badge count equals the Coach list length', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { databaseUrl, sql } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { getUser } = await import('./user')
  const { loadNeedsYou } = await import('./needs-you')
  const { loadShellStatus } = await import('./shell')
  try {
  const user = await getUser()
  const [{ items }, status] = await Promise.all([loadNeedsYou(user), loadShellStatus(user)])
  assert.ok(items.length > 0, 'seed the mock database first: npm run mock:seed')
  assert.equal(items.length, status.needsYou.total)
  assert.equal(items.filter((i) => i.kind === 'categorise' || i.kind === 'unread').length, status.needsYou.data)
  assert.equal(items.filter((i) => i.kind !== 'categorise' && i.kind !== 'unread').length, status.needsYou.decisions)
  } finally { await sql.end() } // a failed assertion must not leave the pool open and hang the run
})
