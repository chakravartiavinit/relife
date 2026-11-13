// Pure rules for the app shell: the sync dot, the area dots and the level ring.

import type { Category } from '@/db/schema'
import { CATEGORIES } from '@/domain/categories'

export type SyncTone = 'good' | 'warn' | 'bad'

/** The worker is alive when its heartbeat (written every minute) is under this old. */
export const WORKER_ALIVE_MS = 3 * 60_000

export const workerAlive = (heartbeat: Date | null | undefined, now = Date.now()) => !!heartbeat && now - heartbeat.getTime() < WORKER_ALIVE_MS

/** Worker offline is the worst news (nothing syncs); a failing connector is the next. */
export function syncTone(alive: boolean, failing: number): SyncTone {
  return !alive ? 'bad' : failing > 0 ? 'warn' : 'good'
}

/** "Synced 2 min ago", "Sync paused 2 h", "2 need a fix": the sync dot's label. */
export function syncLabel(tone: SyncTone, failing: number, lastSyncAt: Date | null, now = Date.now()): string {
  if (tone === 'warn') return `${failing} need${failing === 1 ? 's' : ''} a fix`
  const ago = lastSyncAt ? agoShort(now - lastSyncAt.getTime()) : null
  if (tone === 'bad') return ago ? `Sync paused ${ago}` : 'Sync paused'
  return ago ? `Synced ${ago} ago` : 'Not synced yet'
}

export function agoShort(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`
}

/** done: all due items are done; due: something is still due; none: nothing is due today. */
export type AreaToday = 'done' | 'due' | 'none'

export function areaToday(byCat: Record<Category, { done: number; total: number }>): Record<Category, AreaToday> {
  return Object.fromEntries(CATEGORIES.map((c) => {
    const { done, total } = byCat[c]
    return [c, total === 0 ? 'none' : done >= total ? 'done' : 'due']
  })) as Record<Category, AreaToday>
}
