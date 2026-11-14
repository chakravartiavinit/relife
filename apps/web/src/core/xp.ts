import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { CATEGORIES } from '@/db/schema'
import { ACHIEVEMENTS, type AchievementStats } from '@/achievements'
import { areaLevelFor, levelFor, medalFor, nextTitle, scoreDay, titleFor, type Area, type DayInput } from '@/domain/xp'
import { loadAdherence } from '@/core/adherence'
import { lockUser } from './recovery'
import { activeDays, isSpend, trackerDays, transactionsBetween } from './metrics'
import { addDays, daysBetween, localDate } from './time'
import type { User } from './user'

// Scores days into xp_events and unlocks achievements. Days older than yesterday are final: the worker
// only rescores today and yesterday (and back-fills once when there is no XP yet).

export const BALANCE_XP = 50
/** Steps from the phone and each wearable (one tracker per device, so they don't add up). */
const STEPS = ['steps', 'oura.steps', 'withings.steps', 'health-connect.steps']
const TRACKERS = [
  'sleep.hours', 'steps', 'mood', 'meditation', 'github.commits', 'github.prs', 'learning.minutes', 'people.contacts', 'cp.solved',
  'exercise.minutes', 'tasks.done', 'coding.minutes', 'duolingo.xp', 'typing.minutes', 'focus.minutes',
  'tracked.minutes', 'productive.minutes', 'highlights.made', 'anki.cards', 'books.read', 'hevy.minutes', 'oura.steps', 'withings.steps', 'health-connect.steps', 'health-connect.exercise.minutes',
]
/** Hobby trackers that are time spent, not practice (Last.fm, Steam): shown on Hobbies, no hobby XP. */
const PASSIVE = new Set(['listening', 'playtime'])

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
  // The highest step count of the day across devices.
  const bestSteps = (d: string) => {
    const best = STEPS.map((s) => ({ v: t(s)?.days.get(d), verified: t(s)?.verified })).filter((x) => x.v != null).sort((a, b) => b.v! - a.v!)[0]
    return { steps: best?.v, stepsVerified: best?.verified }
  }
  // Synced entries only, per day: a number typed into a synced tracker doesn't skip the manual cap.
  const synced = (slug: string, d: string) => t(slug)?.verifiedDays.get(d)
  // Hevy can post its workouts to Strava as well, and Health Connect holds both, so take the largest rather than adding them.
  const workoutMin = (d: string) => {
    const xs = [synced('exercise.minutes', d), synced('hevy.minutes', d), synced('health-connect.exercise.minutes', d)].filter((v) => v != null)
    return xs.length ? Math.max(...xs) : undefined
  }
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
      ...bestSteps(d),
      moodLogged: t('mood')?.days.has(d),
      meditationMin: t('meditation')?.days.get(d),
      commits: t('github.commits')?.days.get(d),
      prs: t('github.prs')?.days.get(d),
      learningMin: t('learning.minutes')?.days.get(d),
      solved: t('cp.solved')?.days.get(d),
      // Connector measures: only synced values count, so typed-in numbers can't skip the manual cap.
      workoutMin: workoutMin(d),
      tasksDone: synced('tasks.done', d),
      codingMin: synced('coding.minutes', d),
      languageXp: synced('duolingo.xp', d),
      typingMin: synced('typing.minutes', d),
      focusMin: synced('focus.minutes', d),
      trackedMin: synced('tracked.minutes', d),
      productiveMin: synced('productive.minutes', d),
      highlights: synced('highlights.made', d),
      ankiCards: synced('anki.cards', d),
      booksRead: synced('books.read', d),
      frugal: prior.filter((v) => v > 0).length >= 7 && spent < usual ? true : undefined,
      catchUps: t('people.contacts')?.days.get(d),
      hobbyMin: hobbyMin(d),
      streak,
    })
    for (const a of awards) {
      rows.push({ userId: user.id, localDate: d, area: a.area, kind: a.kind, source: a.source, amount: a.amount, verified: a.verified, reason: a.reason, ref: `${d}:${a.source}:${a.area}` })
    }
  }

  const stale = await db.transaction(async (tx) => {
    // Two rescoring runs at once (a log and the worker) would delete and re-insert the same rows: take turns.
    await lockUser(tx, user.id)
    // A fresh start (setup) that committed while this run computed its rows moved xpSince: these rows are stale
    // and would bring back XP the fresh start just wiped. Write nothing; the next rescore uses the new start.
    const [u] = await tx.select({ since: sql<string | null>`${schema.users.profile}->>'xpSince'` }).from(schema.users).where(eq(schema.users.id, user.id))
    if ((u?.since ?? undefined) !== (since ?? undefined)) return true
    await tx.delete(schema.xpEvents).where(and(
      eq(schema.xpEvents.userId, user.id), gte(schema.xpEvents.localDate, from), lte(schema.xpEvents.localDate, to),
      inArray(schema.xpEvents.kind, ['consistency', 'standard']), ne(schema.xpEvents.source, 'balance'),
    ))
    await tx.delete(schema.xpEvents).where(and(
      eq(schema.xpEvents.userId, user.id), gte(schema.xpEvents.localDate, from), lte(schema.xpEvents.localDate, to), eq(schema.xpEvents.source, 'streak'),
    ))
    for (let i = 0; i < rows.length; i += 500) await tx.insert(schema.xpEvents).values(rows.slice(i, i + 500)).onConflictDoNothing()
    return false
  })
  if (stale) return
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

/**
 * Everything the achievement checks need, aggregated in SQL (two statements, nothing per-row crosses the wire except
 * one array of days per XP source). Runs on every log, so it must not grow with the history.
 */
export async function achievementStats(user: User, now = new Date()): Promise<AchievementStats> {
  const today = localDate(now, user.timezone)
  const u = user.id
  const from = user.profile.xpSince ?? addDays(today, -800)
  const [sourceRows, [agg]] = await Promise.all([
    db.execute<{ source: string; days: string[] }>(sql`
      select source, array_agg(distinct local_date::text) as days from xp_events
      where user_id = ${u} and kind <> 'achievement' group by source`),
    db.execute<{ plan_days: string[] | null; comebacks: number; best: number; commits: number; learning: number; xp: number }>(sql`
      select
        (select array_agg(local_date::text) from (select local_date from xp_events
          where user_id = ${u} and kind = 'consistency' group by local_date having sum(amount) >= 99) p) as plan_days,
        -- Came back after 3+ days with no XP: gaps between consecutive days that earned XP.
        (select count(*)::int from (select local_date - lag(local_date) over (order by local_date) as gap from (
          select distinct local_date from xp_events where user_id = ${u} and kind <> 'achievement') x) g where gap > 3) as comebacks,
        -- Longest run of consecutive active days (gaps and islands).
        (select coalesce(max(n), 0)::int from (select count(*) as n from (
          select d, d - (row_number() over (order by d))::int as grp from (
            select c.local_date as d from checks c join schedules s on s.id = c.schedule_id
              where s.user_id = ${u} and c.status = 'done' and c.local_date >= ${from}
            union
            select local_date from entries where user_id = ${u} and local_date >= ${from}
              and (source = 'manual' or (source = 'github' and value > 0))
            union
            select local_date from streak_freezes where user_id = ${u} and local_date >= ${from}) a) b group by grp) r) as best,
        (select coalesce(sum(e.value), 0)::float from entries e join trackers t on t.id = e.tracker_id
          where e.user_id = ${u} and t.slug = 'github.commits' and e.local_date >= ${user.profile.xpSince ?? '1970-01-01'}) as commits,
        (select coalesce(sum(e.value), 0)::float from entries e join trackers t on t.id = e.tracker_id
          where e.user_id = ${u} and t.slug = 'learning.minutes' and e.local_date >= ${user.profile.xpSince ?? '1970-01-01'}) as learning,
        (select coalesce(sum(amount), 0)::int from xp_events where user_id = ${u}) as xp`),
  ])
  const sources = new Map<string, Set<string>>(sourceRows.map((r) => [r.source, new Set(r.days)]))
  return {
    sources,
    fullPlanDays: new Set(agg.plan_days ?? []),
    streakBest: agg.best,
    commitsTotal: Number(agg.commits),
    learningMinutesTotal: Number(agg.learning),
    balanceWeeks: sources.get('balance')?.size ?? 0,
    level: levelFor(agg.xp).level,
    comebacks: agg.comebacks,
  }
}

/** Unlock anything newly earned. Returns what was unlocked now, for the unlock animation. */
export async function checkAchievements(user: User, now = new Date()) {
  const have = new Set((await db.select({ key: schema.achievements.key }).from(schema.achievements).where(eq(schema.achievements.userId, user.id))).map((r) => r.key))
  if (ACHIEVEMENTS.every((a) => have.has(a.key))) return []
  const stats = await achievementStats(user, now)
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

/** Level, progress to the next and title: one `sum`, for the shell (the full `xpSummary` does far more). */
export async function xpLevel(user: User) {
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${schema.xpEvents.amount}), 0)::int` }).from(schema.xpEvents)
    .where(eq(schema.xpEvents.userId, user.id))
  const lv = levelFor(row.n)
  return { level: lv.level, progress: lv.progress, title: titleFor(lv.level) }
}
