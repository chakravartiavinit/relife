import assert from 'node:assert/strict'
import { test } from 'node:test'
import postgres from 'postgres'

/**
 * Opt-in: normal `npm test` never touches a database. Makes a scratch database next to yours and drops it again:
 *
 * RELIFE_MIGRATE_INTEGRATION=1 npx tsx --env-file=../../.env --test src/core/migrate-run.integration.test.ts
 */
const enabled = process.env.RELIFE_MIGRATE_INTEGRATION === '1'

test('migrations apply, and a database made by push is adopted', { skip: !enabled }, async () => {
  const admin = process.env.DATABASE_URL
  assert.ok(admin, 'DATABASE_URL is required')
  const { runMigrations } = await import('./migrate-run')
  const name = `relife_migrate_it_${process.pid}_${Date.now()}`
  const url = Object.assign(new URL(admin), { pathname: `/${name}` }).toString()
  const open = () => postgres(url, { max: 1, onnotice: () => {} })
  const history = async (sql: postgres.Sql) => (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n as number
  // What `db:push` leaves: every table, no history.
  const pushed = async () => { const sql = open(); try { await sql`drop schema if exists drizzle cascade` } finally { await sql.end() } }

  try {
    // 1. A new database.
    await runMigrations(url, { create: true })
    let sql = open()
    try {
      assert.equal(await history(sql), 1)
      assert.ok((await sql`select to_regclass('public.users') as t`)[0].t)
    } finally { await sql.end() }
    await runMigrations(url) // again: nothing to do
    sql = open(); try { assert.equal(await history(sql), 1) } finally { await sql.end() }

    // 2. Made by push: adopted, not re-created.
    await pushed()
    const logs: string[] = []
    await runMigrations(url, { log: (m) => logs.push(m) })
    assert.ok(logs.some((m) => /db:push/.test(m)), 'says it adopted')
    sql = open(); try { assert.equal(await history(sql), 1) } finally { await sql.end() }

    // 3. An empty history table (the migrator stopped before its first row) is no history.
    await pushed()
    sql = open()
    try { await sql`create schema drizzle`; await sql`create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)` } finally { await sql.end() }
    await runMigrations(url)
    sql = open(); try { assert.equal(await history(sql), 1) } finally { await sql.end() }

    // 4. Two starts at once: one adopts, the other waits and sees the history.
    await pushed()
    await Promise.all([runMigrations(url), runMigrations(url)])
    sql = open(); try { assert.equal(await history(sql), 1) } finally { await sql.end() }

    // 5. A pushed database that differs (a column missing, a stray one) is refused and left alone.
    for (const change of ['alter table users drop column name', 'alter table users add column stray text']) {
      await pushed()
      sql = open()
      try { await sql.unsafe(change) } finally { await sql.end() }
      await assert.rejects(runMigrations(url), /db:push/, change)
      sql = open()
      try { assert.equal((await sql`select to_regclass('drizzle.__drizzle_migrations') as t`)[0].t, null, 'nothing was marked') } finally { await sql.end() }
      sql = open(); try { await sql.unsafe(change.includes('drop column') ? 'alter table users add column name text not null default \'\'' : 'alter table users drop column stray') } finally { await sql.end() }
    }
  } finally {
    const a = postgres(admin, { max: 1, onnotice: () => {} })
    try { await a.unsafe(`drop database if exists "${name}" with (force)`) } finally { await a.end() }
  }
})
