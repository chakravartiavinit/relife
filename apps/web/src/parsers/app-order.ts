import { and, eq } from 'drizzle-orm'
import { rawEvents, transactions } from '@/db/schema'
import type { Parser } from '@/core/types'
import { SHOP_IDS } from '@/connectors/shop'
import { isCancelled, isHardCancelled, type ShopOrder } from '@/connectors/shop/extract'

// Orders read from shopping, food and travel apps (connectors/shop). Spending is tracked from these apps alone
// (bank messages are not read), so every order becomes a transaction on the app's own account. The order id is
// the external ref, so re-reading an order never counts it twice (a changed total updates it, see persist). An
// order that turns out cancelled or refunded takes its transaction away again.

export const appOrder: Parser = {
  id: 'app-order',
  enriches: true, // a cancelled order deletes a row instead of returning one
  match: (e) => SHOP_IDS.has(e.source),
  parse: async (e, { user, db }) => {
    const o = e.body as ShopOrder & { platform: string; name: string }
    if (isHardCancelled(o)) {
      await db.delete(transactions).where(and(eq(transactions.userId, user.id), eq(transactions.source, o.platform), eq(transactions.externalRef, `${o.platform}:${o.orderId}`)))
      return []
    }
    if (isCancelled(o)) return [] // refunded, returned or read empty: not recorded, and nothing is deleted
    // Read again after it was cancelled (a retry, or the events parsed out of order): it stays cancelled.
    const [gone] = await db.select({ id: rawEvents.id }).from(rawEvents)
      .where(and(eq(rawEvents.userId, user.id), eq(rawEvents.source, e.source), eq(rawEvents.externalId, `${o.platform}:${o.orderId}:cancelled`))).limit(1)
    if (gone) return []
    return [{
      kind: 'transaction',
      account: { key: `app:${o.platform}`, kind: 'wallet', name: `${o.name} orders`, institution: o.name, currency: o.currency },
      at: new Date(o.at),
      amount: -o.total,
      currency: o.currency,
      merchant: o.merchant ? `${o.name} · ${o.merchant}` : o.name,
      source: o.platform,
      externalRef: `${o.platform}:${o.orderId}`,
      meta: { platform: o.platform, orderId: o.orderId, items: o.items, store: o.merchant, appOrder: true },
    }]
  },
}
