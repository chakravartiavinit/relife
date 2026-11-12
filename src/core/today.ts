import { cache } from 'react'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { User } from './user'
import { trackerDays, transactionsBetween, isSpend } from './metrics'
import { upcomingPayments, type DueItem, type ScheduleMeta } from './schedules'
import { loadPortfolio, contractCoin } from './portfolio'
import { addDays, localDate } from './time'
import { formatMoney } from '@/domain/money'
import { dueLabel, oneOffs } from '@/domain/wealth'
import { toLiquidation } from '@/domain/watch'
import type { PeekRef } from '@/domain/peek'

// The morning briefing on Today: what needs you first, today's spending next to a usual day and today's mood.
// Each part reads only what it shows; anything not connected simply drops out.

export type Attention = {
  key: string; tone: 'bad' | 'warn' | 'info'; kind: 'risk' | 'money' | 'medicine' | 'sync'; title: string; detail: string; href: string
  /** Opens this Peek instead of going to `href` (the routine or renewal behind it). */
  peek?: PeekRef
}

const MEDICINE_LOW = 7 // doses left before it's worth a heads-up
const SOON_DAYS = 2

export async function loadBriefing(user: User, payments: DueItem[], now = new Date()) {
  const today = localDate(now, user.timezone)
  const from = addDays(today, -29)

  const [txns, tracks, p, schedules, failing] = await Promise.all([
    transactionsBetween(user, from, today),
    trackerDays(user, today, today, { slugs: ['mood'] }),
    loadPortfolio(user),
    db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true), eq(schema.schedules.kind, 'medicine'))),
    db.select({ id: schema.connections.connectorId }).from(schema.connections).where(and(eq(schema.connections.userId, user.id), eq(schema.connections.enabled, true), eq(schema.connections.status, 'error'))),
  ])

  // Spending: today and a usual day (the 4 weeks before, one-off big orders left out).
  const spend = txns.filter(isSpend)
  const before = spend.filter((x) => x.localDate < today)
  const usualDay = before.length ? (before.reduce((s, x) => s - x.base, 0) - oneOffs(before.map((x) => -x.base), null)) / 29 : null
  const spentToday = spend.filter((x) => x.localDate === today).reduce((s, x) => s - x.base, 0)
  const paymentsToday = spend.filter((x) => x.localDate === today).sort((a, b) => b.at.getTime() - a.at.getTime())

  // What needs you first, worst first.
  const attention: Attention[] = []
  for (const pos of p.futures?.positions ?? []) {
    const away = toLiquidation({ side: pos.side, mark: pos.mark ?? 0, liquidation: pos.liquidation })
    if (away == null || away > 0.15) continue
    attention.push({
      key: `risk:${pos.symbol}`, tone: away <= 0.05 ? 'bad' : 'warn', kind: 'risk', href: '/wealth/portfolio',
      title: `${contractCoin(pos.symbol)} ${pos.side} is ${(away * 100).toFixed(1)}% from liquidation`,
      detail: `${pos.leverage}× ${pos.marginType === 'isolated' ? 'isolated' : 'cross'} · open P&L ${formatMoney(pos.unrealized * p.usdToBase, user.baseCurrency, { decimals: 0, sign: true })}`,
    })
  }
  for (const d of payments.filter((x) => x.daysLeft <= SOON_DAYS)) {
    attention.push({
      key: `due:${d.schedule.id}`, tone: 'warn', kind: 'money', href: '/wealth/subscriptions', peek: { type: 'routine', id: d.schedule.id },
      title: `${d.schedule.name} renews ${dueLabel(d.daysLeft).toLowerCase()}`,
      detail: d.amount ? formatMoney(d.amount, d.currency ?? user.baseCurrency) : 'Renewal',
    })
  }
  for (const m of schedules) {
    const stock = (m.meta as ScheduleMeta).stock
    if (typeof stock === 'number' && stock <= ((m.meta as ScheduleMeta).refillAt ?? MEDICINE_LOW)) {
      attention.push({ key: `med:${m.id}`, tone: stock <= 2 ? 'bad' : 'warn', kind: 'medicine', href: '/plan/routines', peek: { type: 'routine', id: m.id }, title: `${m.name}: ${stock} left`, detail: 'Time to refill' })
    }
  }
  if (failing.length) {
    attention.push({ key: 'sync', tone: 'warn', kind: 'sync', href: '/you/connections', title: `${failing.length} connector${failing.length === 1 ? '' : 's'} failing to sync`, detail: failing.map((f) => f.id).join(', ') })
  }

  const rank = { bad: 0, warn: 1, info: 2 } as const
  return {
    attention: attention.sort((a, b) => rank[a.tone] - rank[b.tone]),
    mood: tracks[0]?.days.get(today) ?? null,
    money: { spentToday, usualDay, paymentsToday: paymentsToday.slice(0, 4), countToday: paymentsToday.length },
  }
}

export type Briefing = Awaited<ReturnType<typeof loadBriefing>>

/** The briefing and the payments it was built from, once per request: the attention strip, the money card and the pulse share them. */
export const loadTodayBriefing = cache(async (user: User) => {
  const now = new Date()
  const payments = await upcomingPayments(user, now)
  return { payments, briefing: await loadBriefing(user, payments, now) }
})

/** What Today's Money card draws: formatted, so the component (and its /dev/ui fixtures) holds no logic. */
export type MoneyView = {
  total: string
  /** "₹160 under a usual day"; `bad` when well over. */
  versus?: { text: string; bad: boolean }
  payments: { id: string; name: string; logo: string; sub: string; amount: string; typed: boolean; needsCategory: boolean }[]
  more: number
  renewals: { id: string; weekday: string; day: string; name: string; when: string; soon: boolean; amount?: string }[]
}

/** Today's payments as they came in (newest first), then what renews in the next 7 days. */
export function moneyView(user: User, b: Briefing, payments: DueItem[]): MoneyView {
  const money = (v: number) => formatMoney(v, user.baseCurrency, { decimals: 0 })
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: user.timezone })
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: user.timezone })
  const dd = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: user.timezone })
  const { spentToday, usualDay, paymentsToday, countToday } = b.money
  const diff = usualDay ? spentToday - usualDay : null
  return {
    total: money(spentToday),
    versus: diff == null ? undefined : { text: `${money(Math.abs(diff))} ${diff <= 0 ? 'under' : 'over'} a usual day`, bad: !!usualDay && spentToday > usualDay * 1.5 },
    payments: paymentsToday.map((t) => {
      const needsCategory = !t.category || t.category === 'Uncategorized'
      return {
        id: t.id, name: t.merchant ?? t.upiId ?? 'Payment', logo: t.merchant ?? t.upiId ?? t.source,
        sub: [time.format(t.at), needsCategory ? null : t.category].filter(Boolean).join(' · '), amount: money(-t.base), typed: t.source === 'manual', needsCategory,
      }
    }),
    more: Math.max(0, countToday - paymentsToday.length),
    renewals: payments.filter((p) => p.daysLeft <= 7).map((p) => ({
      id: p.schedule.id, weekday: wd.format(p.due), day: dd.format(p.due), name: p.schedule.name, when: dueLabel(p.daysLeft), soon: p.daysLeft <= 1,
      amount: p.amount ? formatMoney(p.amount, p.currency ?? user.baseCurrency) : undefined,
    })),
  }
}
