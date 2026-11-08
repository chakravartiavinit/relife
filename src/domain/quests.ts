import { addDays } from '@/core/time'
import type { Area } from './xp'

// Quests, chests and streak freezes. Pure rules: no DB, no clock.
//
// Quests aren't stored. Each day (and week) gets a fixed pick from the quests your data can support,
// seeded by the date, and progress is read from what already earned XP. Finishing one earns a chest
// with a stable ref, so re-checking never pays twice.

/** What a quest counts. Most are XP award sources ("steps8k"); two are special. */
export type QuestMeasure = 'fullplan' | 'active' | 'sleep7' | 'steps8k' | 'mood' | 'commit' | 'learn' | 'frugal' | 'catchup' | 'meditate'
export type QuestTemplate = { key: string; period: 'day' | 'week'; title: string; measure: QuestMeasure; target: number; area: Area | 'general' }

export const DAILY: QuestTemplate[] = [
  { key: 'plan', period: 'day', title: 'Finish today’s whole plan', measure: 'fullplan', target: 1, area: 'general' },
  { key: 'steps', period: 'day', title: 'Walk 8,000 steps', measure: 'steps8k', target: 1, area: 'health' },
  { key: 'sleep', period: 'day', title: 'Sleep 7 hours or more', measure: 'sleep7', target: 1, area: 'health' },
  { key: 'mood', period: 'day', title: 'Log your mood', measure: 'mood', target: 1, area: 'mind' },
  { key: 'meditate', period: 'day', title: 'Meditate for 10 minutes', measure: 'meditate', target: 1, area: 'mind' },
  { key: 'commit', period: 'day', title: 'Commit some code', measure: 'commit', target: 1, area: 'skills' },
  { key: 'learn', period: 'day', title: 'Learn for 30 minutes', measure: 'learn', target: 1, area: 'skills' },
  { key: 'frugal', period: 'day', title: 'Spend less than a usual day', measure: 'frugal', target: 1, area: 'wealth' },
  { key: 'catchup', period: 'day', title: 'Catch up with someone', measure: 'catchup', target: 1, area: 'relationships' },
]

export const WEEKLY: QuestTemplate[] = [
  { key: 'w-active', period: 'week', title: 'Show up 6 days this week', measure: 'active', target: 6, area: 'general' },
  { key: 'w-plan', period: 'week', title: 'Finish your whole plan on 3 days', measure: 'fullplan', target: 3, area: 'general' },
  { key: 'w-steps', period: 'week', title: 'Walk 8,000 steps on 4 days', measure: 'steps8k', target: 4, area: 'health' },
  { key: 'w-sleep', period: 'week', title: 'Sleep 7 hours on 5 nights', measure: 'sleep7', target: 5, area: 'health' },
  { key: 'w-mood', period: 'week', title: 'Log your mood on 5 days', measure: 'mood', target: 5, area: 'mind' },
  { key: 'w-commit', period: 'week', title: 'Commit code on 5 days', measure: 'commit', target: 5, area: 'skills' },
  { key: 'w-frugal', period: 'week', title: 'Spend less than usual on 3 days', measure: 'frugal', target: 3, area: 'wealth' },
  { key: 'w-catchup', period: 'week', title: 'Catch up with people on 2 days', measure: 'catchup', target: 2, area: 'relationships' },
]

/** Monday of the week containing a local date. */
export function weekStart(day: string) {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(day, -((dow + 6) % 7))
}

/** FNV-1a, so the same seed always picks (and rolls) the same thing. */
export function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

/**
 * Pick quests for one period. Only measures your data can support are eligible (`available`),
 * quests outside your areas are skipped, and one quest from your focus area goes first when possible.
 */
export function pickQuests(opts: {
  period: 'day' | 'week'; seed: string; available: Set<QuestMeasure>; areas: Area[]; focus?: Area; count: number
}): QuestTemplate[] {
  const pool = (opts.period === 'day' ? DAILY : WEEKLY)
    .filter((q) => opts.available.has(q.measure) && (q.area === 'general' || opts.areas.includes(q.area)))
    .sort((a, b) => hash(`${opts.seed}:${a.key}`) - hash(`${opts.seed}:${b.key}`))
  const first = pool.find((q) => q.area === opts.focus) ?? pool[0]
  return first ? [first, ...pool.filter((q) => q !== first)].slice(0, opts.count) : []
}

/** Days in the period where the measure was met. `days` maps local date → measures met that day. */
export function questProgress(q: QuestTemplate, from: string, to: string, days: Map<string, Set<QuestMeasure>>) {
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) if (days.get(d)?.has(q.measure)) n++
  return Math.min(n, q.target)
}

export type Rarity = 'common' | 'rare' | 'epic'
export const FREEZE_CAP = 2
/** XP given instead of a freeze when you already hold the most you can. */
export const FREEZE_OVERFLOW_XP = 50

const CHEST: Record<Rarity, { min: number; max: number; freeze: number }> = {
  common: { min: 25, max: 50, freeze: 0.15 },
  rare: { min: 75, max: 125, freeze: 0.5 },
  epic: { min: 150, max: 250, freeze: 1 },
}

/** What's inside a chest. Fixed by its ref, so it's the same however many times it's computed. */
export function rollChest(rarity: Rarity, ref: string): { xp: number; freeze: boolean } {
  const c = CHEST[rarity]
  const a = hash(`${ref}:xp`) / 0xffffffff
  const b = hash(`${ref}:freeze`) / 0xffffffff
  return { xp: Math.round(c.min + a * (c.max - c.min)), freeze: b < c.freeze }
}

/**
 * Days a freeze should cover. Looks back from yesterday over missed days; if the gap reaches back
 * to a day you showed up (or one already frozen) and you hold enough freezes to fill it, all of it
 * is covered. A longer gap means the streak already ended, so nothing is spent.
 */
export function freezesToUse(opts: { covered: Set<string>; today: string; held: number; since?: string }): string[] {
  const gap: string[] = []
  for (let d = addDays(opts.today, -1); !opts.covered.has(d); d = addDays(d, -1)) {
    if (gap.length >= opts.held || (opts.since && d < opts.since)) return []
    gap.push(d)
  }
  return gap
}
