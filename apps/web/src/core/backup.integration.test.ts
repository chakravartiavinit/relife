import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import postgres from 'postgres'
import { findPgTool } from './data/pg'

/**
 * Opt-in (RELIFE_BACKUP_INTEGRATION=1, RELIFE_MOCK=1), and skipped when pg_dump is not installed (RELIFE_PG_BIN or PATH).
 * Backs up the mock database, restores it into a scratch `<db>_restore_test` database that the test creates and drops,
 * and checks the key rules. `npm run restore` runs as a child process, as a person would run it.
 *
 * set -a; . ./.env; set +a
 * RELIFE_MOCK=1 RELIFE_BACKUP_INTEGRATION=1 tsx --test src/core/backup.integration.test.ts
 */
const enabled = process.env.RELIFE_BACKUP_INTEGRATION === '1' && !!findPgTool('pg_dump') && !!findPgTool('pg_restore')
const web = resolve(import.meta.dirname, '..', '..')

test('backup and restore round trip, key checks and safety backup', { skip: !enabled }, async (t) => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const tmp = mkdtempSync(join(tmpdir(), 'relife-backup-'))
  const dataDir = join(tmp, 'data')
  mkdirSync(dataDir)
  const myKey = randomBytes(32).toString('base64')
  writeFileSync(join(dataDir, 'secret.key'), myKey)
  mkdirSync(join(dataDir, 'library'))
  writeFileSync(join(dataDir, 'library', 'cover.jpg'), 'cover')
  process.env.RELIFE_DATA_DIR = dataDir
  process.env.RELIFE_BACKUP_DIR = join(tmp, 'backups')
  delete process.env.RELIFE_SECRET_KEY
  delete process.env.RELIFE_BACKUP_PASSPHRASE
  delete process.env.RELIFE_DEMO

  const { sql, databaseUrl } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'))
  const { encrypt } = await import('./secrets')
  const { backupNow } = await import('./data/backup')
  const [orig] = await sql`select secrets_encrypted from connections where connector_id = 'github'`
  await sql`update connections set secrets_encrypted = ${encrypt({ GITHUB_TOKEN: 'tok-secret-2' })} where connector_id = 'github'`

  const scratchName = `${new URL(process.env.DATABASE_URL!).pathname.slice(1)}_restore_test`
  const urlFor = (db: string) => Object.assign(new URL(process.env.DATABASE_URL!), { pathname: `/${db}` }).toString()
  const admin = postgres(urlFor('postgres'), { max: 1, onnotice: () => {} })
  const reset = async () => { await admin.unsafe(`drop database if exists "${scratchName}" with (force)`); await admin.unsafe(`create database "${scratchName}"`) }
  t.after(async () => {
    await admin.unsafe(`drop database if exists "${scratchName}" with (force)`).catch(() => {})
    await admin.end()
    await sql`update connections set secrets_encrypted = ${orig?.secrets_encrypted ?? null} where connector_id = 'github'`
    await sql.end()
    rmSync(tmp, { recursive: true, force: true })
  })

  const restore = (file: string, extra: string[] = [], env: Record<string, string> = {}, dir = 'scratch') => spawnSync(
    resolve(web, '..', '..', 'node_modules', '.bin', 'tsx'), ['--env-file=../../.env', 'scripts/restore.ts', file, '--yes', ...extra],
    { cwd: web, encoding: 'utf8', env: { ...process.env, DATABASE_URL: urlFor(scratchName), RELIFE_MOCK: '', RELIFE_DATA_DIR: join(tmp, dir), RELIFE_SECRET_KEY: '', ...env } },
  )
  const rowCounts = async (db: string) => {
    const c = postgres(urlFor(db), { max: 1 })
    try {
      return Object.fromEntries(await Promise.all(['users', 'entries', 'transactions', 'raw_events', 'connections', 'xp_events'].map(async (n) => [n, (await c.unsafe(`select count(*)::int as n from "${n}"`))[0].n])))
    } finally { await c.end() }
  }

  // 1. A plain backup.
  const now = new Date()
  const plain = await backupNow({ reason: 'manual', now })
  assert.match(plain.file, /relife-backup-\d{4}-\d{2}-\d{2}T\d{6}\.tar\.gz$/)
  assert.match(plain.message, /(KB|MB) · 1 kept$/)
  assert.deepEqual(readdirSync(process.env.RELIFE_BACKUP_DIR!).filter((n) => n.startsWith('.')), [], 'no temp folders are left')

  // A second backup in the same second is a second file, not an overwrite.
  const twin = await backupNow({ reason: 'manual', now })
  assert.notEqual(twin.file, plain.file)
  assert.ok(existsSync(plain.file) && existsSync(twin.file))
  rmSync(twin.file)

  // 2. Restore it into an empty scratch database: counts match, the key is readable, the key file and covers arrive.
  await reset()
  const r = restore(plain.file)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /1 of 1 saved keys readable/)
  assert.deepEqual(await rowCounts(scratchName), await rowCounts(new URL(databaseUrl).pathname.slice(1)))
  assert.ok(existsSync(join(tmp, 'scratch', 'secret.key')) && existsSync(join(tmp, 'scratch', 'library', 'cover.jpg')))
  assert.ok(!readdirSync(process.env.RELIFE_BACKUP_DIR!).some((n) => n.includes('pre-restore')), 'an empty database needs no safety backup')

  // 3. Restoring over a database that has data takes a pre-restore safety backup first.
  const again = restore(plain.file, [], { RELIFE_DATA_DIR: join(tmp, 'scratch'), RELIFE_BACKUP_DIR: join(tmp, 'scratch-backups') })
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.ok(readdirSync(join(tmp, 'scratch-backups')).some((n) => n.includes('-pre-restore.tar.gz')), again.stdout)

  // 4. A key that does not match is refused; --force restores and reports the keys as unreadable.
  await reset()
  const other = randomBytes(32).toString('base64')
  const refused = restore(plain.file, [], { RELIFE_SECRET_KEY: other })
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /Saved connector keys in this backup were encrypted with key/)
  assert.equal((await rowCounts(scratchName).catch(() => null)), null, 'nothing was restored: the database has no tables')
  const forced = restore(plain.file, ['--force'], { RELIFE_SECRET_KEY: other })
  assert.equal(forced.status, 0, forced.stdout + forced.stderr)
  assert.match(forced.stdout, /0 of 1 saved keys readable/)

  // 5. An encrypted backup: opaque on disk, needs the passphrase, a wrong one is refused before anything changes.
  process.env.RELIFE_BACKUP_PASSPHRASE = 'correct horse'
  const sealed = await backupNow({ reason: 'manual', now: new Date(Date.now() + 120_000) })
  delete process.env.RELIFE_BACKUP_PASSPHRASE
  assert.match(sealed.file, /\.tar\.gz\.enc$/)
  await reset()
  const noPass = restore(sealed.file)
  assert.match(noPass.stderr, /encrypted/)
  const wrong = restore(sealed.file, [], { RELIFE_BACKUP_PASSPHRASE: 'wrong' })
  assert.match(wrong.stderr, /Wrong passphrase/)
  const ok = restore(sealed.file, [], { RELIFE_BACKUP_PASSPHRASE: 'correct horse' })
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.deepEqual(await rowCounts(scratchName), await rowCounts(new URL(databaseUrl).pathname.slice(1)))
})
