import { and, eq, gte, like, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { CATEGORY } from '@/ui/tokens'
import { weekStart } from '@/domain/quests'
import { goalPace } from '@/domain/day-plan'
import { streaks } from '@/domain/streaks'
import { spendDirection, type ShareData, type ShareKind } from '@/domain/share-card'
import { titleFor, xpForLevel } from '@/domain/xp'
import { loadAdherence } from './adherence'
import { goalsSummary } from './goals'
import { activeDays, isSpend, trackerDays, transactionsBetween } from './metrics'
import { addDays, localDate } from './time'
import type { User } from './user'
import { achievementBoard, xpBreakdown, xpSummary } from './xp'

// What a share card is made of. Every value is read here, from the signed-in user, and the query string only says
// which card: a level, an achievement or a week the user has not earned or reached is refused, so a URL cannot make
// ReLife draw a card for something that is not true. Money is read only to say "less / more than usual".

export type ShareLoad = { ok: true; data: ShareData } | { ok: false; status: 400 | 404; error: string }

const bad = (error: string): ShareLoad => ({ ok: false, status: 400, error })
const notEarned = (error: string): ShareLoad => ({ ok: false, status: 404, error })

export async function loadShareData(user: User, kind: ShareKind, ref: string | null, now = new Date()): Promise<ShareLoad> {
  const today = localDate(now, user.timezone)
  switch (kind) {
    case 'level': {
      const s = await xpSummary(user, now)
      const level = ref === null ? s.level : /^\d{1,3}$/.test(ref) ? Number(ref) : 0
      if (level < 1) return bad('ref must be a level number')
      if (level > s.level) return notEarned('That level is not reached yet.')
      // An earlier level shows what it took then, not today's totals.
      const current = level === s.level
      return { ok: true, data: { kind, name: user.name, level, title: titleFor(level), totalXp: current ? s.total : xpForLevel(level), areas: current ? s.areas.map((a) => ({ label: CATEGORY[a.area].label, level: a.level })) : [] } }
    }
    case 'streak': {
      const active = await activeDays(user, addDays(today, -400))
      const [{ n: freezes }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.streakFreezes).where(eq(schema.streakFreezes.userId, user.id))
      const st = streaks(active, today)
      return { ok: true, data: { kind, name: user.name, days: st.current, best: st.best, freezesUsed: freezes } }
    }
    case 'achievement': {
      if (!ref) return bad('ref must be an achievement key')
      const a = (await achievementBoard(user, now)).find((x) => x.key === ref)
      if (!a) return bad('Unknown achievement.')
      if (!a.unlockedAt) return notEarned('That achievement is not unlocked yet.')
      return { ok: true, data: { kind, name: user.name, title: a.name, tier: a.tier, date: localDate(a.unlockedAt, user.timezone) } }
    }
    case 'weekly': {
      const start = ref ?? weekStart(today)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || weekStart(start) !== start || Number.isNaN(Date.parse(start))) return bad('ref must be the Monday a week starts on (YYYY-MM-DD)')
      if (start > weekStart(today)) return notEarned('That week has not started.')
      return { ok: true, data: await weeklyData(user, start, today, now) }
    }
  }
}

async function weeklyData(user: User, start: string, today: string, now: Date): Promise<ShareData> {
  const end = addDays(start, 6)
  const last = end < today ? end : today
  const current = start === weekStart(today)
  // Routines day by day: `loadAdherence` looks back 60 days, so an older week has no routine line.
  const spanDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
  const [active, xp, track, txns, adherence, goals, cleared, chestQuests] = await Promise.all([
    activeDays(user, start),
    xpBreakdown(user, start, end),
    trackerDays(user, start, last, { slugs: ['steps', 'sleep.hours'] }),
    transactionsBetween(user, addDays(start, -28), last),
    spanDays <= 60 ? loadAdherence(user, { kinds: ['routine'] }, 60, spanDays, now) : Promise.resolve(null),
    current ? goalsSummary(user, now) : Promise.resolve(null),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.systemQuests).where(and(eq(schema.systemQuests.userId, user.id), eq(schema.systemQuests.status, 'cleared'), gte(schema.systemQuests.fromDate, start), lte(schema.systemQuests.fromDate, end))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.chests).where(and(eq(schema.chests.userId, user.id), like(schema.chests.ref, `quest:week:${start}:%`))),
  ])
  let daysShown = 0
  for (let d = start; d <= last; d = addDays(d, 1)) if (active.has(d)) daysShown++

  const avg = (slug: string) => {
    const days = track.find((t) => t.tracker.slug === slug)?.days
    const v = days ? [...days.entries()].filter(([d]) => d >= start && d <= last).map(([, x]) => x) : []
    return v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null
  }

  const spendIn = (from: string, to: string) => txns.filter((t) => t.localDate >= from && t.localDate <= to && isSpend(t)).reduce((s, t) => s - t.base, 0)

  let routines: { done: number; total: number } | null = null
  if (adherence) {
    let done = 0, total = 0
    for (const r of adherence) for (const d of r.days) {
      if (d.date < start || d.date > last) continue
      if (d.status === 'done') { done++; total++ } else if (d.status === 'partial' || d.status === 'missed') total++
    }
    routines = { done, total }
  }

  const top = [...xp.byArea].filter((r) => r.area in CATEGORY).sort((a, b) => b.n - a.n)[0]
  return {
    kind: 'weekly', name: user.name, weekStart: start, daysShown, xp: xp.total, questsCleared: cleared[0].n + chestQuests[0].n,
    topArea: top ? CATEGORY[top.area as keyof typeof CATEGORY].label : null, routines,
    goals: goals ? { total: goals.length, onPace: goals.filter((g) => ['Ahead', 'On pace', 'Reached'].includes(goalPace({ share: g.snapshot.outcome.progressShare, met: g.snapshot.outcome.status === 'met', startedOn: localDate(g.createdAt, user.timezone), targetDate: g.targetDate }, today).label)).length } : null,
    stepsAvg: avg('steps'), sleepAvgHours: avg('sleep.hours'),
    spend: spendDirection(spendIn(start, end), spendIn(addDays(start, -28), addDays(start, -1))),
  }
}
