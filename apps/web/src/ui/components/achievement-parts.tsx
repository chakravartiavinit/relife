import type { CATEGORY } from '../tokens'

export type BoardItem = {
  key: string; name: string; description: string; tier: 'bronze' | 'silver' | 'gold'
  area: keyof typeof CATEGORY | 'general'; xp: number
  unlockedAt: string | null
  /** The day it unlocked, in the user's time zone. */
  unlockedOn: string | null; progress: { value: number; target: number }
}

export const fmt = (n: number) => new Intl.NumberFormat('en-IN').format(n)

/** Locked achievements, closest first. */
export const lockedFirst = (items: BoardItem[]) =>
  items.filter((a) => !a.unlockedAt).sort((a, b) => b.progress.value / b.progress.target - a.progress.value / a.progress.target)

/** The closest to unlocking (three by default). At target means it unlocks on the next check: not "almost there" any more. */
export const almostThere = (items: BoardItem[], n = 3, skip?: string) =>
  lockedFirst(items).filter((a) => a.key !== skip && a.progress.value > 0 && a.progress.value < a.progress.target).slice(0, n)

/** Bronze, silver, gold: the order medals sit in on the strip. */
export const TIER_ORDER = { bronze: 0, silver: 1, gold: 2 } as const
