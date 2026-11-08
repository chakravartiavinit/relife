import { addDays } from '@/core/time'
import type { Signal } from './patterns'

// The change table behind live nudges (src/rules/watch.ts): every number ReLife knows, now against
// yesterday and against a usual week. Code computes every number here; the AI only reads the table and
// decides what's worth a message, so it never has to do arithmetic or make a number up. There are no
// rules about what deserves a nudge, only a noise floor that keeps tiny changes out of the prompt.

export type Row = {
  /** What it's about. A nudge on a topic is sent at most once a day. */
  topic: string
  /** Topics about the same thing (spending, delivery apps and late-night orders; crypto; futures). One nudge per group a day. */
  group: string
  area: string
  what: string
  unit?: string | null
  /** Which way is good. */
  better: 'up' | 'down' | 'none'
  /** Today so far (or the current value for prices and positions). */
  today: number | null
  yesterday: number | null
  /** Average a day over the 4 weeks before last week, and over the last 7 days. */
  usual: number | null
  last7: number | null
  /** Relative changes the AI can quote: yesterday vs usual, last 7 days vs usual, and for prices 24h and 7d. */
  dayPct: number | null
  weekPct: number | null
  note?: string
  /** Futures only: how far the price can still move against the position before it's liquidated (0.032 = 3.2%). */
  toLiquidation?: number | null
}

/** Drop rows that barely moved: under 10% both ways (20% for money at risk is handled by the caller). */
export const NOISE = 0.1

const mean = (days: Map<string, number>, from: string, to: string, min: number) => {
  let s = 0, n = 0
  for (const [d, v] of days) if (d >= from && d <= to) { s += v; n++ }
  return n >= min ? s / n : null
}
const rel = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : (a - b) / Math.abs(b))
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100)
/** Numbers as people say them: money in whole units, small counts to one decimal. */
const nice = (v: number | null, unit?: string | null) => (v == null ? null : unit && /^[A-Z]{3}$/.test(unit) ? Math.round(v) : Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v))

/**
 * The month so far against a usual month: where it lands at today's pace. Early in a month the pace is too
 * noisy, so only from day 5, and only when the month heads 15% or more away from usual.
 */
export function monthPaceRow(spent: number, day: number, daysInMonth: number, usual: number | null, unit: string, oneOff = 0): Row | null {
  if (day < 5 || !usual) return null
  const projected = oneOff + ((spent - oneOff) / day) * daysInMonth // one-off big orders counted once
  const vs = (projected - usual) / usual
  if (Math.abs(vs) < 0.15) return null
  return {
    topic: 'spend:month', group: 'spend:month', area: 'wealth', what: 'Spending this month at the current pace', unit, better: 'down',
    today: nice(projected, unit), yesterday: null, usual: nice(usual, unit), last7: null, dayPct: null, weekPct: r2(vs),
    note: `${nice(spent, unit)} spent in the first ${day} of ${daysInMonth} days${oneOff ? `, ${nice(oneOff, unit)} of it in one-off big orders counted once` : ''}; today is where the month lands at this pace, usual is an average month`,
  }
}

/** Subscriptions per month now against a week ago, when one was added or a price changed. */
export function subscriptionsRow(now: number, weekAgo: number, added: string[], unit: string): Row | null {
  if (Math.abs(now - weekAgo) < 1) return null
  return {
    topic: 'subscriptions', group: 'subscriptions', area: 'wealth', what: 'Subscriptions per month', unit, better: 'down',
    today: nice(now, unit), yesterday: null, usual: nice(weekAgo, unit), last7: null, dayPct: null, weekPct: r2(rel(now, weekAgo)),
    note: `today is the monthly total now, usual is a week ago${added.length ? `; added this week: ${added.join(', ')}` : ''}`,
  }
}

/** One row per daily signal (sleep, steps, spending, a habit like Diet Coke…) that moved past the noise floor. */
export function signalRows(signals: Signal[], today: string): Row[] {
  const rows: Row[] = []
  for (const s of signals) {
    const usual = mean(s.days, addDays(today, -35), addDays(today, -8), 10)
    if (usual == null) continue
    const last7 = mean(s.days, addDays(today, -7), addDays(today, -1), 3)
    const yesterday = s.days.get(addDays(today, -1)) ?? null
    const row: Row = {
      topic: s.id, group: s.group, area: s.area, what: s.name, unit: s.unit, better: s.direction,
      today: nice(s.days.get(today) ?? null, s.unit), yesterday: nice(yesterday, s.unit), usual: nice(usual, s.unit), last7: nice(last7, s.unit),
      dayPct: r2(rel(yesterday, usual)), weekPct: r2(rel(last7, usual)),
      note: (s.agg ?? 'sum') === 'sum' ? 'today is the total so far' : undefined,
    }
    // Today so far already past a usual whole day counts as moving too (a spending spike at noon).
    const todaySpike = (s.agg ?? 'sum') === 'sum' && usual > 0 && (s.days.get(today) ?? 0) >= usual * 1.5
    if (Math.abs(row.dayPct ?? 0) >= NOISE || Math.abs(row.weekPct ?? 0) >= NOISE || todaySpike) rows.push(row)
  }
  return rows
}

export type Holding = { asset: string; qty: number; priceNow: number; price24h?: number; price7d?: number }
export type Position = { symbol: string; side: string; unrealized: number; margin: number; leverage: number; mark?: number; liquidation?: number; marginType?: string }

/**
 * Crypto: the holdings as a whole and each coin, measured on what you hold now at today's prices against
 * earlier ones (so deposits never look like gains), and each open futures position against its margin.
 */
/** Share of the price that can still move against a position before liquidation. Null when unknown. Pure. */
export function toLiquidation(p: Pick<Position, 'side' | 'mark' | 'liquidation'>): number | null {
  if (!p.mark || !p.liquidation) return null
  return Math.max(0, p.side === 'long' ? (p.mark - p.liquidation) / p.mark : (p.liquidation - p.mark) / p.mark)
}

export function portfolioRows(holdings: Holding[], positions: Position[], usdToBase: number, base: string, marginRatio?: number | null): Row[] {
  const rows: Row[] = []
  const held = holdings.filter((h) => h.qty * h.priceNow >= 10)
  const value = (price: (h: Holding) => number | undefined) => {
    const pairs = held.filter((h) => price(h) != null)
    return pairs.length ? pairs.reduce((s, h) => s + h.qty * price(h)!, 0) * usdToBase : null
  }
  const now = value((h) => h.priceNow), day = value((h) => h.price24h), week = value((h) => h.price7d)
  if (now != null && (day != null || week != null)) {
    rows.push({ topic: 'portfolio', group: 'crypto', area: 'wealth', what: 'Crypto holdings value', unit: base, better: 'up', today: Math.round(now), yesterday: day == null ? null : Math.round(day), usual: null, last7: week == null ? null : Math.round(week), dayPct: r2(rel(now, day)), weekPct: r2(rel(now, week)), note: '24h and 7d changes at today’s holdings' })
  }
  for (const h of held) {
    const dayPct = h.price24h ? (h.priceNow - h.price24h) / h.price24h : null
    const weekPct = h.price7d ? (h.priceNow - h.price7d) / h.price7d : null
    if (Math.abs(dayPct ?? 0) < NOISE && Math.abs(weekPct ?? 0) < NOISE) continue
    rows.push({ topic: `coin:${h.asset}`, group: 'crypto', area: 'wealth', what: `${h.asset} price (you hold ${Math.round(h.qty * h.priceNow * usdToBase)} ${base})`, unit: 'USD', better: 'up', today: h.priceNow, yesterday: h.price24h ?? null, usual: null, last7: h.price7d ?? null, dayPct: r2(dayPct), weekPct: r2(weekPct) })
  }
  // Futures: risk is the distance to the liquidation price, not the loss on the position's own margin
  // (on cross margin the whole wallet backs it, so it can lose more than its margin and stay open).
  for (const p of positions) {
    const dist = toLiquidation(p)
    rows.push({
      topic: `futures:${p.symbol}`, group: 'futures', area: 'wealth', what: `${p.symbol} ${p.side} at ${p.leverage}×, ${p.marginType ?? 'cross'} margin`, unit: base, better: 'up',
      today: Math.round(p.unrealized * usdToBase), yesterday: null, usual: null, last7: null, dayPct: null, weekPct: null,
      toLiquidation: dist == null ? null : Math.round(dist * 1000) / 1000,
      note: `today is the open profit or loss. ${dist == null ? 'Liquidation price unknown.' : `Liquidated if the price moves ${(dist * 100).toFixed(1)}% against it (mark ${usd(p.mark ?? 0)}, liquidation ${usd(p.liquidation ?? 0)}).`}`,
    })
  }
  if (marginRatio != null && positions.length) {
    rows.push({ topic: 'futures:margin', group: 'futures', area: 'wealth', what: 'Futures margin ratio (Binance liquidates at 100%)', unit: '%', better: 'down', today: Math.round(marginRatio * 1000) / 10, yesterday: null, usual: null, last7: null, dayPct: null, weekPct: null })
  }
  return rows
}

/** How bad a row looks, for ordering the table and for the plain fallback without an AI model. */
export function badness(r: Row) {
  if (r.toLiquidation != null) return Math.max(0, 1 - r.toLiquidation * 10) // 0% away → 1, 10%+ away → 0
  if (r.topic === 'futures:margin') return Math.max(0, ((r.today ?? 0) - 50) / 50)
  const sign = r.better === 'down' ? 1 : r.better === 'up' ? -1 : 0
  return Math.max(sign * (r.dayPct ?? 0), sign * (r.weekPct ?? 0), 0)
}

const usd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 4 : 2 })}`

/** One plain sentence for a row, used only when no AI model is connected. */
export function plain(r: Row): string {
  if (r.toLiquidation != null) return `${r.what}: liquidated if the price moves ${(r.toLiquidation * 100).toFixed(1)}% against it.`
  const pct = (p: number | null, when: string) => (p == null ? '' : `${p > 0 ? 'up' : 'down'} ${Math.round(Math.abs(p) * 100)}% ${when}`)
  return `${r.what}: ${[pct(r.dayPct, 'in a day'), pct(r.weekPct, 'over the week')].filter(Boolean).join(', ')}.`
}

const AREA_ICON: Record<string, string> = { health: '❤️', mind: '🧠', skills: '🛠️', wealth: '💰', hobbies: '🎨', relationships: '🤝' }

/** An emoji that says what the nudge is about at a glance: 🛵 delivery apps, 🥤 a soft drink, 💻 code, 😴 sleep. */
export function iconFor(r: Row, urgent = false): string {
  if (urgent) return '🚨'
  const bad = badness(r) > 0
  const t = r.topic.toLowerCase()
  if (t === 'futures:margin') return '⚖️'
  if (t.startsWith('futures:')) return bad || (r.toLiquidation != null && r.toLiquidation < 0.1) ? '⚠️' : '💹'
  if (t === 'portfolio') return bad ? '📉' : '📈'
  if (t.startsWith('coin:')) return '🪙'
  if (t === 'spend') return '💸'
  if (t === 'spend:month') return '🗓️'
  if (t === 'subscriptions') return '🔁'
  if (t === 'spend:apps') return '🛵'
  if (t === 'orders:late') return '🌙'
  if (t.startsWith('habit:')) {
    if (/drinks|coke|cola|pepsi|red bull|monster|sprite|soda|juice/.test(t)) return '🥤'
    if (/snack|sweet|chocolate|chips/.test(t)) return '🍫'
    if (/frozen|ready to eat|ramen|noodle|maggi/.test(t)) return '🍜'
    if (/eating out/.test(t)) return '🍽️'
    return '🛒'
  }
  const pairs: [RegExp, string][] = [
    [/github|commit|pull request|review|code/, '💻'], [/steps|walk/, '👟'], [/sleep/, '😴'], [/mood/, '🙂'], [/water/, '💧'],
    [/learning|course|study/, '📚'], [/screen|entertainment|social/, '📱'], [/cp\.|solved|codeforces|leetcode/, '🧩'],
    [/chess/, '♟️'], [/weight/, '⚖️'], [/routine/, '✅'], [/meditat|mind/, '🧘'],
  ]
  return pairs.find(([re]) => re.test(`${t} ${r.what.toLowerCase()}`))?.[1] ?? AREA_ICON[r.area] ?? '🔍'
}

/** The exact numbers behind a nudge, one per line, for the tap-to-expand box. Computed here, never by the AI. */
export function dataLines(r: Row, fmt: (v: number, unit?: string | null) => string): string[] {
  const change = (p: number | null) => (p == null ? '' : ` · ${p > 0 ? '▲' : '▼'} ${Math.round(Math.abs(p) * 100)}%`)
  if (r.topic === 'futures:margin') return [`Margin ratio ${r.today}%`, 'Binance liquidates at 100%']
  if (r.topic === 'spend:month') return [`At this pace ${fmt(r.today ?? 0, r.unit)} this month`, `Usual month ${fmt(r.usual ?? 0, r.unit)}${change(r.weekPct)}`]
  if (r.topic === 'subscriptions') return [`Now ${fmt(r.today ?? 0, r.unit)} a month`, `A week ago ${fmt(r.usual ?? 0, r.unit)} a month${change(r.weekPct)}`]
  if (r.toLiquidation !== undefined) {
    const m = /mark \$([\d.,]+), liquidation \$([\d.,]+)/.exec(r.note ?? '')
    return [
      ...(m ? [`Mark ${fmt(Number(m[1].replace(/,/g, '')), 'USD')} · liquidation ${fmt(Number(m[2].replace(/,/g, '')), 'USD')}`] : []),
      ...(r.toLiquidation != null ? [`${(r.toLiquidation * 100).toFixed(1)}% price move to liquidation`] : []),
      ...(r.today != null ? [`Open P&L ${fmt(r.today, r.unit)}`] : []),
    ]
  }
  if (r.topic === 'portfolio' || r.topic.startsWith('coin:')) {
    return [
      ...(r.today != null ? [`Now ${fmt(r.today, r.unit)}`] : []),
      ...(r.yesterday != null ? [`24 hours ago ${fmt(r.yesterday, r.unit)}${change(r.dayPct)}`] : []),
      ...(r.last7 != null ? [`7 days ago ${fmt(r.last7, r.unit)}${change(r.weekPct)}`] : []),
    ]
  }
  return [
    ...(r.today ? [`Today so far ${fmt(r.today, r.unit)}`] : []),
    ...(r.yesterday != null ? [`Yesterday ${fmt(r.yesterday, r.unit)}${change(r.dayPct)}`] : []),
    ...(r.last7 != null ? [`Last 7 days ${fmt(r.last7, r.unit)} a day${change(r.weekPct)}`] : []),
    ...(r.usual != null ? [`Usual ${fmt(r.usual, r.unit)} a day`] : []),
  ]
}
