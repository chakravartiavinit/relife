import { and, eq, sql } from 'drizzle-orm'
import { transactions } from '@/db/schema'
import type { Parser } from '@/core/types'
import { SHOP_ITEM_SOURCES } from '@/connectors/shop'
import type { ShopItem } from '@/connectors/shop/extract'

// Item lists read from each order's page (connectors/shop). They're added to the order's transaction
// (whether it came from the app or matched a bank payment), so spending can be broken down by item.
export const appOrderItems: Parser = {
  id: 'app-order-items',
  enriches: true,
  match: (e) => SHOP_ITEM_SOURCES.has(e.source),
  parse: async (e, { user, db }) => {
    const b = e.body as { platform: string; orderId: string; items: ShopItem[] }
    const [t] = await db.select().from(transactions).where(and(
      eq(transactions.userId, user.id),
      sql`${transactions.meta}->>'platform' = ${b.platform}`,
      sql`${transactions.meta}->>'orderId' = ${b.orderId}`,
    )).limit(1)
    // The order itself may still be waiting for its payment; retried until it's saved.
    if (!t) throw new Error('Order not saved yet')
    await db.update(transactions).set({ meta: { ...t.meta, items: b.items } }).where(eq(transactions.id, t.id))
    return []
  },
}
