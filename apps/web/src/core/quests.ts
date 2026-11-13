import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { CATEGORIES } from '@/db/schema'
import {
  FREEZE_CAP, FREEZE_OVERFLOW_XP, freezesToUse, pickQuests, questProgress, rollChest, weekStart,
  type QuestMeasure, type QuestTemplate, type Rarity,
} from '@/domain/quests'
import { levelFor, type Area } from '@/domain/xp'
import { activeDays } from './metrics'
import { lockUser, type Tx } from './recovery'
import { addDays, localDate } from './time'
import type { User } from './user'

// Quests read progress from XP that was already scored, so they can't drift from it. Chests are earned
// once per ref and paid out in XP when opened. See domain/quests.ts for the rules.

const SOURCES = new Set<string>(['sleep7', 'steps8k', 'mood', 'commit', 'learn', 'frugal', 'catchup', 'meditate'])
// Daily quests come from the System (src/core/system.ts), set from your own data; generic picks are weekly only.
const PER_PERIOD = { day: 0, week: 1 } as const

export type QuestView = QuestTemplate & { progress: number; done: boolean; ref: string; rarity: Rarity; start: string }

/** Local date → measures met that day, from XP events and show-up days. Nothing before a fresh start. */
async function questDays(user: User, from: string, to: string) {
  if (user.profile.xpSince && from < user.profile.xpSince) from = user.profile.xpSince
  const [events, active] = await Promise.all([
    db.select({ d: schema.xpEvents.localDate, source: schema.xpEvents.source, kind: schema.xpEvents.kind, amount: schema.xpEvents.amount })
      .from(schema.xpEvents)
      .where(and(eq(schema.xpEvents.userId, user.id), gte(schema.xpEvents.localDate, from), lte(schema.xpEvents.localDate, to))),
    activeDays(user, from),
  ])
  const days = new Map<string, Set<QuestMeasure>>()
  const at = (d: string) => days.get(d) ?? days.set(d, new Set()).get(d)!
  const plan = new Map<string, number>()
  for (const e of events) {
    if (SOURCES.has(e.source)) at(e.d).add(e.source as QuestMeasure)
    if (e.kind === 'consistency') plan.set(e.d, (plan.get(e.d) ?? 0) + e.amount)
  }
  for (const [d, xp] of plan) if (xp >= 99) at(d).add('fullplan')
  for (const d of active) if (d >= from && d <= to) at(d).add('active')
  return days
}

/** The quests for one period, with progress. Eligibility looks at the 4 weeks before it, so picks stay put all day. */
function questsFor(user: User, period: 'day' | 'week', start: string, days: Map<string, Set<QuestMeasure>>, hasRoutines: boolean): QuestView[] {
  const available = new Set<QuestMeasure>(['mood', 'active'])
  if (hasRoutines) available.add('fullplan')
  for (let d = addDays(start, -28); d < start; d = addDays(d, 1)) for (const m of days.get(d) ?? []) available.add(m)
  const end = period === 'day' ? start : addDays(start, 6)
  const areas = (user.profile.areas?.length ? user.profile.areas : [...CATEGORIES]) as Area[]
  return pickQuests({ period, seed: `${user.id}:${period}:${start}`, available, areas, focus: user.profile.focus, count: PER_PERIOD[period] })
    .map((q) => {
      const progress = questProgress(q, start, end, days)
      return { ...q, start, progress, done: progress >= q.target, ref: `quest:${period}:${start}:${q.key}`, rarity: period === 'day' ? 'common' : 'rare' }
    })
}

async function hasRoutines(user: User) {
  const [r] = await db.select({ n: count() }).from(schema.schedules)
    .where(and(eq(schema.schedules.userId, user.id), inArray(schema.schedules.kind, ['routine', 'medicine'])))
  return r.n > 0
}

/** Today's and this week's quests, plus last periods' (for paying out late data). */
async function allQuests(user: User, now: Date) {
  const today = localDate(now, user.timezone)
  const week = weekStart(today)
  const [days, routines] = await Promise.all([questDays(user, addDays(week, -42), today), hasRoutines(user)])
  return {
    today: questsFor(user, 'day', today, days, routines),
    yesterday: questsFor(user, 'day', addDays(today, -1), days, routines),
    week: questsFor(user, 'week', week, days, routines),
    lastWeek: questsFor(user, 'week', addDays(week, -7), days, routines),
  }
}

/** Unopened chests first (oldest first), then held freezes and recent freeze use. For Today. */
export async function questBoard(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const [q, unopened, held, used] = await Promise.all([
    allQuests(user, now),
    db.select().from(schema.chests).where(and(eq(schema.chests.userId, user.id), isNull(schema.chests.openedAt))).orderBy(asc(schema.chests.earnedAt)),
    freezesHeld(user),
    db.select({ d: schema.streakFreezes.localDate }).from(schema.streakFreezes)
      .where(and(eq(schema.streakFreezes.userId, user.id), gte(schema.streakFreezes.localDate, addDays(today, -7))))
      .orderBy(desc(schema.streakFreezes.localDate)),
  ])
  return { daily: q.today, weekly: q.week, chests: unopened, freezes: held, frozeOn: used.map((r) => r.d) }
}

type Exec = Tx | typeof db

/** Freezes earned from opened chests, minus those used. */
export async function freezesHeld(user: User, x: Exec = db) {
  const [[got], [spent]] = await Promise.all([
    x.select({ n: count() }).from(schema.chests).where(and(eq(schema.chests.userId, user.id), eq(schema.chests.freeze, true), isNotNull(schema.chests.openedAt))),
    x.select({ n: count() }).from(schema.streakFreezes).where(eq(schema.streakFreezes.userId, user.id)),
  ])
  return Math.max(0, got.n - spent.n)
}

/** Earn a chest for every finished quest in the current and previous periods. Returns how many are new. */
export async function awardQuestChests(user: User, now = new Date()) {
  const q = await allQuests(user, now)
  const since = user.profile.xpSince
  let fresh = 0
  for (const v of [...q.today, ...q.yesterday, ...q.week, ...q.lastWeek]) {
    if (!v.done || (since && v.start < since && v.period === 'day')) continue
    const roll = rollChest(v.rarity, v.ref)
    const [row] = await db.insert(schema.chests).values({
      userId: user.id, rarity: v.rarity, ref: v.ref, xp: roll.xp, freeze: roll.freeze,
      reason: `${v.period === 'day' ? 'Daily' : 'Weekly'} quest: ${v.title}`,
    }).onConflictDoNothing().returning({ id: schema.chests.id })
    if (row) fresh++
  }
  return fresh
}

/** An epic chest for each level reached. */
export async function levelChests(user: User, before: number, after: number, x: Exec = db) {
  for (let lv = before + 1; lv <= after; lv++) {
    const ref = `level:${lv}`
    const roll = rollChest('epic', ref)
    await x.insert(schema.chests).values({ userId: user.id, rarity: 'epic', ref, xp: roll.xp, freeze: roll.freeze, reason: `Reached level ${lv}` })
      .onConflictDoNothing()
  }
}

/** Spend freezes on missed days before today when they save the streak. Returns the days covered. */
export async function useFreezes(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const [held, covered] = await Promise.all([freezesHeld(user), activeDays(user, addDays(today, -FREEZE_CAP - 2))])
  const days = freezesToUse({ covered, today, held, since: user.profile.xpSince })
  if (days.length) await db.insert(schema.streakFreezes).values(days.map((d) => ({ userId: user.id, localDate: d }))).onConflictDoNothing()
  return days
}

export type ChestOpened = { rarity: Rarity; xp: number; freeze: boolean; converted: boolean; reason: string }

/** Open a chest once: pay its XP, keep its freeze (or turn it into XP at the cap). Returns the contents. */
export async function openChest(user: User, id: string, now = new Date()): Promise<{ opened: ChestOpened; level: { before: number; after: number } } | null> {
  // Under the user's lock, so two chests opened together each see the other's freeze and FREEZE_CAP holds.
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    const total = async () => {
      const [r] = await tx.select({ n: sql<number>`coalesce(sum(${schema.xpEvents.amount}), 0)::int` }).from(schema.xpEvents).where(eq(schema.xpEvents.userId, user.id))
      return r.n
    }
    const before = levelFor(await total()).level
    const held = await freezesHeld(user, tx)
    const [row] = await tx.update(schema.chests).set({ openedAt: now })
      .where(and(eq(schema.chests.id, id), eq(schema.chests.userId, user.id), isNull(schema.chests.openedAt))).returning()
    if (!row) return null
    let { xp, freeze } = row
    const converted = freeze && held >= FREEZE_CAP
    if (converted) {
      xp += FREEZE_OVERFLOW_XP; freeze = false
      await tx.update(schema.chests).set({ xp, freeze }).where(eq(schema.chests.id, row.id))
    }
    await tx.insert(schema.xpEvents).values({
      userId: user.id, localDate: localDate(now, user.timezone), area: 'general', kind: 'bonus', source: 'chest', amount: xp, verified: true,
      reason: `${row.rarity[0].toUpperCase()}${row.rarity.slice(1)} chest`, ref: `chest:${row.ref}`,
    }).onConflictDoNothing()
    const after = levelFor(await total()).level
    await levelChests(user, before, after, tx)
    return { opened: { rarity: row.rarity, xp, freeze, converted, reason: row.reason }, level: { before, after } }
  })
}
