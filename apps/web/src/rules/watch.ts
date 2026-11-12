import { and, desc, eq, gte, inArray, like, lte, sql } from 'drizzle-orm'
import { Output } from 'ai'
import { z } from 'zod'
import { db, schema } from '@/db'
import { CATEGORIES, type Category } from '@/db/schema'
import { convert } from '@/core/fx'
import { loadSignals } from '@/core/patterns'
import { basketLines } from '@/core/basket'
import { isSpend, transactionsBetween } from '@/core/metrics'
import { monthlyCost } from '@/core/schedules'
import { monthRange, oneOffs, shiftMonth, usualMonth } from '@/domain/wealth'
import { localDate, addDays } from '@/core/time'
import type { Alert, Rule } from '@/core/types'
import type { User } from '@/core/user'
import { habitSignals } from '@/domain/basket'
import { formatMoney, USD_STABLES } from '@/domain/money'
import { describeLink, findLinks, formatValue } from '@/domain/patterns'
import { badness, dataLines, iconFor, monthPaceRow, plain, portfolioRows, signalRows, subscriptionsRow, type Holding, type Position, type Row } from '@/domain/watch'

/**
 * Live nudges, hourly in the daytime and whenever new data arrives. Code builds a change table of everything ReLife knows (each tracked
 * number, spending, habits, crypto, futures: today vs yesterday vs a usual week; src/domain/watch.ts). The
 * AI reads it with what the person wants to improve and decides what deserves a message, how urgent, and
 * how to say it, quoting only numbers from the table. The code guarantees the rest:
 *   - a topic is nudged at most once a day (topics already sent today never reach the AI),
 *   - at most two nudges a run, within the Analysis/Alerts limits and quiet hours,
 *   - no AI call when nothing new could be sent,
 *   - a futures position within 5% of its liquidation price (or a margin ratio of 80%+) is never left out.
 */
export const watch: Rule = {
  id: 'watch',
  every: '20 8-22 * * *',
  on: ['data.changed'], // and the moment new data lands (a sync, an order, a subscription added)
  check: async ({ user, now }) => {
    const rows = fresh(await changeTable(user, now), await recentlySent(user, now))
    return (await decide(user, rows.rows, now, rows.budget)).map((p) => toAlert(user, p))
  },
}

const AREA: Record<string, string> = { health: 'Health', mind: 'Mind', skills: 'Skills', wealth: 'Wealth', hobbies: 'Hobbies', relationships: 'People' }

/** Money in the person's currency in whole units; prices in dollars with cents; other numbers as said. */
export const numberFormat = (base: string) => (v: number, unit?: string | null) =>
  unit && /^[A-Z]{3}$/.test(unit) ? formatMoney(v, unit, unit === base ? { decimals: 0 } : {}) : formatValue(v, unit)

/** A picked nudge as the alert runRule sends: topic emoji, what happened, one action, "Area · Today", the numbers (kept for the app). */
export function toAlert(user: User, { row, urgent, about, title, what, action }: Pick, meta?: string): Alert {
  return {
    // runRule dedupes: a day's spike once that day ("watch:<topic>:<day>"), a weekly trend once a week.
    key: about === 'week' ? `watch:${row.topic}:week` : `watch:${row.topic}`, weekly: about === 'week',
    channel: urgent ? 'alerts' : 'analysis',
    emoji: iconFor(row, urgent),
    title, body: what, action,
    meta: meta ?? [AREA[row.area] ?? 'Your data', urgent ? 'Act now' : about === 'week' ? 'This week' : 'Today', badness(row) > 0 || urgent ? null : 'Good news'].filter(Boolean).join(' · '),
    data: dataLines(row, numberFormat(user.baseCurrency)),
    category: CATEGORIES.includes(row.area as Category) ? (row.area as Category) : undefined,
  }
}

/** Watch nudges a day, besides money at risk. */
export const DAILY_BUDGET = 2

export type Sent = { topicsToday: Set<string>; groupsToday: Set<string>; weekly: Set<string>; countToday: number }

/** Rows still worth considering: not sent today (nor anything in its group), not a weekly trend sent this week. */
export function fresh(rows: Row[], sent: Sent) {
  return {
    rows: rows.filter((r) => !sent.topicsToday.has(r.topic) && !sent.groupsToday.has(r.group) && !sent.weekly.has(r.topic)),
    budget: Math.max(0, DAILY_BUDGET - sent.countToday),
  }
}

const atRisk = (r: Row) => (r.toLiquidation != null && r.toLiquidation <= 0.05) || (r.topic === 'futures:margin' && (r.today ?? 0) >= 80)

/** What to send from a change table: the AI's choice (or the plain fallback) within the day's budget, plus money at real risk. */
export async function decide(user: User, rows: Row[], now: Date, budget = DAILY_BUDGET): Promise<Pick[]> {
  if (!rows.length) return []
  const picks = budget > 0 ? ((await aiPick(user, rows, now)) ?? fallback(rows)) : []
  // One per group, within budget.
  const seen = new Set<string>()
  const kept = picks.filter((p) => !seen.has(p.row.group) && seen.add(p.row.group)).slice(0, Math.min(2, budget))
  // Money at risk goes out even if the AI let it pass: within 5% of liquidation, or margin ratio 80%+.
  for (const r of rows) {
    if (atRisk(r) && !kept.some((p) => p.row.group === r.group)) kept.unshift({ row: r, urgent: true, about: 'today', title: `${r.what.split(',')[0]} close to liquidation`, what: plain(r), action: 'Add margin, cut the size or set a stop.' })
  }
  return kept
}

/** What watch sent recently, from the insights runRule saves (dedupe keys "watch:<topic>:<day>" or "watch:<topic>:week"). */
async function recentlySent(user: User, now: Date): Promise<Sent> {
  const today = localDate(now, user.timezone)
  const rows = await db.select({ key: sql<string>`${schema.insights.payload}->>'dedupeKey'`, at: schema.insights.createdAt }).from(schema.insights)
    .where(and(eq(schema.insights.userId, user.id), gte(schema.insights.createdAt, new Date(now.getTime() - 7 * 86_400_000)), like(sql`${schema.insights.payload}->>'dedupeKey'`, 'watch:%')))
  const table = await changeTableGroups(user, now)
  const sent: Sent = { topicsToday: new Set(), groupsToday: new Set(), weekly: new Set(), countToday: 0 }
  for (const r of rows) {
    const topic = r.key.slice('watch:'.length).replace(/:(\d{4}-\d{2}-\d{2}|week)$/, '')
    if (r.key.endsWith(':week')) sent.weekly.add(topic)
    if (localDate(r.at, user.timezone) === today) {
      sent.topicsToday.add(topic)
      sent.countToday++
      const g = table.get(topic)
      if (g) sent.groupsToday.add(g)
    }
  }
  return sent
}

/** Topic → group, so a nudge on "Spending" also covers "Delivery app spending" for the day. */
async function changeTableGroups(user: User, now: Date) {
  const { signals } = await loadSignals(user, now)
  const m = new Map(signals.map((s) => [s.id, s.group]))
  m.set('portfolio', 'crypto')
  m.set('spend:month', 'spend:month')
  m.set('subscriptions', 'subscriptions')
  return { get: (t: string) => m.get(t) ?? (t.startsWith('coin:') ? 'crypto' : t.startsWith('futures:') ? 'futures' : t.startsWith('habit:') ? 'habit' : undefined) }
}

/** The month's spending pace and the subscription total: slower-moving money numbers the daily signals miss. */
async function moneyRows(user: User, now: Date): Promise<Row[]> {
  const today = localDate(now, user.timezone)
  const month = today.slice(0, 7)
  const [txns, subs] = await Promise.all([
    transactionsBetween(user, `${shiftMonth(month, -6)}-01`, today),
    db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true), inArray(schema.schedules.kind, ['subscription', 'bill', 'renewal']))),
  ])
  const byMonth = new Map<string, number>()
  for (const t of txns) if (isSpend(t)) byMonth.set(t.localDate.slice(0, 7), (byMonth.get(t.localDate.slice(0, 7)) ?? 0) - t.base)
  const usual = usualMonth(byMonth, month)
  const day = Number(today.slice(8))
  const daysInMonth = Number(monthRange(month)[1].slice(8))
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000)
  const monthly = async (list: typeof subs) => (await Promise.all(list.map((s) => convert(monthlyCost(s), s.currency ?? user.baseCurrency, user.baseCurrency, today)))).reduce<number>((a, v) => a + (v ?? 0), 0)
  const older = subs.filter((s) => s.createdAt <= weekAgo)
  const added = subs.filter((s) => s.createdAt > weekAgo).map((s) => s.name)
  return [
    monthPaceRow(byMonth.get(month) ?? 0, day, daysInMonth, usual, user.baseCurrency, oneOffs(txns.filter((t) => isSpend(t) && t.localDate.startsWith(month)).map((t) => -t.base), usual)),
    subscriptionsRow(await monthly(subs), await monthly(older), added, user.baseCurrency),
  ].filter((r): r is Row => !!r)
}

/** Everything that moved past the noise floor, worst first, at most 30 rows. */
export async function changeTable(user: User, now = new Date()): Promise<Row[]> {
  const today = localDate(now, user.timezone)
  const usdToBase = (await convert(1, 'USD', user.baseCurrency, today)) ?? 0
  const { signals } = await loadSignals(user, now)
  const habits = habitSignals(await basketLines(user, addDays(today, -89), today), today, user.baseCurrency).filter((h) => h.offer)

  // Crypto: the latest hourly balance snapshot against the ones a day and a week before.
  const snap = async (before?: Date) => {
    const [r] = await db.select({ body: schema.rawEvents.body }).from(schema.rawEvents)
      .where(and(eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.source, 'binance'), sql`${schema.rawEvents.body}->>'type' = 'balances'`, before ? lte(schema.rawEvents.at, before) : undefined))
      .orderBy(desc(schema.rawEvents.at)).limit(1)
    return r?.body as { assets?: { asset: string; qty: number; priceUsd?: number }[]; futures?: { positions?: Position[]; marginRatio?: number | null } | null } | undefined
  }
  const [latest, dayAgo, weekAgo] = await Promise.all([snap(now), snap(new Date(now.getTime() - 86_400_000)), snap(new Date(now.getTime() - 7 * 86_400_000))])
  const price = (s: typeof latest, a: string) => s?.assets?.find((x) => x.asset === a)?.priceUsd ?? undefined
  const holdings: Holding[] = (latest?.assets ?? []).filter((a) => a.qty > 0 && a.priceUsd && !USD_STABLES.has(a.asset))
    .map((a) => ({ asset: a.asset, qty: a.qty, priceNow: a.priceUsd!, price24h: price(dayAgo, a.asset), price7d: price(weekAgo, a.asset) }))

  return [...portfolioRows(holdings, latest?.futures?.positions ?? [], usdToBase, user.baseCurrency, latest?.futures?.marginRatio), ...signalRows([...signals, ...habits], today), ...(await moneyRows(user, now))]
    .sort((a, b) => badness(b) - badness(a) || Math.abs(b.weekPct ?? b.dayPct ?? 0) - Math.abs(a.weekPct ?? a.dayPct ?? 0))
    .slice(0, 30)
}

export type Pick = { row: Row; urgent: boolean; about: 'today' | 'week'; title: string; what: string; action?: string }

/** The same table checked an hour ago with nothing new: no need to ask again. */
let lastAsked = ''

/** The AI decides what deserves a nudge now. Null without a model (or when it fails). */
async function aiPick(user: User, rows: Row[], now: Date): Promise<Pick[] | null> {
  const { aiEnabled, model } = await import('@/ai/models')
  if (!aiEnabled('plan')) return null
  const fingerprint = JSON.stringify(rows.map((r) => [r.topic, r.today, r.dayPct, r.weekPct]))
  if (fingerprint === lastAsked) return []
  lastAsked = fingerprint
  const { signals } = await loadSignals(user, now)
  try {
    const { generate } = await import('@/ai/run')
    const topics = rows.map((r) => r.topic) as [string, ...string[]]
    const res = await generate('plan', 'rule.watch', {
      model: model('plan'),
      output: Output.object({ schema: z.object({ nudges: z.array(z.object({
        topic: z.enum(topics), urgent: z.boolean().describe('true only when money is at risk right now or something needs action today'),
        about: z.enum(['today', 'week']).describe('today: a spike or drop today or yesterday; week: a trend over the last 7 days (sent at most once a week)'),
        title: z.string().describe('up to 6 words, with the key number'),
        what: z.string().describe('one plain sentence, at most 14 words: what happened against usual, with the numbers from the table'),
        action: z.string().describe('at most 8 words, imperative: the one thing to do about it'),
      })).max(2) }) }),
      system: [
        'You watch one person’s live data (money, crypto, spending habits, health, work) and decide what is worth a phone notification right now.',
        'Each row compares today (so far), yesterday, the last 7 days and their usual (the 4 weeks before). dayPct and weekPct are changes against usual; for crypto they are 24-hour and 7-day price changes.',
        'Futures: judge risk only by toLiquidation (how far the price can still move before liquidation) and the margin ratio (liquidation at 100%). A big loss on a position\'s own margin is not danger by itself: on cross margin the whole wallet backs it. Say how far the price is from liquidation.',
        'Send only what they would want to know today: money at risk, an unusual spike or drop, a trend worth acting on, or a real win. Prefer what they said they want to improve. Ignore ordinary noise.',
        'At most two, and never two about the same group (spending, delivery apps and late-night orders are one event). An empty list is the right answer when nothing stands out. Nothing here was sent today.',
        `Quote only numbers that appear in the table; never compute new ones. Write money like ${user.baseCurrency === 'INR' ? '₹19,017' : '1,234 ' + user.baseCurrency}. It reads like a phone notification: short and specific. Title: up to 6 words with the key number, no emoji. what: at most 14 words on what happened against usual. action: at most 8 words. Plain words, no jargon.`,
      ].join(' '),
      prompt: JSON.stringify({
        now: now.toISOString(), timezone: user.timezone,
        wantsToImprove: { stats: user.profile.improve ?? [], inTheirWords: user.profile.goals || undefined },
        rows,
        movesTogether: findLinks(signals).slice(0, 5).map(describeLink),
      }),
    })
    return (res.output?.nudges ?? []).flatMap((n) => {
      const row = rows.find((r) => r.topic === n.topic)
      return row ? [{ row, urgent: n.urgent, about: n.about, title: n.title.trim().slice(0, 80), what: n.what.trim().slice(0, 300), action: n.action.trim().slice(0, 160) || undefined }] : []
    })
  } catch {
    lastAsked = '' // try again next hour
    return null
  }
}

/** Without an AI model: the two rows that moved the wrong way the most, in plain words. */
function fallback(rows: Row[]): Pick[] {
  return rows.filter((r) => badness(r) >= 0.25).slice(0, 2).map((row) => ({ row, urgent: false, about: 'week' as const, title: row.what.split(' (')[0], what: plain(row) }))
}
