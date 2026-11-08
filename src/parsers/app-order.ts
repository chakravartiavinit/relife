import { and, between, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import { transactions } from '@/db/schema'
import type { Parser } from '@/core/types'
import { SHOP_IDS } from '@/connectors/shop'
import type { ShopOrder } from '@/connectors/shop/extract'

// Orders read from shopping apps (connectors/shop). Like order emails, an order first tries to enrich
// the bank payment it belongs to (items, order id, store), so a purchase is never counted twice.
// Orders with no payment on record after two days (wallet, card or COD, or from before you connected
// your bank) become a transaction of their own on the app's account.

const SETTLE_MS = 2 * 86_400_000
const WINDOW_MS = 3 * 3_600_000

export const appOrder: Parser = {
  id: 'app-order',
  enriches: true,
  match: (e) => SHOP_IDS.has(e.source),
  parse: async (e, { user, db }) => {
    const o = e.body as ShopOrder & { platform: string; name: string }
    const at = new Date(o.at)
    const detail = { platform: o.platform, orderId: o.orderId, items: o.items, store: o.merchant, appOrder: true }

    const [match] = await db.select().from(transactions).where(and(
      eq(transactions.userId, user.id),
      between(transactions.at, new Date(at.getTime() - WINDOW_MS), new Date(at.getTime() + WINDOW_MS)),
      gte(transactions.amount, -(o.total + 1)),
      lte(transactions.amount, -(o.total - 1)),
      or(ilike(transactions.merchant, `%${o.platform}%`), ilike(transactions.upiId, `%${o.platform}%`), ilike(transactions.merchant, `%${o.name}%`)),
      // Never a row that already belongs to another app order (two same-priced orders an hour apart).
      sql`(${transactions.meta}->>'appOrder' is null or ${transactions.meta}->>'orderId' = ${o.orderId})`,
    )).limit(1)
    if (match) {
      await db.update(transactions).set({ meta: { ...match.meta, ...detail } }).where(eq(transactions.id, match.id))
      return []
    }
    // The bank message may still be on its way; the event is retried until the order settles.
    if (Date.now() - at.getTime() < SETTLE_MS) throw new Error('No matching payment yet')
    return [{
      kind: 'transaction',
      account: { key: `app:${o.platform}`, kind: 'wallet', name: `${o.name} orders`, institution: o.name, currency: o.currency },
      at,
      amount: -o.total,
      currency: o.currency,
      merchant: o.merchant ? `${o.name} · ${o.merchant}` : o.name,
      source: o.platform,
      externalRef: `${o.platform}:${o.orderId}`,
      meta: { ...detail, paymentNotFound: true },
    }]
  },
}
