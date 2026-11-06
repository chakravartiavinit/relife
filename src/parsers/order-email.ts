import { and, between, eq, gte, ilike, lte, or } from 'drizzle-orm'
import { transactions } from '@/db/schema'
import type { Parser } from '@/core/types'
import { BANK_SENDER, gmail } from './util'

const PLATFORMS = ['zomato', 'swiggy', 'zepto', 'blinkit'] as const
type Platform = (typeof PLATFORMS)[number]

export type OrderItem = { name: string; qty: number; price?: number }
export type Order = { platform: Platform; total: number; orderId?: string; items: OrderItem[] }

const money = (s: string) => Number(s.replace(/,/g, ''))
const RS = String.raw`(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)`

/**
 * Best-effort order-confirmation / invoice parser. Email templates change often:
 * add real samples to src/parsers/order-email.test.ts when one stops matching.
 */
export function parseOrderEmail(from: string, subject: string, text: string): Order | null {
  const hay = `${from} ${subject}`.toLowerCase()
  const platform = PLATFORMS.find((p) => hay.includes(p))
  if (!platform) return null
  const t = text.replace(/\r/g, '')

  const preferred = new RegExp(String.raw`(?:grand total|total paid|amount paid|order total|bill total|total amount|paid)\s*[:\-]?\s*${RS}`, 'gi')
  const any = new RegExp(String.raw`\btotal\b\s*[:\-]?\s*${RS}`, 'gi')
  const last = (re: RegExp) => [...t.matchAll(re)].pop()?.[1]
  const totalStr = last(preferred) ?? last(any)
  if (!totalStr) return null

  const orderId = /order\s*(?:id|no\.?|number|#)\s*[:#\-]?\s*#?([A-Z0-9][A-Z0-9-]{4,})/i.exec(t)?.[1]

  const items: OrderItem[] = []
  for (const raw of t.split('\n')) {
    const line = raw.trim()
    // "2 x Paneer Butter Masala ₹ 320" or "Paneer Butter Masala x 2 ₹320"
    const a = new RegExp(String.raw`^(\d+)\s*[x×]\s+(.+?)\s+${RS}$`, 'i').exec(line)
    const b = new RegExp(String.raw`^(.+?)\s+[x×]\s*(\d+)\s+${RS}$`, 'i').exec(line)
    if (a) items.push({ qty: Number(a[1]), name: a[2].trim(), price: money(a[3]) })
    else if (b) items.push({ qty: Number(b[2]), name: b[1].trim(), price: money(b[3]) })
  }
  return { platform, total: money(totalStr), orderId, items }
}

/**
 * Order emails enrich the bank payment (item list + order id) instead of creating a second
 * transaction. If the payment hasn't arrived yet we throw so the event is retried later.
 */
export const orderEmail: Parser = {
  id: 'order-email',
  enriches: true,
  match: (e) => {
    const g = gmail(e)
    return !!g && !BANK_SENDER.test(g.from) && PLATFORMS.some((p) => `${g.from} ${g.subject}`.toLowerCase().includes(p))
  },
  parse: async (e, { user, db }) => {
    const g = gmail(e)!
    const order = parseOrderEmail(g.from, g.subject, g.text)
    if (!order) return []
    const window = 45 * 60_000
    const [match] = await db.select().from(transactions).where(and(
      eq(transactions.userId, user.id),
      between(transactions.at, new Date(e.at.getTime() - window), new Date(e.at.getTime() + window)),
      gte(transactions.amount, -(order.total + 1)),
      lte(transactions.amount, -(order.total - 1)),
      or(ilike(transactions.merchant, `%${order.platform}%`), ilike(transactions.upiId, `%${order.platform}%`)),
    )).limit(1)
    if (!match) throw new Error('No matching payment yet')
    await db.update(transactions)
      .set({ meta: { ...match.meta, orderId: order.orderId, items: order.items, orderEmailId: g.id } })
      .where(eq(transactions.id, match.id))
    return []
  },
}
