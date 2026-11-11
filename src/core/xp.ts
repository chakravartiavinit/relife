import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { CATEGORIES } from '@/db/schema'
import { ACHIEVEMENTS, longestRun, type AchievementStats } from '@/achievements'
import { areaLevelFor, levelFor, medalFor, nextTitle, scoreDay, titleFor, type Area, type DayInput } from '@/domain/xp'
import { streaks } from '@/domain/streaks'
import { loadAdherence } from '@/core/adherence'
import { activeDays, isSpend, trackerDays, transactionsBetween } from './metrics'
import { addDays, daysBetween, localDate } from './time'
import type { User } from './user'

// Scores days into xp_events and unlocks achievements. Days older than yesterday are final: the worker
// only rescores today and yesterday (and back-fills once when there is no XP yet).

const BALANCE_XP = 50
const TRACKERS = [
  'sleep.hours', 'steps', 'mood', 'meditation', 'github.commits', 'github.prs', 'learning.minutes', 'people.contacts', 'cp.solved',
  'exercise.minutes', 'tasks.done', 'coding.minutes', 'duolingo.xp', 'typing.minutes',
]
/** Hobby trackers that are time spent, not practice (Last.fm, Steam): shown on Hobbies, no hobby XP. */
const PASSIVE = new Set(['music', 'gaming'])

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Recompute XP for every day in [from, to] (local dates). Safe to repeat. */
export async function scoreRange(user: User, from: string, to: string, now = new Date()) {
  // Nothing before the fresh start (first finished setup) earns XP.
  const since = user.profile.xpSince
  if (since && from < since) from = since
  if (from > to) return
  const today = localDate(now, user.timezone)
  const window = daysBetween(from, today) + 1
  const [adherence, trackers, txns, active, hobbies] = await Promise.all([
    loadAdherence(user, { kinds: ['routine', 'medicine'] }, window, window, now),
    trackerDays(user, from, to, { slugs: TRACKERS }),
    transactionsBetween(user, addDays(from, -30), to),
    activeDays(user, addDays(from, -400)),
    trackerDays(user, from, to, { category: 'hobbies' }),
  ])
  // Practice minutes only: chess.games, ratings and other hobby stats aren't time.
  const hobbyMin = (d: string) => hobbies.filter((h) => h.tracker.unit === 'min' && !PASSIVE.has(h.tracker.slug)).reduce((s, h) => s + (h.days.get(d) ?? 0), 0)
  const t = (slug: string) => trackers.find((x) => x.tracker.slug === slug)
  const spendByDay = new Map<string, number>()
  for (const x of txns) if (isSpend(x)) spendByDay.set(x.localDate, (spendByDay.get(x.localDate) ?? 0) - x.base)

  const rows: (typeof schema.xpEvents.$inferInsert)[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    // A routine starts paying XP the day after it was created.
    const plan: DayInput['plan'] = []
    for (const r of adherence) {
      if (localDate(r.schedule.createdAt, user.timezone) >= d) continue
      const s = r.days.find((x) => x.date === d)?.status
      if (s === 'done') plan.push({ area: r.schedule.category, done: 1 })
      else if (s === 'partial') plan.push({ area: r.schedule.category, done: 0.5 })
      else if (s === 'missed' || s === 'pending') plan.push({ area: r.schedule.category, done: 0 })
    }
    const prior = Array.from({ length: 30 }, (_, i) => spendByDay.get(addDays(d, -(i + 1))) ?? 0)
    const usual = median(prior)
    const spent = spendByDay.get(d) ?? 0
    let streak = 0
    for (let x = d; active.has(x) && (!since || x >= since); x = addDays(x, -1)) streak++

    const awards = scoreDay({
      plan,
      sleepHours: t('sleep.hours')?.days.get(d), sleepVerified: t('sleep.hours')?.verified,
      steps: t('steps')?.days.get(d), stepsVerified: t('steps')?.verified,
      moodLogged: t('mood')?.days.has(d),
      meditationMin: t('meditation')?.days.get(d),
      commits: t('github.commits')?.days.get(d),
      prs: t('github.prs')?.days.get(d),
      learningMin: t('learning.minutes')?.days.get(d),
      solved: t('cp.solved')?.days.get(d),
      workoutMin: t('exercise.minutes')?.days.get(d),
      tasksDone: t('tasks.done')?.days.get(d),
      codingMin: t('coding.minutes')?.days.get(d),
      languageXp: t('duolingo.xp')?.days.get(d),
      typingMin: t('typing.minutes')?.days.get(d),
      frugal: prior.filter((v) => v > 0).length >= 7 && spent < usual ? true : undefined,
      catchUps: t('people.contacts')?.days.get(d),
      hobbyMin: hobbyMin(d),
      streak,
    })
    for (const a of awards) {
      rows.push({ userId: user.id, localDate: d, area: a.area, kind: a.kind, source: a.source, amount: a.amount, verified: a.verified, reason: a.reason, ref: `${d}:${a.source}:${a.area}` })
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(schema.xpEvents).where(and(
      eq(schema.xpEvents.userId, user.id), gte(schema.xpEvents.localDate, from), lte(schema.xpEvents.localDate, to),
      inArray(schema.xpEvents.kind, ['consistency', 'standard']), ne(schema.xpEvents.source, 'balance'),
    ))
    await tx.delete(schema.xpEvents).where(and(
      eq(schema.xpEvents.userId, user.id), gte(schema.xpEvents.localDate, from), lte(schema.xpEvents.localDate, to), eq(schema.xpEvents.source, 'streak'),
    ))
    for (let i = 0; i < rows.length; i += 500) await tx.insert(schema.xpEvents).values(rows.slice(i, i + 500)).onConflictDoNothing()
  })
  await awardBalance(user, from, to)
}

/** +50 XP the first day each week (Mon–Sun) that every area has earned XP. */
async function awardBalance(user: User, from: string, to: string) {
  const monday = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7))
  const start = monday(from)
  const rows = await db.select({ d: schema.xpEvents.localDate, area: schema.xpEvents.area }).from(schema.xpEvents)
    .where(and(eq(schema.xpEvents.userId, user.id), gte(schema.xpEvents.localDate, start), lte(schema.xpEvents.localDate, addDays(monday(to), 6)), ne(schema.xpEvents.area, 'general')))
  for (let wk = start; wk <= to; wk = addDays(wk, 7)) {
    const seen = new Set<string>()
    let day: string | null = null
    for (let d = wk; d < addDays(wk, 7) && d <= to; d = addDays(d, 1)) {
      for (const r of rows) if (r.d === d) seen.add(r.area)
      if (seen.size === CATEGORIES.length) { day = d; break }
    }
    if (!day) continue
    await db.insert(schema.xpEvents).values({
      userId: user.id, localDate: day, area: 'general', kind: 'bonus', source: 'balance', amount: BALANCE_XP, verified: true,
      reason: 'XP in every area this week', ref: `balance:${wk}`,
    }).onConflictDoUpdate({ target: [schema.xpEvents.userId, schema.xpEvents.ref], set: { localDate: day } })
  }
}

export async function totalXp(user: User) {
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${schema.xpEvents.amount}), 0)::int` }).from(schema.xpEvents).where(eq(schema.xpEvents.userId, user.id))
  return r.n
}

/** Everything the achievement checks need, in a few queries. */
export async function achievementStats(user: User, now = new Date()): Promise<AchievementStats> {
  const today = localDate(now, user.timezone)
  const [events, active, [totals], xp] = await Promise.all([
    db.select({ d: schema.xpEvents.localDate, source: schema.xpEvents.source, kind: schema.xpEvents.kind, amount: schema.xpEvents.amount })
      .from(schema.xpEvents).where(and(eq(schema.xpEvents.userId, user.id), ne(schema.xpEvents.kind, 'achievement'))),
    activeDays(user, user.profile.xpSince ?? addDays(today, -800)),
    db.select({
      commits: sql<number>`coalesce(sum(${schema.entries.value}) filter (where ${schema.trackers.slug} = 'github.commits'), 0)::float`,
      learning: sql<number>`coalesce(sum(${schema.entries.value}) filter (where ${schema.trackers.slug} = 'learning.minutes'), 0)::float`,
    }).from(schema.entries).innerJoin(schema.trackers, eq(schema.trackers.id, schema.entries.trackerId))
      .where(and(eq(schema.entries.userId, user.id), gte(schema.entries.localDate, user.profile.xpSince ?? '1970-01-01'))),
    totalXp(user),
  ])
  const sources = new Map<string, Set<string>>()
  const planByDay = new Map<string, number>()
  for (const e of events) {
    if (!sources.has(e.source)) sources.set(e.source, new Set())
    sources.get(e.source)!.add(e.d)
    if (e.kind === 'consistency') planByDay.set(e.d, (planByDay.get(e.d) ?? 0) + e.amount)
  }
  const xpDays = [...new Set(events.map((e) => e.d))].sort()
  let comebacks = 0
  for (let i = 1; i < xpDays.length; i++) if (daysBetween(xpDays[i - 1], xpDays[i]) > 3) comebacks++
  return {
    sources,
    fullPlanDays: new Set([...planByDay].filter(([, v]) => v >= 99).map(([d]) => d)),
    streakBest: streaks(active, today).best,
    commitsTotal: Number(totals?.commits ?? 0),
    learningMinutesTotal: Number(totals?.learning ?? 0),
    balanceWeeks: sources.get('balance')?.size ?? 0,
    level: levelFor(xp).level,
    comebacks,
  }
}

/** Unlock anything newly earned. Returns what was unlocked now, for the unlock animation. */
export async function checkAchievements(user: User, now = new Date()) {
  const stats = await achievementStats(user, now)
  const have = new Set((await db.select({ key: schema.achievements.key }).from(schema.achievements).where(eq(schema.achievements.userId, user.id))).map((r) => r.key))
  const today = localDate(now, user.timezone)
  const unlocked: Unlocked[] = []
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.key) || !a.check(stats).done) continue
    const [row] = await db.insert(schema.achievements).values({ userId: user.id, key: a.key, unlockedAt: now }).onConflictDoNothing().returning()
    if (!row) continue
    if (a.xp) {
      await db.insert(schema.xpEvents).values({
        userId: user.id, localDate: today, area: a.area, kind: 'achievement', source: `ach:${a.key}`, amount: a.xp, verified: true,
        reason: `Achievement: ${a.name}`, ref: `ach:${a.key}`,
      }).onConflictDoNothing()
    }
    unlocked.push({ key: a.key, name: a.name, tier: a.tier, xp: a.xp })
  }
  return unlocked
}

export type Unlocked = { key: string; name: string; tier: 'bronze' | 'silver' | 'gold'; xp: number }
/** What a log just changed, for toasts and celebrations. `from` is the level before; `newTitle` when the title changed. */
export type XpNews = { levelUp?: { level: number; title: string; from: number; newTitle: boolean }; unlocked: Unlocked[]; chests?: number }

/**
 * After logging (and on the worker's tick): spend streak freezes that save a streak, rescore today and
 * yesterday, unlock achievements, then earn chests for finished quests and new levels.
 */
export async function refreshXp(user: User, now = new Date()): Promise<XpNews> {
  const today = localDate(now, user.timezone)
  const { awardQuestChests, levelChests, useFreezes } = await import('./quests')
  const before = levelFor(await totalXp(user)).level
  await useFreezes(user, now)
  await scoreRange(user, addDays(today, -1), today, now)
  const unlocked = await checkAchievements(user, now)
  const after = levelFor(await totalXp(user)).level
  await levelChests(user, before, after)
  const chests = await awardQuestChests(user, now)
  return { levelUp: after > before ? { level: after, title: titleFor(after), from: before, newTitle: titleFor(after) !== titleFor(before) } : undefined, unlocked, chests }
}

/** First run: score the last 90 days so levels reflect history. */
export async function backfillXp(user: User, now = new Date(), days = 90) {
  const [any] = await db.select({ id: schema.xpEvents.id }).from(schema.xpEvents).where(eq(schema.xpEvents.userId, user.id)).limit(1)
  if (any) return false
  const today = localDate(now, user.timezone)
  await scoreRange(user, addDays(today, -(days - 1)), today, now)
  await checkAchievements(user, now)
  return true
}

/** Level, title, area levels and medals, today's activity XP and recent achievements, for the UI. */
export async function xpSummary(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const [byArea, [todayRow], recent] = await Promise.all([
    db.select({ area: schema.xpEvents.area, n: sql<number>`sum(${schema.xpEvents.amount})::int` }).from(schema.xpEvents)
      .where(eq(schema.xpEvents.userId, user.id)).groupBy(schema.xpEvents.area),
    db.select({ n: sql<number>`coalesce(sum(${schema.xpEvents.amount}), 0)::int` }).from(schema.xpEvents)
      .where(and(eq(schema.xpEvents.userId, user.id), eq(schema.xpEvents.localDate, today), ne(schema.xpEvents.kind, 'achievement'))),
    db.select().from(schema.achievements).where(eq(schema.achievements.userId, user.id)).orderBy(desc(schema.achievements.unlockedAt)).limit(3),
  ])
  const total = byArea.reduce((s, r) => s + r.n, 0)
  const lv = levelFor(total)
  const areas = CATEGORIES.map((c) => {
    const xp = byArea.find((r) => r.area === c)?.n ?? 0
    const al = areaLevelFor(xp)
    return { area: c as Area, xp, ...al, medal: medalFor(al.level) }
  })
  return {
    total, ...lv, title: titleFor(lv.level), nextTitle: nextTitle(lv.level), today: todayRow.n, areas,
    recent: recent.map((r) => ({ ...ACHIEVEMENTS.find((a) => a.key === r.key)!, unlockedAt: r.unlockedAt })).filter((a) => a.name),
  }
}

/** Daily activity XP for a chart (achievement rewards count toward level, not toward a day). */
export async function xpByDay(user: User, from: string, to: string) {
  const rows = await db.select({ d: schema.xpEvents.localDate, n: sql<number>`sum(${schema.xpEvents.amount})::int` }).from(schema.xpEvents)
    .where(and(eq(schema.xpEvents.userId, user.id), gte(schema.xpEvents.localDate, from), lte(schema.xpEvents.localDate, to), ne(schema.xpEvents.kind, 'achievement')))
    .groupBy(schema.xpEvents.localDate).orderBy(asc(schema.xpEvents.localDate))
  return new Map(rows.map((r) => [r.d, r.n]))
}

/** Biggest achievement awards so the Profile page can show progress on locked ones. */
export async function achievementBoard(user: User, now = new Date()) {
  const [stats, have] = await Promise.all([
    achievementStats(user, now),
    db.select().from(schema.achievements).where(eq(schema.achievements.userId, user.id)),
  ])
  return ACHIEVEMENTS.map((a) => {
    const row = have.find((h) => h.key === a.key)
    return { ...a, check: undefined, unlockedAt: row?.unlockedAt ?? null, progress: a.check(stats) }
  })
}

/** Where XP came from in a window: by kind and by area. Achievement rewards included. */
export async function xpBreakdown(user: User, from: string, to: string) {
  const range = and(eq(schema.xpEvents.userId, user.id), gte(schema.xpEvents.localDate, from), lte(schema.xpEvents.localDate, to))
  const [byKind, byArea] = await Promise.all([
    db.select({ kind: schema.xpEvents.kind, n: sql<number>`sum(${schema.xpEvents.amount})::int` }).from(schema.xpEvents).where(range).groupBy(schema.xpEvents.kind),
    db.select({ area: schema.xpEvents.area, n: sql<number>`sum(${schema.xpEvents.amount})::int` }).from(schema.xpEvents).where(range).groupBy(schema.xpEvents.area),
  ])
  return { byKind, byArea, total: byKind.reduce((s, r) => s + r.n, 0) }
}

/** Latest XP awards, newest first, for the activity feed. */
export async function recentXp(user: User, limit = 40) {
  return db.select({
    d: schema.xpEvents.localDate, area: schema.xpEvents.area, kind: schema.xpEvents.kind, amount: schema.xpEvents.amount,
    reason: schema.xpEvents.reason, verified: schema.xpEvents.verified, ref: schema.xpEvents.ref, source: schema.xpEvents.source,
  }).from(schema.xpEvents).where(eq(schema.xpEvents.userId, user.id))
    .orderBy(desc(schema.xpEvents.localDate), desc(schema.xpEvents.amount)).limit(limit)
}

/** Days with any XP, all time. */
export async function activeXpDays(user: User) {
  const [r] = await db.select({ n: sql<number>`count(distinct ${schema.xpEvents.localDate})::int` }).from(schema.xpEvents).where(eq(schema.xpEvents.userId, user.id))
  return r.n
}
