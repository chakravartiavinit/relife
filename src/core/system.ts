import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { Output } from 'ai'
import { z } from 'zod'
import { db, schema } from '@/db'
import { CATEGORIES } from '@/db/schema'
import { describeChange, describeLink, findChanges, findLinks, formatValue, tone, type Signal } from '@/domain/patterns'
import {
  balanceHabits, difficulty, fairTarget, fallbackQuests, hitRate, judge, penaltyFor, rankFor, round, stretch, windowValue, xpFor,
  type Op, type QuestSpec, type Rank, type Stat, type SystemKind,
} from '@/domain/system'
import { rollChest } from '@/domain/quests'
import { levelFor, titleFor } from '@/domain/xp'
import { formatMoney } from '@/domain/money'
import { esc } from './notify'
import { blocks, questBlock, sysHead } from '@/bot/system-ui'
import { notify } from './outbox'
import { loadSignals } from './patterns'
import { basketLines } from './basket'
import { habitSignals } from '@/domain/basket'
import { screenTimeDigest } from './activity'
import { addDays, formatDay, localDate } from './time'
import type { User } from './user'
import { totalXp } from './xp'

// The System: every day it reads your connector data, decides what you should train (the AI picks
// and words it; src/domain/system.ts keeps it fair), checks quests off from the data itself, turns
// missed daily quests into penalty quests and calls emergency quests when a number slips sharply.

export type SystemQuest = typeof schema.systemQuests.$inferSelect
const Q = schema.systemQuests

/** Baselines for every signal: usual (the 4 weeks before last week) and recent (the last 7 full days). */
function statsFrom(signals: Signal[], today: string): Stat[] {
  return signals.map((s) => {
    const avg = (from: string, to: string) => {
      const v: number[] = []
      for (let d = from; d <= to; d = addDays(d, 1)) { const x = s.days.get(d); if (x != null) v.push(x) }
      return { mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, n: v.length }
    }
    const usual = avg(addDays(today, -35), addDays(today, -8))
    const recent = avg(addDays(today, -7), addDays(today, -1))
    const history: number[] = []
    for (let d = addDays(today, -28); d < today; d = addDays(d, 1)) { const x = s.days.get(d); if (x != null) history.push(x) }
    return {
      id: s.id, name: s.name, area: s.area, unit: s.unit, direction: s.direction, agg: s.agg ?? 'sum',
      usual: usual.mean ?? recent.mean, recent: recent.mean, daysLogged: usual.n + recent.n, history,
    }
  })
}

/** Exact amounts in titles (₹2,276, not ₹2.3K): the quest is judged on the exact number. */
const fmt = (v: number, unit?: string | null) => (unit && /^[A-Z]{3}$/.test(unit) ? formatMoney(v, unit) : formatValue(v, unit))

/** "Steps: 7,500 or more" — used when the AI's own title no longer matches a clamped target. */
const plainTitle = (s: Stat, op: Op, target: number, days: number) =>
  `${s.name}: ${fmt(target, s.unit)} or ${op === 'gte' ? 'more' : 'less'}${days > 1 ? ` over ${days} days` : ''}`

type Draft = { spec: QuestSpec; title: string; reason?: string }

/** Turn drafts into rows: fair targets, ranks and XP from the rules, one quest per stat. */
function toRows(user: User, kind: SystemKind, drafts: Draft[], stats: Stat[], d: number, from: string, refOf: (s: Stat) => string) {
  const seen = new Set<string>()
  const rows: (typeof Q.$inferInsert)[] = []
  for (const dr of drafts) {
    const s = stats.find((x) => x.id === dr.spec.statId)
    if (!s || seen.has(s.id)) continue
    // A quest must push the right way: more of what's good, less of what isn't.
    const op: Op = s.direction === 'down' ? 'lte' : s.direction === 'up' ? 'gte' : dr.spec.op
    const days = Math.min(3, Math.max(1, Math.round(dr.spec.days || 1)))
    const target = fairTarget(s, { ...dr.spec, op, days }, d)
    if (target == null) continue
    seen.add(s.id)
    const spec = { statId: s.id, op, target, days }
    // Skip quests you'd clear without trying (no late-night orders when you hardly ever order late).
    const rate = hitRate(s, spec)
    if (rate != null && rate >= 0.9) continue
    const rank: Rank = rankFor(s, spec)
    const asked = Math.abs(dr.spec.target - target) < Math.max(0.5, Math.abs(target) * 0.02) && op === dr.spec.op
    rows.push({
      userId: user.id, kind, fromDate: from, toDate: addDays(from, days - 1), statId: s.id, statName: s.name, area: s.area, unit: s.unit ?? null,
      op, agg: s.agg, target, baseline: s.usual == null ? null : round(s.agg === 'sum' ? s.usual * days : s.usual, s),
      rank, xp: xpFor(rank, kind), title: (asked && dr.title.trim() ? dr.title.trim() : plainTitle(s, op, target, days)).slice(0, 90),
      reason: dr.reason?.trim().slice(0, 240) || null, ref: refOf(s),
    })
  }
  return rows
}

const PERSONA = [
  'You are the System from Solo Leveling. You assign quests to the Player to make them stronger in real life.',
  'Speak like the System: short, formal, a little ominous, second person. No emoji.',
  'Every quest must be measured by one of the provided stats, so data can check it off. Never invent stats.',
  'Use op "gte" for stats where more is better and "lte" where less is better.',
  'Set targets close to the requested stretch over the stat\'s usual value: hard but reachable today.',
  'Titles are imperative and include the number, e.g. "Walk 7,500 steps" or "Keep delivery spending under ₹400". Reasons cite the data in one sentence.',
].join(' ')

function statsTable(stats: Stat[]) {
  return stats.map((s) => ({
    id: s.id, name: s.name, area: s.area, unit: s.unit ?? undefined, better: s.direction === 'up' ? 'more' : s.direction === 'down' ? 'less' : 'either',
    usualPerDay: s.usual == null ? null : round(s.usual, s), last7PerDay: s.recent == null ? null : round(s.recent, s), daysLogged: s.daysLogged,
  }))
}

/** Ask the AI for today's daily quests. Returns null when no model is connected or it fails. */
async function aiDailies(user: User, stats: Stat[], signals: Signal[], d: number, history: SystemQuest[], today: string) {
  const { aiEnabled, model } = await import('@/ai/models')
  if (!aiEnabled('plan')) return null
  const { generate } = await import('@/ai/run')
  const ids = stats.map((s) => s.id) as [string, ...string[]]
  const schemaOut = z.object({
    announcement: z.string().describe('one or two sentences announcing today\'s quests, in the System\'s voice'),
    quests: z.array(z.object({
      statId: z.enum(ids), op: z.enum(['gte', 'lte']), target: z.number(),
      title: z.string(), reason: z.string(),
    })).min(1).max(4),
  })
  const links = findLinks(signals).slice(0, 5).map(describeLink)
  const changes = findChanges(signals, findLinks(signals), today).slice(0, 5).map(describeChange)
  try {
    const xp = await totalXp(user)
    const res = await generate('plan', 'system.daily-quests', {
      model: model('plan'),
      output: Output.object({ schema: schemaOut }),
      system: PERSONA,
      prompt: JSON.stringify({
        player: { name: user.name.split(' ')[0], level: levelFor(xp).level, title: titleFor(levelFor(xp).level) },
        wantsToImprove: { stats: user.profile.improve ?? [], inTheirWords: user.profile.goals || undefined },
        difficulty: { level: d, of: 5, stretchOverUsual: `${Math.round(stretch(d) * 100)}%` },
        task: 'Assign 3 daily quests for today (2 if data is thin, 4 at most). Train what they want to improve first, then what is slipping. Spread across areas when you can. Don\'t repeat yesterday\'s quests unless they failed. Stats whose id starts with "habit:" are spending habits from their orders (impulse items like a soft drink, snacks, eating out): set at most one habit quest, and only on a habit whose last 7 days are above its usual. Word it as breaking the habit, e.g. "No Diet Coke today" when the target is 0.',
        stats: statsTable(stats),
        patterns: { movesTogether: links, thisWeek: changes },
        recentQuests: history.slice(0, 12).map((q) => ({ date: q.fromDate, title: q.title, status: q.status })),
        // Where laptop time went this week, so quests can trade entertainment time for learning.
        screenTime: await screenTimeDigest(user),
      }),
    })
    return res.output ?? null
  } catch {
    return null
  }
}

async function recentHistory(user: User, today: string) {
  return db.select().from(Q).where(and(eq(Q.userId, user.id), gte(Q.fromDate, addDays(today, -14)))).orderBy(desc(Q.fromDate))
}

/** Buttons on every System message: the quest log and today's checklist. */
const OPEN = [[{ text: '📜 Quest log', data: 'q:o' }, { text: '📋 Today', data: 't:o' }]]

/** Today's daily quests, created once per day. */
async function ensureDailies(user: User, today: string, signals: Signal[], stats: Stat[]) {
  const existing = await db.select({ id: Q.id }).from(Q).where(and(eq(Q.userId, user.id), eq(Q.kind, 'daily'), eq(Q.fromDate, today))).limit(1)
  if (existing.length) return
  const history = await recentHistory(user, today)
  const d = difficulty(history.filter((q) => q.kind === 'daily' && q.status !== 'active').map((q) => q.status as 'cleared' | 'failed'))
  const ai = await aiDailies(user, stats, signals, d, history, today)
  let drafts: Draft[] = (ai?.quests ?? []).map((q) => ({ spec: { statId: q.statId, op: q.op, target: q.target, days: 1 }, title: q.title, reason: q.reason }))
  // At most one spending-habit quest a day, and not the habit you cleared yesterday.
  let rows = balanceHabits(toRows(user, 'daily', drafts, stats, d, today, (s) => `daily:${today}:${s.id}`), history, today)
  if (!rows.length) {
    drafts = fallbackQuests(stats, user.profile.improve ?? [], d).map((q) => ({ spec: q, title: '', reason: `Your usual is ${fmt(stats.find((s) => s.id === q.statId)!.usual!, stats.find((s) => s.id === q.statId)!.unit)} a day.` }))
    rows = balanceHabits(toRows(user, 'daily', drafts, stats, d, today, (s) => `daily:${today}:${s.id}`), history, today)
  }
  if (!rows.length) return
  const made = await db.insert(Q).values(rows).onConflictDoNothing().returning()
  if (!made.length) return
  await notify(user, 'system', {
    text: [
      sysHead('⚔️', 'Daily quest has arrived', ai?.announcement ?? 'Complete every quest before midnight to grow stronger.'),
      '', blocks(made), '',
      '⏳ <i>Ends at midnight. Unfinished quests become penalty quests.</i>',
    ].join('\n'),
    buttons: OPEN,
  })
}

/**
 * Yesterday's missed daily quests become penalty quests today. A quest that failed early (spending over
 * the limit by noon) waits for its day to end; older misses are left alone; penalties don't chain.
 */
async function penalties(user: User, today: string, stats: Stat[]) {
  const failed = await db.select().from(Q).where(and(eq(Q.userId, user.id), eq(Q.kind, 'daily'), eq(Q.status, 'failed'), eq(Q.toDate, addDays(today, -1))))
  if (!failed.length) return
  const history = await recentHistory(user, today)
  const d = difficulty(history.filter((q) => q.kind === 'daily' && q.status !== 'active').map((q) => q.status as 'cleared' | 'failed'))
  const issued: SystemQuest[] = []
  for (const q of failed) {
    const s = stats.find((x) => x.id === q.statId)
    const p = penaltyFor(q, d, s)
    const target = s ? p.target : Math.round(p.target)
    const rank: Rank = s ? rankFor(s, { statId: q.statId, op: p.op, target, days: 1 }) : 'C'
    const [row] = await db.insert(Q).values({
      userId: user.id, kind: 'penalty', fromDate: today, toDate: today, statId: q.statId, statName: q.statName, area: q.area, unit: q.unit,
      op: p.op, agg: q.agg, target, baseline: q.baseline, rank, xp: xpFor(rank, 'penalty'),
      // The section already says "Penalty quest", so the title reads like a daily one: "Push 4 pull requests".
      title: s ? plainTitle(s, p.op, target, 1) : `${q.statName}: ${fmt(target, q.unit)} or ${p.op === 'gte' ? 'more' : 'less'}`,
      reason: `You failed “${q.title}” yesterday.`, parentId: q.id, ref: `penalty:${q.id}`,
    }).onConflictDoNothing().returning()
    if (row) issued.push(row)
  }
  if (!issued.length) return
  // One message for all of them: what was missed, then what it costs.
  await notify(user, 'system', {
    text: [
      sysHead('☠️', issued.length === 1 ? 'Penalty quest' : `${issued.length} penalty quests`, `You failed ${failed.length === 1 ? 'a daily quest' : `${failed.length} daily quests`} yesterday.`),
      '', failed.map((q) => `❌ <s>${esc(q.title)}</s>`).join('\n'),
      '', blocks(issued), '',
      '⏳ <i>Clear them today to restore your record.</i>',
    ].join('\n'),
    buttons: OPEN,
  })
}

/** When something slips sharply (spending up 2×, sleep collapsing), the System calls an emergency quest. */
async function emergencies(user: User, today: string, signals: Signal[], stats: Stat[]) {
  const recent = await db.select().from(Q).where(and(eq(Q.userId, user.id), eq(Q.kind, 'emergency'), gte(Q.fromDate, addDays(today, -7))))
  if (recent.some((q) => q.status === 'active')) return
  const links = findLinks(signals)
  const bad = findChanges(signals, links, today).find((c) => tone(c.signal, c.pct) === 'bad' && Math.abs(c.pct) >= 0.3 && !recent.some((q) => q.statId === c.signal.id))
  if (!bad) return
  const s = stats.find((x) => x.id === bad.signal.id)
  if (!s || s.direction === 'none') return
  const d = 4
  let draft: Draft = {
    spec: { statId: s.id, op: s.direction === 'up' ? 'gte' : 'lte', target: s.usual! * (s.agg === 'sum' ? 2 : 1) * (s.direction === 'up' ? 1 + stretch(d) : 1 - stretch(d)), days: 2 },
    title: '', reason: describeChange(bad),
  }
  let announcement = `${s.name} has fallen out of balance. Restore it.`
  const { aiEnabled, model } = await import('@/ai/models')
  if (aiEnabled('plan')) {
    try {
      const { generate } = await import('@/ai/run')
      const res = await generate('plan', 'system.emergency-quest', {
        model: model('plan'),
        output: Output.object({ schema: z.object({ announcement: z.string(), title: z.string(), target: z.number(), days: z.number().int().min(1).max(3), reason: z.string() }) }),
        system: `${PERSONA} This is an emergency quest: a sharp, short correction lasting 1 to 3 days.`,
        prompt: JSON.stringify({ stat: statsTable([s])[0], whatHappened: describeChange(bad), op: draft.spec.op, totalOverWindow: s.agg === 'sum', task: 'Write one emergency quest on this stat. target is the total over the whole window for totals, else the daily average.' }),
      })
      if (res.output) {
        draft = { spec: { ...draft.spec, target: res.output.target, days: res.output.days }, title: res.output.title, reason: res.output.reason }
        announcement = res.output.announcement
      }
    } catch { /* keep the rule-based quest */ }
  }
  const rows = toRows(user, 'emergency', [draft], stats, d, today, (x) => `emergency:${x.id}:${today}`)
  if (!rows.length) return
  const [row] = await db.insert(Q).values(rows).onConflictDoNothing().returning()
  if (!row) return
  await notify(user, 'system', {
    text: [
      sysHead('🚨', 'Emergency quest', announcement),
      '', questBlock(row),
      row.reason ? `<blockquote expandable>${esc(row.reason)}</blockquote>` : '',
      `⏳ <i>Time limit: ${row.toDate === row.fromDate ? 'midnight tonight' : `end of ${formatDay(row.toDate, { weekday: 'long', day: 'numeric', month: 'short' })}`}.</i>`,
    ].filter(Boolean).join('\n'),
    buttons: OPEN,
  })
}

/** Check every open quest against the data: pay cleared ones, fail expired ones. */
async function judgeAll(user: User, today: string, signals: Signal[]) {
  const open = await db.select().from(Q).where(and(eq(Q.userId, user.id), eq(Q.status, 'active')))
  const cleared: SystemQuest[] = []
  for (const q of open) {
    const sig = signals.find((s) => s.id === q.statId)
    const value = sig ? windowValue(sig.days, q.fromDate, q.toDate, q.agg) : null
    const status = judge({ ...q, to: q.toDate }, value, today)
    await db.update(Q).set({ progress: value, status, resolvedAt: status === 'active' ? null : new Date() }).where(and(eq(Q.id, q.id), eq(Q.status, 'active')))
    if (status === 'cleared') cleared.push({ ...q, status, progress: value })
  }
  if (cleared.length) {
    const before = levelFor(await totalXp(user)).level
    for (const q of cleared) {
      await db.insert(schema.xpEvents).values({
        userId: user.id, localDate: today, area: ((CATEGORIES as readonly string[]).includes(q.area) ? q.area : 'general') as 'general',
        kind: 'bonus', source: 'system', amount: q.xp, verified: true, reason: `Quest cleared: ${q.title}`, ref: `sq:${q.id}`,
      }).onConflictDoNothing()
    }
    const total = cleared.reduce((a, q) => a + q.xp, 0)
    await notify(user, 'system', {
      text: [sysHead('✅', cleared.length === 1 ? 'Quest cleared' : `${cleared.length} quests cleared`, 'Rewards have been granted.'), '', blocks(cleared), '', `<b>Rewards</b> +${total} XP`].join('\n'),
    })
    await allClearBox(user, today)
    const after = levelFor(await totalXp(user)).level
    if (after > before) {
      const { celebrate } = await import('@/bot/ui')
      const { levelChests } = await import('./quests')
      await levelChests(user, before, after)
      await celebrate(user, { levelUp: { level: after, title: titleFor(after), from: before, newTitle: titleFor(after) !== titleFor(before) }, unlocked: [] })
    }
  }
}

/** Clearing every daily quest of a day earns a reward box (a chest). */
async function allClearBox(user: User, today: string) {
  const day = await db.select({ status: Q.status }).from(Q).where(and(eq(Q.userId, user.id), eq(Q.kind, 'daily'), eq(Q.fromDate, today)))
  if (!day.length || day.some((q) => q.status !== 'cleared')) return
  const ref = `system-all:${today}`
  const roll = rollChest('rare', ref)
  const [chest] = await db.insert(schema.chests).values({ userId: user.id, rarity: 'rare', ref, xp: roll.xp, freeze: roll.freeze, reason: 'All daily quests cleared' })
    .onConflictDoNothing().returning()
  if (chest) {
    await notify(user, 'system', {
      text: sysHead('🎁', 'All daily quests cleared', 'A reward box has been granted. Open it to see what’s inside.'),
      buttons: [[{ text: '🎁 Open reward box', data: `c:o:${chest.id}` }]],
    })
  }
}

let running: Promise<void> | null = null
let lastEmergencyCheck = 0

/**
 * One pass of the System, safe to run often: judge open quests, hand out penalties for yesterday's
 * failures, make sure today's daily quests exist, and once an hour look for an emergency.
 */
export function systemTick(user: User, now = new Date()) {
  running ??= (async () => {
    try {
      const today = localDate(now, user.timezone)
      const { signals: base } = await loadSignals(user, now)
      // Spending habits from order items (Diet Coke, snacks, eating out). All of them judge quests already
      // set; only the few bought on many days are offered as new quests.
      const habits = habitSignals(await basketLines(user, addDays(today, -89), today), today, user.baseCurrency)
      const signals = [...base, ...habits.filter((h) => h.offer)]
      const stats = statsFrom(signals, today)
      await judgeAll(user, today, [...base, ...habits])
      await penalties(user, today, stats)
      // A stat already under a penalty quest today doesn't also get a daily quest.
      const penalized = await db.select({ id: Q.statId }).from(Q).where(and(eq(Q.userId, user.id), eq(Q.kind, 'penalty'), eq(Q.fromDate, today)))
      const taken = new Set(penalized.map((p) => p.id))
      await ensureDailies(user, today, signals, stats.filter((x) => !taken.has(x.id)))
      if (Date.now() - lastEmergencyCheck > 55 * 60_000) { lastEmergencyCheck = Date.now(); await emergencies(user, today, signals, stats) }
    } finally { running = null }
  })()
  return running
}

/** At 21:00: what's still open, with the penalty that follows. */
export async function systemWarning(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const open = await db.select().from(Q).where(and(eq(Q.userId, user.id), eq(Q.status, 'active'), inArray(Q.kind, ['daily', 'penalty']), eq(Q.toDate, today)))
  if (!open.length) return
  await notify(user, 'system', {
    text: [
      sysHead('⏳', '3 hours remain', open.length === 1 ? 'One quest is still open.' : `${open.length} quests are still open.`),
      '', blocks(open, { progress: true }), '',
      '☠️ <i>Unfinished daily quests become penalty quests at midnight.</i>',
    ].join('\n'),
    buttons: OPEN,
  })
}

/** Quests for the Today page and /today: active ones plus today's finished ones. */
export async function systemBoard(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const rows = await db.select().from(Q).where(and(eq(Q.userId, user.id), gte(Q.toDate, addDays(today, -1)))).orderBy(Q.createdAt)
  const shown = rows.filter((q) => q.status === 'active' || q.toDate >= today || (q.resolvedAt && localDate(q.resolvedAt, user.timezone) === today))
  const history = await recentHistory(user, today)
  const d = difficulty(history.filter((q) => q.kind === 'daily' && q.status !== 'active').map((q) => q.status as 'cleared' | 'failed'))
  // Only worth the extra query when there's nothing to show yet.
  const hasData = shown.length > 0 || (await loadSignals(user, now)).signals.some((s) => s.direction !== 'none')
  return { quests: shown, difficulty: d, today, hasData }
}

