import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { User } from './user'
import { convert } from './fx'
import { transactionsBetween, isSpend } from './metrics'
import { basketLines } from './basket'
import { monthlyCost, upcomingPayments } from './schedules'
import { loadPortfolio, contractCoin } from './portfolio'
import { snapshotNetWorth, netWorthHistory } from './net-worth'
import { addDays, localDate } from './time'
import { monthPace, monthRange, oneOffs, repeatBuys, shiftMonth, usualMonth } from '@/domain/wealth'
import { toLiquidation } from '@/domain/watch'

// Everything the Wealth overview shows, in one read: spending (month pace, 12 months by category, apps,
// repeat buys, all time), investments (Binance), subscriptions and the latest money nudges.

/** Where an order came from, as people call it. */
const APP_NAME: Record<string, string> = { zomato: 'Zomato', swiggy: 'Swiggy', blinkit: 'Blinkit', zepto: 'Zepto', amazon: 'Amazon', flipkart: 'Flipkart', makemytrip: 'MakeMyTrip' }
// One colour per spending category (core/categorize SPEND_CATEGORIES), from the theme tokens and mixes of them,
// so stacked bars and legends never show two categories in the same colour.
const mix = (a: string, b: string, pa = 55) => `color-mix(in oklch, var(${a}) ${pa}%, var(${b}))`
export const SPEND_COLORS: Record<string, string> = {
  'Food delivery': 'var(--cat-health)', Groceries: 'var(--cat-hobbies)', Shopping: 'var(--pill)', Rent: 'var(--cat-wealth)',
  Bills: 'var(--cat-relationships)', Transport: 'var(--cat-mind)', 'Dining out': mix('--cat-health', '--cat-wealth'), 'Eating out': mix('--cat-health', '--cat-wealth'),
  Entertainment: mix('--cat-mind', '--cat-health', 60), Subscriptions: 'var(--cat-skills)', Travel: mix('--cat-relationships', '--cat-hobbies', 60),
  Health: 'var(--bad)', 'Personal care': mix('--cat-mind', '--pill', 50), Education: 'var(--warn)', Gifts: mix('--cat-hobbies', '--cat-wealth', 50),
}
const PALETTE = [...new Set(Object.values(SPEND_COLORS))]
/** A category's colour; anything new gets a stable one from the palette, money moved around is grey. */
export const spendColor = (c: string) => SPEND_COLORS[c]
  ?? (/^(Investments|Transfers|Income|Uncategorized|Other)$/.test(c) ? 'var(--ink-3)' : PALETTE[[...c].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % PALETTE.length])

/** Topics of the money nudges in src/rules/watch.ts, plus the money rules. */
const MONEY_ALERT = /^(watch:(spend|habit|portfolio|coin|futures|subscriptions)|low-balance)/

export async function loadWealthOverview(user: User, now = new Date()) {
  const base = user.baseCurrency
  const today = localDate(now, user.timezone)
  const month = today.slice(0, 7)
  const from12 = `${shiftMonth(month, -11)}-01`

  const [txns, lines, p, payments, subs, alerts, nw] = await Promise.all([
    transactionsBetween(user, '2000-01-01', today),
    basketLines(user, addDays(today, -89), today),
    loadPortfolio(user),
    upcomingPayments(user, now),
    db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true), inArray(schema.schedules.kind, ['subscription', 'bill', 'renewal']))),
    db.select().from(schema.insights).where(and(
      eq(schema.insights.userId, user.id), eq(schema.insights.kind, 'alert'),
      gte(schema.insights.createdAt, new Date(now.getTime() - 30 * 86_400_000)),
    )).orderBy(desc(schema.insights.createdAt)).limit(20),
    snapshotNetWorth(user, now),
  ])
  const spend = txns.filter(isSpend)

  // Spending by month and category.
  const byMonth = new Map<string, number>()
  const byMonthCat = new Map<string, Map<string, number>>()
  for (const t of spend) {
    const m = t.localDate.slice(0, 7), v = -t.base, c = t.category ?? 'Other'
    byMonth.set(m, (byMonth.get(m) ?? 0) + v)
    const mc = byMonthCat.get(m) ?? byMonthCat.set(m, new Map()).get(m)!
    mc.set(c, (mc.get(c) ?? 0) + v)
  }
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11))
  const categories = [...new Set(spend.filter((t) => t.localDate >= from12).map((t) => t.category ?? 'Other'))]
    .sort((a, b) => months.reduce((s, m) => s + (byMonthCat.get(m)?.get(b) ?? 0), 0) - months.reduce((s, m) => s + (byMonthCat.get(m)?.get(a) ?? 0), 0))
  const year = months.reduce((s, m) => s + (byMonth.get(m) ?? 0), 0)

  // This month against a usual one.
  const spent = byMonth.get(month) ?? 0
  const day = Number(today.slice(8))
  const daysInMonth = Number(monthRange(month)[1].slice(8))
  const usual = usualMonth(byMonth, month)
  const oneOff = oneOffs(spend.filter((t) => t.localDate.startsWith(month)).map((t) => -t.base), usual)
  const pace = { spent, day, daysInMonth, usual, oneOff, ...monthPace(spent, day, daysInMonth, usual, oneOff) }
  const thisMonthCats = [...(byMonthCat.get(month) ?? new Map<string, number>())].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

  // Apps, last 12 months.
  const apps = new Map<string, { orders: number; total: number; last30: number }>()
  for (const t of spend) {
    if (t.localDate < from12) continue
    const k = APP_NAME[t.source] ?? t.merchant ?? t.source
    const a = apps.get(k) ?? apps.set(k, { orders: 0, total: 0, last30: 0 }).get(k)!
    a.orders++; a.total -= t.base
    if (t.localDate >= addDays(today, -29)) a.last30++
  }
  const appList = [...apps].map(([name, a]) => ({ name, ...a, avg: a.total / a.orders })).sort((a, b) => b.total - a.total)

  // All time, per category.
  const lifetime = new Map<string, { first: string; orders: number; total: number }>()
  for (const t of spend) {
    const c = t.category ?? 'Other'
    const l = lifetime.get(c) ?? lifetime.set(c, { first: t.localDate, orders: 0, total: 0 }).get(c)!
    if (t.localDate < l.first) l.first = t.localDate
    l.orders++; l.total -= t.base
  }
  const allTime = [...lifetime].map(([category, l]) => ({ category, ...l })).sort((a, b) => b.total - a.total)

  // Subscriptions.
  const monthlyBase = await Promise.all(subs.map(async (s) => ({ s, monthly: (await convert(monthlyCost(s), s.currency ?? base, base, today)) ?? 0 })))
  const subsMonthly = monthlyBase.reduce((a, x) => a + x.monthly, 0)
  const next = payments.filter((x) => x.daysLeft <= 30).slice(0, 4)

  // Investments.
  const positions = p.futures?.positions ?? []
  const risk = positions.map((x) => ({ symbol: x.symbol, coin: contractCoin(x.symbol), side: x.side, leverage: x.leverage, away: toLiquidation({ side: x.side, mark: x.mark ?? 0, liquidation: x.liquidation }), pnl: x.unrealized * p.usdToBase }))
    .sort((a, b) => (a.away ?? 1) - (b.away ?? 1))
  const history = await netWorthHistory(user, 90, now)

  return {
    base, today, month, months, categories, byMonthCat, byMonth, year, pace, thisMonthCats,
    apps: appList, allTime, repeat: repeatBuys(lines),
    subs: { monthly: subsMonthly, count: subs.length, next, top: monthlyBase.sort((a, b) => b.monthly - a.monthly) },
    invest: {
      empty: p.empty, worth: (p.spotUsd + p.futuresUsd) * p.usdToBase, spot: p.spotUsd * p.usdToBase, futures: p.futuresUsd * p.usdToBase,
      pnl: p.trading.total * p.usdToBase, open: p.trading.open * p.usdToBase, positions: risk,
      coins: p.held.slice(0, 4).map((h) => ({ asset: h.asset, value: h.usd * p.usdToBase })),
    },
    netWorth: nw.total, history,
    nudges: alerts.filter((a) => MONEY_ALERT.test(a.payload.dedupeKey ?? '')).slice(0, 5),
    empty: !spend.length && p.empty && !subs.length,
  }
}
