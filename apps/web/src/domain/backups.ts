// Backup file names and which old backups to delete. Pure: no files, no DB.

export type BackupReason = 'daily' | 'manual' | 'pre-restore'

export type BackupFile = {
  name: string
  /** The stamp in the name, read as a plain clock time (the timezone it was written in does not matter for ordering). */
  at: Date
  /** Only `pre-restore` is told apart by name: the other two are kept the same way. */
  preRestore: boolean
  encrypted: boolean
}

const NAME = /^relife-backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})?(-pre-restore)?\.tar\.gz(\.enc)?$/

/** `relife-backup-2026-11-13T033005.tar.gz`. `stamp` is a local date and time, `YYYY-MM-DDTHHmmss`. Names without seconds (`T0330`) are older ones and still parse. */
export function backupName(stamp: string, o: { reason: BackupReason; encrypted: boolean }) {
  return `relife-backup-${stamp}${o.reason === 'pre-restore' ? '-pre-restore' : ''}.tar.gz${o.encrypted ? '.enc' : ''}`
}

/** Null for any file that is not one of ours. */
export function parseBackupName(name: string): BackupFile | null {
  const m = NAME.exec(name)
  if (!m) return null
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map((x) => Number(x ?? 0))
  const at = new Date(Date.UTC(y, mo - 1, d, h, mi, sec))
  // 2026-02-31 rolls over to March: not a name we wrote.
  if (at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null
  return { name, at, preRestore: !!m[7], encrypted: !!m[8] }
}

/** ISO year and week number, as `2026-W46`. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day) // the Thursday of this week decides the year
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Names to delete. Keeps the newest `daily` backups, plus the newest backup of each of the `weekly` ISO weeks before
 * them (a week that already has a kept daily backup does not count). `pre-restore` backups and files that are not
 * ours are never listed. `daily` of 0 deletes nothing: backups are off, not "keep none".
 */
export function pickExpired(names: string[], o: { daily: number; weekly: number }): string[] {
  if (o.daily <= 0) return []
  const files = names.map(parseBackupName).filter((f): f is BackupFile => !!f && !f.preRestore)
    .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.name < b.name ? 1 : -1))
  const kept = files.slice(0, o.daily)
  const weeks = new Set(kept.map((f) => isoWeek(f.at)))
  let weekly = 0
  const expired: string[] = []
  for (const f of files.slice(o.daily)) {
    const w = isoWeek(f.at)
    if (weekly < o.weekly && !weeks.has(w)) { weeks.add(w); weekly++ } else expired.push(f.name)
  }
  return expired
}
