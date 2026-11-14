import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

// A backup run that is cut off (power, kill -9) leaves its unpacked files in the backups folder, and those are not encrypted.

/** Remove `.tmp-*` folders and `*.partial` files. Only call while holding the backup lock: nothing else is writing then. */
export async function removeStale(dir: string): Promise<string[]> {
  const gone = (await readdir(dir)).filter((n) => n.startsWith('.tmp-') || n.endsWith('.partial'))
  for (const n of gone) await rm(join(dir, n), { recursive: true, force: true })
  return gone
}

/** A restore can take a while, so only folders this old are treated as left over. */
export const RESTORE_DIR_MAX_AGE_MS = 3 * 3_600_000

/** Remove `.restore-*` folders older than a few hours. */
export async function removeOldRestoreDirs(dir: string, now = Date.now()): Promise<string[]> {
  const gone: string[] = []
  for (const n of await readdir(dir)) {
    if (!n.startsWith('.restore-')) continue
    const s = await stat(join(dir, n)).catch(() => null)
    if (s && now - s.mtimeMs > RESTORE_DIR_MAX_AGE_MS) { await rm(join(dir, n), { recursive: true, force: true }); gone.push(n) }
  }
  return gone
}
