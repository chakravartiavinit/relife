import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

/**
 * Opt-in: normal `npm test` never touches a database. Makes a scratch database next to yours and drops it again:
 *
 * RELIFE_MIGRATE_INTEGRATION=1 npx tsx --env-file=../../.env --test src/core/migrate-run.integration.test.ts
 */
const enabled = process.env.RELIFE_MIGRATE_INTEGRATION === '1'

/** Undoes what the migrations after number `n` added (1 = the baseline, 2 = + phone push, 5 = + people and parties), keeping the history rows. */
async function shapeOf(sql: postgres.Sql, n: number) {
  if (n < 5) { // 0004: people, roles and parties
    await sql`drop table if exists party_members`
    await sql`drop table if exists parties`
    await sql`alter table users drop column if exists role`
    await sql`alter table users drop column if exists disabled_at`
    await sql`alter table llm_runs drop column if exists user_id`
    await sql`alter table sync_runs drop column if exists user_id`
  }
  if (n < 3) {
    await sql`drop table if exists imports`
    await sql`alter table transactions drop column if exists linked_to`
  }
  if (n < 2) {
    await sql`drop table if exists push_subscriptions`
    await sql`alter table notifications drop column if exists channels`
  }
}

test('migrations apply, and a database made by push is adopted', { skip: !enabled }, async () => {
  const admin = process.env.DATABASE_URL
  assert.ok(admin, 'DATABASE_URL is required')
  const { runMigrations } = await import('./migrate-run')
  const name = `relife_migrate_it_${process.pid}_${Date.now()}`
  const url = Object.assign(new URL(admin), { pathname: `/${name}` }).toString()
  const open = () => postgres(url, { max: 1, onnotice: () => {} })
  // How many migrations the folder holds: 0000 the baseline, 0001 push subscriptions, 0002 imports, and so on.
  const total = (JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as { entries: unknown[] }).entries.length
  assert.ok(total >= 3)
  const history = async (sql: postgres.Sql) => (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n as number
  // What `db:push` leaves: every table, no history.
  const pushed = async () => { const sql = open(); try { await sql`drop schema if exists drizzle cascade` } finally { await sql.end() } }

  try {
    // 1. A new database.
    await runMigrations(url, { create: true })
    let sql = open()
    try {
      assert.equal(await history(sql), total)
      assert.ok((await sql`select to_regclass('public.users') as t`)[0].t)
    } finally { await sql.end() }
    await runMigrations(url) // again: nothing to do
    sql = open(); try { assert.equal(await history(sql), total) } finally { await sql.end() }

    // 2. Made by push: adopted, not re-created.
    await pushed()
    const logs: string[] = []
    await runMigrations(url, { log: (m) => logs.push(m) })
    assert.ok(logs.some((m) => /db:push/.test(m)), 'says it adopted')
    sql = open(); try { assert.equal(await history(sql), total) } finally { await sql.end() }

    // 3. An empty history table (the migrator stopped before its first row) is no history.
    await pushed()
    sql = open()
    try { await sql`create schema drizzle`; await sql`create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)` } finally { await sql.end() }
    await runMigrations(url)
    sql = open(); try { assert.equal(await history(sql), total) } finally { await sql.end() }

    // 4. Two starts at once: one adopts, the other waits and sees the history.
    await pushed()
    await Promise.all([runMigrations(url), runMigrations(url)])
    sql = open(); try { assert.equal(await history(sql), total) } finally { await sql.end() }

    // A migrated database taken back to what migration `n` left, its history trimmed to match: an install made before the later phases.
    const atVersion = async (n: number) => {
      const sql = open()
      try {
        await shapeOf(sql, n)
        await sql`delete from drizzle.__drizzle_migrations where id not in (select id from drizzle.__drizzle_migrations order by id limit ${n})`
      } finally { await sql.end() }
    }
    const everythingIsThere = async () => {
      const sql = open()
      try {
        for (const t of ['push_subscriptions', 'imports', 'parties', 'party_members']) assert.ok((await sql`select to_regclass(${'public.' + t}) as t`)[0].t, `${t} is there`)
        assert.ok((await sql`select 1 from information_schema.columns where table_name = 'notifications' and column_name = 'channels'`).length, 'the channels column is there')
        assert.ok((await sql`select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'linked_to'`).length, 'the linked_to column is there')
        assert.ok((await sql`select 1 from pg_indexes where indexname = 'transactions_linked_to'`).length, 'the unique link index is there')
        assert.ok((await sql`select 1 from information_schema.columns where table_name = 'users' and column_name = 'role'`).length, 'the role column is there')
        assert.equal((await sql`select count(*)::int as n from users where role = 'owner'`)[0].n, 0, 'no one yet, so no owner to backfill')
      } finally { await sql.end() }
    }

    // 5. A database at an older migration gets the later ones.
    for (const n of [1, 2]) {
      await pushed()
      await runMigrations(url)
      await atVersion(n)
      sql = open(); try { assert.equal(await history(sql), n) } finally { await sql.end() }
      await runMigrations(url)
      sql = open(); try { assert.equal(await history(sql), total) } finally { await sql.end() }
      await everythingIsThere()
    }

    // 6. A database pushed when only the first n migrations existed (their shape, no history) is adopted as those, then migrated up.
    for (const n of [1, 2]) {
      await pushed()
      sql = open(); try { await shapeOf(sql, n) } finally { await sql.end() }
      const log6: string[] = []
      await runMigrations(url, { log: (m) => log6.push(m) })
      assert.ok(log6.some((m) => new RegExp(`first ${n} migrations? `).test(m)), `adopted the first ${n}: ${log6.join(' | ')}`)
      sql = open(); try { assert.equal(await history(sql), total) } finally { await sql.end() }
      await everythingIsThere()
    }

    // 7. A pushed database that differs that differs (a column missing, a stray one) is refused and left alone.
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
