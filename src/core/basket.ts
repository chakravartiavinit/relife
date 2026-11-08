import { categorize, categoryVsAverage, IMPULSE, topItems, type BasketLine, type ItemCategory } from '@/domain/basket'
import { monthRange, shiftMonth } from '@/domain/wealth'
import { isSpend, transactionsBetween } from './metrics'
import { localHour } from './time'
import type { User } from './user'

// Everything the Spending page needs about what's in your orders, for one month and the five before it.
// Item lines come from shopping-app orders (meta.items); order-level numbers cover every app order.

const MONTHS = 6

type Item = { name: string; qty: number; price?: number; kind?: string }

// Restaurant dishes aren't groceries: "Butter Naan" is a meal out, not dairy.
// ponytail: Swiggy's web history is food only; split by store if Instamart orders ever arrive.
const FOOD_APPS = /^(zomato|swiggy)$/
/** Every item from app orders between two local dates, with what it cost and its category. */
export async function basketLines(user: User, from: string, to: string) {
  return (await read(user, from, to)).lines
}

export async function loadBasket(user: User, month: string) {
  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(month, i - (MONTHS - 1)))
  const [from] = monthRange(months[0])
  const [, to] = monthRange(month)
  const { lines, orders } = await read(user, from, to)
  return summarize(lines, orders, months, month)
}

async function read(user: User, from: string, to: string) {
  const txns = (await transactionsBetween(user, from, to)).filter(isSpend)
  const lines: BasketLine[] = []
  const orders: { month: string; date: string; hour: number; platform: string; total: number; items: number; fees: number }[] = []
  for (const t of txns) {
    const meta = (t.meta ?? {}) as { platform?: string; items?: Item[] }
    if (!meta.platform) continue
    const hour = localHour(t.at, user.timezone)
    const m = t.localDate.slice(0, 7)
    const total = -t.base
    // Item prices are in the order's currency; scale to the base currency the same way the order was.
    const rate = t.amount ? t.base / t.amount : 1
    const items = Array.isArray(meta.items) ? meta.items : []
    // What you paid beyond the items themselves: delivery, handling, small-cart and platform fees.
    const itemsSum = items.reduce((s, it) => s + (it?.price ?? 0) * rate, 0)
    orders.push({ month: m, date: t.localDate, hour, platform: meta.platform, total, items: items.length, fees: items.some((it) => it?.price != null) ? Math.max(0, total - itemsSum) : 0 })
    // Shops that don't price each item (or an AI-read page): split what you paid across the items by quantity.
    const priced = items.some((it) => it?.price != null)
    const units = items.reduce((n, it) => n + (it?.qty || 1), 0) || 1
    for (const it of items) {
      if (!it?.name) continue
      const spend = priced ? (it.price ?? 0) * rate : total * ((it.qty || 1) / units)
      lines.push({ date: t.localDate, month: m, hour, platform: meta.platform, name: it.name, qty: it.qty || 1, spend, category: FOOD_APPS.test(meta.platform) ? 'Eating out' : categorize(it.name, it.kind) })
    }
  }
  return { lines, orders }
}

type Order = Awaited<ReturnType<typeof read>>['orders'][number]

function summarize(lines: BasketLine[], orders: Order[], months: string[], month: string) {
  const prev = months.slice(-4, -1)
  const thisMonth = lines.filter((l) => l.month === month)
  const thisOrders = orders.filter((o) => o.month === month)
  const prevOrders = orders.filter((o) => prev.includes(o.month))
  const activePrev = prev.filter((p) => orders.some((o) => o.month === p)).length || 1
  const basketTotal = thisMonth.reduce((s, l) => s + l.spend, 0)
  const impulse = thisMonth.filter((l) => IMPULSE.includes(l.category)).reduce((s, l) => s + l.spend, 0)
  const late = thisOrders.filter((o) => o.hour >= 22 || o.hour < 4)
  const small = thisOrders.filter((o) => o.total < 200)

  // Month-by-month by category: the five biggest over the window, the rest as "Other".
  const totals = new Map<ItemCategory, number>()
  for (const l of lines) totals.set(l.category, (totals.get(l.category) ?? 0) + l.spend)
  const top: ItemCategory[] = [...totals].sort((a, b) => b[1] - a[1]).map(([c]) => c).filter((c) => c !== 'Other').slice(0, 5)
  const monthly = months.map((mo) => {
    const row: Record<string, number> = {}
    for (const l of lines.filter((x) => x.month === mo)) {
      const k = top.includes(l.category) ? l.category : 'Other'
      row[k] = (row[k] ?? 0) + l.spend
    }
    return { month: mo, row, orders: orders.filter((o) => o.month === mo).reduce((s, o) => s + o.total, 0) }
  })

  const byPlatform = new Map<string, { orders: number; total: number }>()
  for (const o of thisOrders) {
    const p = byPlatform.get(o.platform) ?? { orders: 0, total: 0 }
    byPlatform.set(o.platform, { orders: p.orders + 1, total: p.total + o.total })
  }

  return {
    months, top, monthly,
    hasItems: lines.length > 0,
    itemsCoverage: { withItems: thisOrders.filter((o) => o.items > 0).length, orders: thisOrders.length },
    categories: categoryVsAverage(lines, month, prev),
    items: topItems(thisMonth),
    usual: topItems(lines.filter((l) => prev.includes(l.month) || l.month === month)).sort((a, b) => b.times - a.times).slice(0, 6),
    platforms: [...byPlatform].map(([platform, v]) => ({ platform, ...v })).sort((a, b) => b.total - a.total),
    habits: {
      orders: thisOrders.length,
      ordersAvg: prevOrders.length / activePrev,
      avgOrder: thisOrders.length ? thisOrders.reduce((s, o) => s + o.total, 0) / thisOrders.length : 0,
      lateCount: late.length, lateSpend: late.reduce((s, o) => s + o.total, 0),
      smallCount: small.length, smallSpend: small.reduce((s, o) => s + o.total, 0),
      impulseShare: basketTotal ? impulse / basketTotal : 0, impulse,
      fees: thisOrders.reduce((s, o) => s + o.fees, 0),
    },
  }
}

export type Basket = Awaited<ReturnType<typeof loadBasket>>
