// XP rules. Pure: no DB, no React. See AGENTS.md → Gamification for the reasoning.
//
// Two kinds of XP:
// - Consistency: how well you kept your own plan. A day is worth up to 100, split across whatever was
//   due, so adding more routines never raises the ceiling.
// - Standard: fixed measures that mean the same for everyone (7h sleep, 8k steps, a commit…). Data
//   that syncs by itself earns full XP; typed-in data earns half, capped per day.

export type Area = 'health' | 'mind' | 'skills' | 'wealth' | 'hobbies' | 'relationships'
export type XpKind = 'consistency' | 'standard' | 'bonus' | 'achievement'
export type XpAward = { source: string; area: Area | 'general'; kind: XpKind; amount: number; verified: boolean; reason: string }

export const DAILY_PLAN_XP = 100
export const MANUAL_CAP = 40 // max typed-in standard XP per day

/** Total XP needed to reach `level` (level 1 = 0). Tuned so level 5 takes about a week, 10 a month, 20 four months. */
export function xpForLevel(level: number) {
  return level <= 1 ? 0 : Math.round(70 * Math.pow(level - 1, 1.92))
}

export function levelFor(xp: number) {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  const floor = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { level, floor, next, progress: (xp - floor) / (next - floor) }
}

/** Area levels use a third of the overall curve: an area gets roughly a third of a day's XP. */
export function areaLevelFor(xp: number) {
  return levelFor(Math.round(xp * 3))
}

/**
 * Titles, Solo Leveling style: the System wakes you up and every tier is a rank you earn. On this curve level 5
 * takes about a week, 10 a month, 20 four months, 50 a couple of years of steady days.
 */
export const TITLES: { level: number; title: string }[] = [
  { level: 1, title: 'Awakened' },
  { level: 5, title: 'Initiate' },
  { level: 10, title: 'Pathfinder' },
  { level: 15, title: 'Challenger' },
  { level: 20, title: 'Vanguard' },
  { level: 25, title: 'Ascendant' },
  { level: 30, title: 'Elite' },
  { level: 35, title: 'Paragon' },
  { level: 40, title: 'Legend' },
  { level: 45, title: 'Mythic' },
  { level: 50, title: 'Sovereign' },
  { level: 60, title: 'Transcendent' },
]

export function titleFor(level: number) {
  return [...TITLES].reverse().find((t) => level >= t.level)!.title
}

export function nextTitle(level: number) {
  return TITLES.find((t) => t.level > level) ?? null
}

export type Medal = 'bronze' | 'silver' | 'gold' | 'sakura'
export const MEDALS: { medal: Medal; level: number; label: string }[] = [
  { medal: 'bronze', level: 5, label: 'Bronze' },
  { medal: 'silver', level: 10, label: 'Silver' },
  { medal: 'gold', level: 20, label: 'Gold' },
  { medal: 'sakura', level: 35, label: 'Sakura' },
]

/** Highest medal earned at this area level, if any. */
export function medalFor(areaLevel: number) {
  return [...MEDALS].reverse().find((m) => areaLevel >= m.level) ?? null
}

/** ×1.0 on day one, rising to ×1.5 at a 30-day streak. */
export function streakMultiplier(streak: number) {
  return 1 + Math.min(Math.max(streak, 0), 30) / 60
}

/** One day's inputs, gathered by core/xp.ts. */
export type DayInput = {
  /** Routine/medicine days that were due (skipped ones excluded), by area. done may be 0.5 for partial. */
  plan: { area: Area; done: number }[]
  sleepHours?: number; sleepVerified?: boolean
  steps?: number; stepsVerified?: boolean
  moodLogged?: boolean
  meditationMin?: number
  commits?: number; prs?: number
  learningMin?: number
  /** Competitive programming problems accepted (Codeforces, CodeChef, AtCoder). */
  solved?: number
  /** Spent less than your usual (median) day. undefined when there's no spending history. */
  frugal?: boolean
  catchUps?: number
  /** Minutes practised across all hobbies. */
  hobbyMin?: number
  /** Consecutive show-up days ending on this day. */
  streak: number
}

/** XP for one day. Same input, same output: recomputing a day never changes its total. */
export function scoreDay(d: DayInput): XpAward[] {
  const out: XpAward[] = []

  // Consistency: 100 XP split evenly across what was due, credited to each routine's area.
  if (d.plan.length) {
    const each = DAILY_PLAN_XP / d.plan.length
    const byArea = new Map<Area, number>()
    for (const p of d.plan) byArea.set(p.area, (byArea.get(p.area) ?? 0) + each * p.done)
    for (const [area, xp] of byArea) {
      const amount = Math.round(xp)
      if (amount > 0) out.push({ source: 'plan', area, kind: 'consistency', amount, verified: true, reason: 'Kept your plan' })
    }
  }

  // Standard measures.
  const std = (source: string, area: Area, amount: number, verified: boolean, reason: string) =>
    out.push({ source, area, kind: 'standard', amount: verified ? amount : Math.round(amount / 2), verified, reason })
  if ((d.sleepHours ?? 0) >= 7) std('sleep7', 'health', 15, !!d.sleepVerified, 'Slept 7 hours or more')
  if ((d.steps ?? 0) >= 8000) std('steps8k', 'health', 15, !!d.stepsVerified, 'Walked 8,000 steps')
  if (d.moodLogged) std('mood', 'mind', 5, true, 'Logged your mood')
  if ((d.meditationMin ?? 0) >= 10) std('meditate', 'mind', 10, false, 'Meditated 10 minutes')
  if ((d.commits ?? 0) >= 1) std('commit', 'skills', 10, true, 'Committed code')
  if ((d.prs ?? 0) >= 1) std('pr', 'skills', 20, true, 'Opened a pull request')
  if ((d.learningMin ?? 0) >= 30) std('learn', 'skills', 15, false, 'Learned for 30 minutes')
  if ((d.solved ?? 0) >= 1) std('solve', 'skills', 15, true, 'Solved a coding problem')
  if (d.frugal) std('frugal', 'wealth', 10, true, 'Spent less than a usual day')
  if ((d.catchUps ?? 0) >= 1) std('catchup', 'relationships', 15, false, 'Caught up with someone')
  if ((d.hobbyMin ?? 0) >= 20) std('hobby', 'hobbies', 20, false, 'Practised a hobby for 20 minutes')

  // Cap typed-in XP so a day of self-reports can't outscore real data.
  let manual = 0
  for (const a of out) {
    if (a.kind !== 'standard' || a.verified) continue
    const room = Math.max(0, MANUAL_CAP - manual)
    a.amount = Math.min(a.amount, room)
    manual += a.amount
  }

  // Streak bonus on top of the day's total.
  const base = out.reduce((s, a) => s + a.amount, 0)
  const bonus = Math.round(base * (streakMultiplier(d.streak) - 1))
  if (bonus > 0) out.push({ source: 'streak', area: 'general', kind: 'bonus', amount: bonus, verified: true, reason: `${d.streak}-day streak` })

  return out.filter((a) => a.amount > 0)
}
