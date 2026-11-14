import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import postgres from 'postgres'
import { adoptedMigrations, columnKey, columnShape, OLDER_THAN_BASELINE, type Snapshot } from './migrate-adopt'

// Applies apps/web/drizzle/ to a database. `npm run db:migrate` and the Docker `migrate` service run it; so does the mock
// seeder inside the image, which has no drizzle-kit. `db:push` stays for local development.

/** The folder of generated migrations: `apps/web/drizzle`. Every script runs with apps/web as its working directory. */
export const migrationsFolder = () => resolve(/* turbopackIgnore: true */ process.cwd(), 'drizzle')

/** Creates the database when it is missing (mock mode names `<db>_mock`, which nobody created). Asks through `via`, the real DATABASE_URL, which exists. */
export async function ensureDatabase(url: string, via = process.env.DATABASE_URL ?? url) {
  const name = decodeURIComponent(new URL(url).pathname.slice(1))
  const admin = postgres(via, { max: 1, onnotice: () => {} })
  try {
    const [exists] = await admin`select 1 from pg_database where datname = ${name}`
    if (!exists) await admin.unsafe(`create database "${name.replaceAll('"', '""')}"`)
  } finally { await admin.end() }
}

/**
 * A database made by `db:push` has the tables but no history: the migrator would run the baseline and fail on "already
 * exists". When its tables and columns (names, types, nullability) are exactly what the newest snapshot describes, mark
 * every migration as applied (the same rows the migrator writes). Otherwise stop: marking a database that differs would
 * hide the difference from every later run. One transaction under an advisory lock, so two starts can't both adopt.
 * Returns how many were marked (0 when it had a history, was empty, or was already adopted).
 */
export async function adoptPushedDatabase(sql: postgres.Sql, folder = migrationsFolder()): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('relife:migrate'))`
    const [hasHistory] = await tx`select to_regclass('drizzle.__drizzle_migrations') as t`
    // An empty history table (a migrator that stopped before its first row) is no history.
    if (hasHistory.t) {
      const [{ n }] = await tx`select count(*)::int as n from drizzle.__drizzle_migrations`
      if (n > 0) return 0
    }
    const tables = await tx`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`
    if (tables.length === 0) return 0

    const rows = await tx`
      select c.relname as t, a.attname as c, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as nn
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped`
    const have = new Map(rows.map((r) => [columnKey(r.t, r.c), columnShape(r.type, r.nn)]))
    const journal = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as { entries: { idx: number }[] }
    const snapshots = journal.entries.map((e) => JSON.parse(readFileSync(join(folder, 'meta', `${String(e.idx).padStart(4, '0')}_snapshot.json`), 'utf8')) as Snapshot)
    const n = adoptedMigrations(have, snapshots)
    if (n === 0) throw new Error(OLDER_THAN_BASELINE)

    const files = readMigrationFiles({ migrationsFolder: folder }).slice(0, n)
    await tx`create schema if not exists drizzle`
    await tx`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`
    for (const f of files) await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${f.hash}, ${f.folderMillis})`
    return n
  })
}

/** Adopt a pushed database if needed, then apply what is missing. */
export async function runMigrations(url: string, o: { create?: boolean; log?: (m: string) => void } = {}) {
  const log = o.log ?? (() => {})
  if (!existsSync(join(migrationsFolder(), 'meta', '_journal.json'))) throw new Error(`No migrations in ${migrationsFolder()}. Run \`npm run db:generate\` first.`)
  if (o.create) await ensureDatabase(url)
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const adopted = await adoptPushedDatabase(sql)
    if (adopted) log(`This database was made by db:push: marked the first ${adopted} migration${adopted === 1 ? '' : 's'} as applied.`)
    await migrate(drizzle(sql), { migrationsFolder: migrationsFolder() })
  } finally { await sql.end() }
}
