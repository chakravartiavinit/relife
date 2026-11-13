import { Output } from 'ai'
import { z } from 'zod'
import { aiEnabled, model } from './models'
import { generate } from './run'
import type { ShopOrder } from '@/connectors/shop/extract'
import { toDate } from '@/connectors/shop/extract'

const schema = z.object({
  orders: z.array(z.object({
    orderId: z.string().optional().describe('order id or number exactly as shown'),
    date: z.string().describe('order date, ISO 8601 if possible'),
    total: z.number().positive().describe('amount paid for the whole order'),
    currency: z.string().optional(),
    merchant: z.string().optional().describe('restaurant, store or seller'),
    status: z.string().optional().describe('delivered, cancelled, returned…'),
    items: z.array(z.object({ name: z.string(), qty: z.number().optional(), price: z.number().optional() })).optional(),
  })),
})

/**
 * Reads orders from the visible text of an order-history page when its JSON gave nothing usable.
 * Never invents orders: an empty list is the right answer for a page with none.
 */
export async function ordersFromText(platform: string, text: string, today: string): Promise<ShopOrder[]> {
  if (!aiEnabled('parse')) return []
  const res = await generate('parse', `parse.orders.${platform}`, {
    model: model('parse'),
    output: Output.object({ schema }),
    system: `You read the order history page of ${platform}. List every order shown with its date and the total paid. Today is ${today}; resolve relative dates like "Yesterday" or "2 Nov" against it. Never invent orders or amounts; skip anything unclear.`,
    prompt: text.slice(0, 16_000),
  })
  return (res.output?.orders ?? []).flatMap((o) => {
    const at = toDate(o.date)
    if (!at) return []
    return [{
      // Without a shown id, date + amount is stable enough to dedupe re-syncs.
      orderId: o.orderId || `${at.slice(0, 10)}-${o.total}`,
      at, total: o.total, currency: (o.currency || 'INR').toUpperCase(), merchant: o.merchant, status: o.status,
      items: (o.items ?? []).map((i) => ({ name: i.name, qty: i.qty ?? 1, price: i.price })),
    }]
  })
}
