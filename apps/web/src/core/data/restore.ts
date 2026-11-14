import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMock, sql } from '@/db'
import { backupDir, dataDir } from '../paths'
import { decrypt } from '../secrets'
import { BACKUP_FORMAT, BACKUP_VERSION, backupNow, type BackupManifest } from './backup'
import { decryptFile, isEncrypted } from './crypto'
import { DEMO_OFF, isDemo } from './demo'
import { currentKey, fingerprint, keyFilePath } from './key'
import { databaseName, requirePgTool, spawnTo, pgEnv } from './pg'
import brand from '@relife/brand/brand.json'

// Restore a backup (core/data/backup.ts) over this database. Every check that can fail runs before anything is changed:
// the archive is decrypted and unpacked into a temp folder first, and the key it needs is compared with the key in effect.

export type RestoreOptions = {
  /** Skip the typed confirmation. */
  yes?: boolean
  /** Restore even though the saved keys in the backup would not be readable. */
  force?: boolean
  /** Take a `pre-restore` backup first (default). Never taken when the database is empty. */
  safetyBackup?: boolean
  /** Asks the person to type `expected`; resolves true when they did. */
  confirm?: (expected: string) => Promise<boolean>
  log?: (line: string) => void
}

export type RestoreResult = { readable: number; total: number; safety?: string; replacedKey?: string; manifest: BackupManifest }

const WORKER_FRESH_MS = 3 * 60_000
const STOP_HINT = `Stop ${brand.name} first (\`npm run service -- stop\`, or \`docker compose stop web worker\`), then run this again.`

/** True when the app is (probably) running: a recent worker heartbeat, or other sessions on this database. */
async function appRunning(): Promise<string | null> {
  try {
    const [hb] = await sql`select at from heartbeats where name = 'worker'`
    if (hb && Date.now() - new Date(hb.at as string).getTime() < WORKER_FRESH_MS) return `The ${brand.name} worker is running.`
  } catch { /* no table yet: an empty database */ }
  const [{ n }] = await sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and backend_type = 'client backend'`
  return n > 0 ? `${n} other ${n === 1 ? 'connection is' : 'connections are'} open on this database.` : null
}

/** Nothing of yours in it: a fresh install, or a database that has no tables yet. */
async function databaseIsEmpty(): Promise<boolean> {
  try {
    const [r] = await sql`select (select count(*) from entries) + (select count(*) from raw_events) + (select count(*) from transactions) + (select count(*) from trackers) + (select count(*) from schedules) as n,
      coalesce((select bool_or(profile->>'onboardedAt' is not null) from users), false) as onboarded`
    return Number(r.n) === 0 && !r.onboarded
  } catch { return true }
}

export async function restoreBackup(file: string, o: RestoreOptions = {}): Promise<RestoreResult> {
  const log = o.log ?? (() => {})
  if (isDemo()) throw new Error(DEMO_OFF)
  if (isMock) throw new Error('Restore is off in mock mode: it would overwrite the mock database.')
  const pgRestore = await requirePgTool('pg_restore')
  const running = await appRunning()
  if (running) throw new Error(`${running} ${STOP_HINT}`)

  await mkdir(backupDir(), { recursive: true, mode: 0o700 })
  const work = await mkdtemp(join(backupDir(), '.restore-'))
  try {
    // 1. Open the archive (decrypt, unpack) and read what it says about itself.
    let archive = file
    if (await isEncrypted(file)) {
      const pass = process.env.RELIFE_BACKUP_PASSPHRASE
      if (!pass) throw new Error('This backup is encrypted. Set RELIFE_BACKUP_PASSPHRASE to its passphrase and run this again.')
      archive = join(work, 'archive.tar.gz')
      await decryptFile(file, archive, pass)
    }
    const dir = join(work, 'x')
    await mkdir(dir)
    await spawnTo('tar', ['-xzf', archive, '-C', dir]).catch((e) => { throw new Error(`Cannot open ${file}: ${(e as Error).message}`) })
    if (!existsSync(join(dir, 'manifest.json')) || !existsSync(join(dir, 'db.dump'))) throw new Error(`This is not a ${brand.name} backup (manifest.json or db.dump is missing).`)
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as BackupManifest
    if (manifest.format !== BACKUP_FORMAT) throw new Error(`This is not a ${brand.name} backup.`)
    if (typeof manifest.version !== 'number' || manifest.version > BACKUP_VERSION) throw new Error(`This backup is version ${manifest.version}, newer than this ${brand.name} understands (${BACKUP_VERSION}). Update ${brand.name} first.`)

    // 2. The key that will be in effect afterwards has to open the saved keys the backup holds.
    const backupKey = join(dir, 'data', 'secret.key')
    const effective = process.env.RELIFE_SECRET_KEY ? fingerprint(process.env.RELIFE_SECRET_KEY)
      : existsSync(backupKey) ? fingerprint(readFileSync(backupKey, 'utf8')) : currentKey().fingerprint
    if (manifest.savedKeys > 0 && effective !== manifest.key.fingerprint) {
      const msg = `Saved connector keys in this backup were encrypted with key ${manifest.key.fingerprint ?? '(unknown)'}. Set RELIFE_SECRET_KEY to that key or unset it${effective ? ` (the key in effect is ${effective})` : ' (no key is in effect)'}.`
      if (!o.force) throw new Error(`${msg} Use --force to restore anyway: those ${manifest.savedKeys} saved keys will then read as not saved.`)
      log(`Warning: ${msg}`)
    }

    // 3. Confirm.
    const expected = `RESTORE ${databaseName()}`
    log(`Backup of ${manifest.db} from ${manifest.createdAt.slice(0, 16).replace('T', ' ')} (${manifest.reason}).`)
    if (!o.yes && !(await o.confirm?.(expected))) throw new Error('Cancelled. Nothing was changed.')

    // 4. A safety backup of what is here now, unless there is nothing to lose.
    let safety: string | undefined
    if (o.safetyBackup !== false && !(await databaseIsEmpty())) {
      safety = (await backupNow({ reason: 'pre-restore' })).file
      log(`Safety backup: ${safety}`)
    }

    // 5. The database, in one transaction: an error leaves the old data as it was.
    log('Restoring the database…')
    await spawnTo(pgRestore, ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', '-d', databaseName()], { env: pgEnv(), input: join(dir, 'db.dump') })

    // 6. The key file (the old one is renamed, never deleted) and the library covers.
    let replacedKey: string | undefined
    if (existsSync(backupKey)) {
      const mine = keyFilePath()
      if (existsSync(mine) && readFileSync(mine, 'utf8').trim() !== readFileSync(backupKey, 'utf8').trim()) {
        replacedKey = `${mine}.replaced-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`
        await rename(mine, replacedKey)
        log(`Your previous key file was kept as ${replacedKey}`)
      }
      await mkdir(dataDir(), { recursive: true })
      await cp(backupKey, mine, { force: true })
      await chmod(mine, 0o600)
    }
    if (existsSync(join(dir, 'data', 'library'))) await cp(join(dir, 'data', 'library'), dataDir('library'), { recursive: true, force: true })

    // 7. Do the saved keys open?
    const saved = await sql`select connector_id, secrets_encrypted from connections where secrets_encrypted is not null`
    let readable = 0
    for (const r of saved) { try { decrypt(r.secrets_encrypted as Buffer); readable++ } catch { /* unreadable */ } }
    return { readable, total: saved.length, safety, replacedKey, manifest }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
