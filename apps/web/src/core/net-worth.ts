import { and, asc, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/db'
import { isDemo } from './demo'
import { signedBalance } from '@/domain/wealth'
import { convert } from './fx'
import { addDays, localDate } from './time'
import type { User } from './user'

// Net worth across every account: banks and wallets at their latest balance, cards and loans as debt,
// exchanges at live crypto value. One snapshot per local day builds the trend; re-saving a day replaces it.

export async function netWorthNow(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const base = user.baseCurrency
  const [all, holdings] = await Promise.all([
    db.select().from(schema.accounts).where(eq(schema.accounts.userId, user.id)),
    db.select().from(schema.holdings).where(eq(schema.holdings.userId, user.id)),
  ])
  // Shopping apps' order logs (app:zomato…) record spending; they hold no money.
  const accounts = all.filter((a) => !a.key.startsWith('app:'))
  const cryptoByAccount = new Map<string, number>()
  for (const h of holdings) {
    const v = await convert(h.qty * (h.priceUsd ?? 0), 'USD', base, today)
    cryptoByAccount.set(h.accountId, (cryptoByAccount.get(h.accountId) ?? 0) + (v ?? 0))
  }
  const rows = await Promise.all(accounts.map(async (a) => {
    const crypto = cryptoByAccount.get(a.id)
    const raw = crypto ?? (a.latestBalance == null ? null : await convert(a.latestBalance, a.currency, base, today))
    const value = raw == null ? null : crypto != null ? raw : signedBalance(a.kind, raw)
    const stale = a.balanceAt ? now.getTime() - a.balanceAt.getTime() > 2 * 86_400_000 : false
    return { a, value, stale }
  }))
  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0)
  const cash = rows.filter((r) => r.a.kind === 'bank' || r.a.kind === 'wallet').reduce((s, r) => s + (r.value ?? 0), 0)
  const crypto = [...cryptoByAccount.values()].reduce((s, v) => s + v, 0)
  // Coins worth $1 or more; dust left after a sale isn't counted as a holding.
  const coins = holdings.filter((h) => h.qty * (h.priceUsd ?? 0) >= 1).length
  return { today, total, cash, crypto, rows, holdings: coins, accounts: accounts.length }
}

/** Save today's net worth. Called by the worker hourly and whenever Wealth is opened. */
export async function snapshotNetWorth(user: User, now = new Date()) {
  const n = await netWorthNow(user, now)
  // Opening Wealth saves a snapshot; the read-only demo only reads (its sample data already has history).
  if (!n.accounts || isDemo()) return n
  await db.insert(schema.netWorthSnapshots)
    .values({ userId: user.id, localDate: n.today, currency: user.baseCurrency, total: n.total, cash: n.cash, crypto: n.crypto })
    .onConflictDoUpdate({ target: [schema.netWorthSnapshots.userId, schema.netWorthSnapshots.localDate], set: { currency: user.baseCurrency, total: n.total, cash: n.cash, crypto: n.crypto } })
  return n
}

/** Net worth per local day in the user's current base currency (each day converted at that day's rate). */
export async function netWorthHistory(user: User, days: number, now = new Date()) {
  const from = addDays(localDate(now, user.timezone), -(days - 1))
  const rows = await db.select({ d: schema.netWorthSnapshots.localDate, total: schema.netWorthSnapshots.total, currency: schema.netWorthSnapshots.currency })
    .from(schema.netWorthSnapshots)
    .where(and(eq(schema.netWorthSnapshots.userId, user.id), gte(schema.netWorthSnapshots.localDate, from)))
    .orderBy(asc(schema.netWorthSnapshots.localDate))
  const points = await Promise.all(rows.map(async (r) => [r.d, await convert(r.total, r.currency ?? user.baseCurrency, user.baseCurrency, r.d)] as const))
  // A day with no rate for its currency is left out rather than plotted in the wrong unit.
  return { from, days: new Map(points.filter((p): p is [string, number] => p[1] != null)) }
}
