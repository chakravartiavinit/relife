import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { parseBackupName } from '@/domain/backups'
import { backupDir, dataDir } from '../paths'
import { utcToWall } from '../time'
import type { User } from '../user'
import { keepDaily, keepWeekly } from './backup'
import { isDemo } from './demo'
import { currentKey } from './key'
import { pgDumpInstalled } from './pg'

// What Settings → Data & privacy shows about backups. Plain JSON; reads the backup folder, the `backup` job row and the
// worker heartbeat.

export type BackupState = 'never' | 'ok' | 'running' | 'failed' | 'off'
export type BackupStatus = {
  state: BackupState
  /** Why backups are off: no pg_dump, or RELIFE_BACKUP_KEEP=0. */
  offReason: 'no-pg-dump' | 'keep-zero' | null
  dir: string
  dataDir: string
  keep: number
  weekly: number
  encrypted: boolean
  /** Where the encryption key lives: a backup holds it unless it is RELIFE_SECRET_KEY. */
  keySource: 'file' | 'env' | 'none'
  workerUp: boolean
  demo: boolean
  /** The newest backup: "Today, 03:30", its size and name. */
  latest: { label: string; bytes: number; name: string } | null
  /** Backup files in the folder, all kinds. */
  count: number
  /** What the last run said ("12.3 MB · 9 kept", or the error). */
  lastResult: string | null
  nextRunAt: string | null
}

const WORKER_FRESH_MS = 3 * 60_000

function when(at: Date, now: Date) {
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const t = at.toISOString().slice(11, 16)
  const today = day(now)
  if (day(at) === today) return `Today, ${t}`
  if (day(at) === day(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${t}`
  return `${at.getUTCDate()} ${at.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}, ${t}`
}

export async function loadBackupStatus(user: User): Promise<BackupStatus> {
  const now = new Date()
  const [[job], [beat], files] = await Promise.all([
    db.select().from(schema.jobs).where(eq(schema.jobs.id, 'backup')),
    db.select().from(schema.heartbeats).where(eq(schema.heartbeats.name, 'worker')),
    existsSync(backupDir()) ? readdir(backupDir()) : Promise.resolve([] as string[]),
  ])
  const ours = files.map((n) => parseBackupName(n)).filter((f) => !!f).sort((a, b) => b.at.getTime() - a.at.getTime())
  const newest = ours[0]
  const keep = keepDaily()
  const tool = pgDumpInstalled()
  const running = !!job?.lockedUntil && job.lockedUntil > now
  const offReason = !tool ? 'no-pg-dump' : keep === 0 ? 'keep-zero' : null
  const state: BackupState = offReason ? 'off' : running ? 'running' : job?.lastOk === false ? 'failed' : newest ? 'ok' : 'never'
  return {
    state, offReason, dir: backupDir(), dataDir: dataDir(), keep, weekly: keepWeekly(),
    encrypted: !!process.env.RELIFE_BACKUP_PASSPHRASE, keySource: currentKey().source,
    workerUp: !!beat && now.getTime() - beat.at.getTime() < WORKER_FRESH_MS, demo: isDemo(),
    latest: newest ? { label: when(newest.at, utcToWall(now, user.timezone)), bytes: (await stat(backupDir(newest.name))).size, name: newest.name } : null,
    count: ours.length,
    lastResult: job?.lastResult ?? null,
    nextRunAt: job?.nextRunAt?.toISOString() ?? null,
  }
}
