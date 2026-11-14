import { cp, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createWriteStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Transform } from 'node:stream'
import pkg from '../../../package.json'
import { sql } from '@/db'
import { backupName, humanSize, pickExpired, type BackupReason } from '@/domain/backups'
import { backupDir, dataDir } from '../paths'
import { utcToWall } from '../time'
import { ownerUser } from '../multi-user'
import { encryptStream } from './crypto'
import { removeOldRestoreDirs, removeStale } from './backup-tmp'
import { DEMO_MESSAGE, isDemo } from '../demo'
import { currentKey, keyFilePath } from './key'
import { databaseName, pgEnv, requirePgTool, spawnTo } from './pg'
import { schemaHash, TABLES } from './tables'

// A backup is one .tar.gz: a pg_dump of the database plus the files it needs (secret.key, vapid.json, library covers). It is exact,
// so it includes the key: that is why it is never offered as a browser download, and why a passphrase
// (RELIFE_BACKUP_PASSPHRASE) turns the whole archive into AES-256-GCM. browser/ (cookies, large) is left out.

export const BACKUP_FORMAT = 'relife-backup'
export const BACKUP_VERSION = 1

export type BackupManifest = {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: string
  reason: BackupReason
  appVersion: string
  schemaHash: string
  pgServerVersion: string
  db: string
  key: { source: 'env' | 'file' | 'none'; fingerprint?: string }
  savedKeys: number
  rows: Record<string, number>
}

/** How many daily backups to keep: RELIFE_BACKUP_KEEP, default 7. 0 turns backups off. */
export function keepDaily(): number {
  const raw = process.env.RELIFE_BACKUP_KEEP
  const n = raw === undefined || raw === '' ? 7 : Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : 7
}
export const keepWeekly = () => 4

/** `2026-11-13T033005` in the user's time zone. */
export const stamp = (now: Date, tz: string) => utcToWall(now, tz).toISOString().slice(0, 19).replaceAll(':', '')

export type BackupResult = { file: string; bytes: number; kept: number; message: string }

/** Write a backup now. Throws when one is already running (here or in another process) or the tools are missing. */
export async function backupNow(o: { reason: BackupReason; now?: Date } = { reason: 'manual' }): Promise<BackupResult> {
  if (isDemo()) throw new Error(DEMO_MESSAGE)
  const lock = await sql.reserve() // a session lock lives on one connection
  try {
    const [{ got }] = await lock`select pg_try_advisory_lock(hashtext('relife:backup')) as got`
    if (!got) throw new Error('A backup is already running.')
    try { return await write(o.reason, o.now ?? new Date()) } finally { await lock`select pg_advisory_unlock(hashtext('relife:backup'))` }
  } finally { lock.release() }
}

async function write(reason: BackupReason, now: Date): Promise<BackupResult> {
  const pgDump = await requirePgTool('pg_dump')
  const user = await ownerUser() // a whole-server backup belongs to the owner; the timezone is theirs
  const dir = backupDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await removeStale(dir) // we hold the lock, so nothing else is writing: leftovers are from a run that was cut off
  const work = await mkdtemp(join(dir, '.tmp-'))
  const passphrase = process.env.RELIFE_BACKUP_PASSPHRASE || undefined
  // Never overwrite: a second backup in the same second moves on to the next free second.
  let at = now
  const nameAt = () => join(dir, backupName(stamp(at, user.timezone), { reason, encrypted: !!passphrase }))
  while (existsSync(nameAt())) at = new Date(at.getTime() + 1000)
  const final = nameAt()
  const partial = `${final}.partial`
  try {
    await mkdir(join(work, 'data'), { recursive: true })
    await spawnTo(pgDump, ['--format=custom', '--no-owner', '--no-privileges'], { env: pgEnv(), output: createWriteStream(join(work, 'db.dump'), { mode: 0o600 }) })

    const key = currentKey()
    if (key.source === 'file') await cp(keyFilePath(), join(work, 'data', 'secret.key'))
    // The push keys: every saved browser subscription is tied to them, so a restore without them silences all of them.
    if (existsSync(dataDir('vapid.json'))) await cp(dataDir('vapid.json'), join(work, 'data', 'vapid.json'))
    if (existsSync(dataDir('library'))) await cp(dataDir('library'), join(work, 'data', 'library'), { recursive: true })

    const [{ n }] = await sql`select count(*)::int as n from connections where secrets_encrypted is not null`
    const [{ v }] = await sql`select current_setting('server_version') as v`
    const rows: Record<string, number> = {}
    for (const t of TABLES) rows[t.name] = Number((await sql.unsafe(`select count(*)::int as n from "${t.name}"`))[0].n)
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now.toISOString(), reason, appVersion: pkg.version,
      schemaHash: schemaHash(), pgServerVersion: String(v), db: databaseName(), key, savedKeys: Number(n), rows,
    }
    await writeFile(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 })

    // One -C so GNU, BSD and busybox tar all agree. With a passphrase the archive passes through the encryptor on its way to disk.
    const file = createWriteStream(partial, { mode: 0o600 })
    const sink = passphrase ? await encryptStream(passphrase) : file
    await Promise.all([
      spawnTo('tar', ['-czf', '-', '-C', work, '.'], { output: sink }),
      passphrase ? pipeline(sink as Transform, file) : undefined,
    ])
    await rename(partial, final)
  } catch (e) {
    await rm(partial, { force: true })
    throw e
  } finally {
    await rm(work, { recursive: true, force: true })
  }
  const bytes = (await stat(final)).size
  const kept = await prune()
  return { file: final, bytes, kept, message: `${humanSize(bytes)} · ${kept} kept` }
}

/** Delete expired backups. Returns how many backup files are left. */
export async function prune(): Promise<number> {
  const names = await readdir(backupDir())
  await removeOldRestoreDirs(backupDir())
  const expired = pickExpired(names, { daily: keepDaily(), weekly: keepWeekly() })
  for (const name of expired) await rm(backupDir(name), { force: true })
  return names.filter((n) => /^relife-backup-.*\.tar\.gz(\.enc)?$/.test(n)).length - expired.length
}
