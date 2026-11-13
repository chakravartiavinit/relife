import type { Parser } from '@/core/types'
import { SHOP_IDS } from '@/connectors/shop'
import type { ShopOrder } from '@/connectors/shop/extract'

// Orders read from shopping, food and travel apps (connectors/shop). Spending is tracked from these apps alone
// (bank messages are not read), so every order becomes a transaction on the app's own account. The order id is
// the external ref, so re-reading an order updates nothing and never counts it twice.

export const appOrder: Parser = {
  id: 'app-order',
  match: (e) => SHOP_IDS.has(e.source),
  parse: (e) => {
    const o = e.body as ShopOrder & { platform: string; name: string }
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
