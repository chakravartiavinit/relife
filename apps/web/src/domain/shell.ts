// Pure rules for the app shell: the sync dot, today's and each area's progress, and the nav status.

import type { Category } from '@/db/schema'

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

/** Routines and goals checked off, and skipped (closed for the day, not left), out of those due. */
export type Progress = { done: number; total: number; skipped: number }

/** Done or skipped: nothing more to do about it today. */
export const closed = (p: Progress) => p.done + p.skipped
/** Still open: due and neither done nor skipped. */
export const left = (p: Progress) => p.total - closed(p)

/** done: every due item is done or skipped; due: something is still due; none: nothing is due today. */
export type AreaToday = 'done' | 'due' | 'none'

export function progressState(p: Progress): AreaToday {
  return p.total === 0 ? 'none' : closed(p) >= p.total ? 'done' : 'due'
}

/** What the sidebar and the phone tab bar show next to each destination: today's plan, each area's, and the Coach count. */
export type NavStatus = { today: Progress; areas: Record<Category, Progress>; coach: number }
