import { wallToUtc } from '@/core/time'
import { walk } from './browser'
import { ordersFromAmazon, ordersFromJson, ordersFromMakeMyTrip, ordersFromZomato, type AmazonCard, type ShopOrder } from './extract'

// Whole order histories for apps whose page shows only the latest few orders. The first sync walks
// every page; later ones read just the newest pages (`full` is false once a whole walk has finished).

export type History = (o: { full: boolean; tz: string }) => Promise<ShopOrder[]>

const RECENT_PAGES = 3

/** Zomato's own order API, 10 orders a page. */
export const zomatoHistory: History = async ({ full, tz }) => {
  const orders: ShopOrder[] = []
  let page = 1
  await walk('zomato', `https://www.zomato.com/webroutes/user/orders?page=1`, async (json) => {
    const sec = json.map((j) => (j as { sections?: { SECTION_USER_ORDER_HISTORY?: { totalPages?: number } } })?.sections?.SECTION_USER_ORDER_HISTORY).find(Boolean)
    if (!sec) { if (page === 1) throw new Error('Logged out of Zomato. Open Connectors and log in again.'); return null }
    orders.push(...ordersFromZomato(json, (w) => wallToUtc(w, tz)))
    page++
    return page <= (sec.totalPages ?? 0) && (full || page <= RECENT_PAGES) ? `https://www.zomato.com/webroutes/user/orders?page=${page}` : null
  })
  return orders
}

/** Swiggy's order API: each call returns the orders after the last id it was given. */
export const swiggyHistory: History = async ({ full }) => {
  const orders: ShopOrder[] = []
  let calls = 0
  await walk('swiggy', 'https://www.swiggy.com/dapi/order/all?order_id=', async (json) => {
    const list = (json[0] as { data?: { orders?: { order_id?: unknown }[] } })?.data?.orders
    if (!Array.isArray(list)) { if (!calls) throw new Error('Logged out of Swiggy. Open Connectors and log in again.'); return null }
    calls++
    orders.push(...ordersFromJson(json))
    const last = list.at(-1)?.order_id
    return list.length && last != null && (full || calls < RECENT_PAGES) ? `https://www.swiggy.com/dapi/order/all?order_id=${last}` : null
  })
  return orders
}

/** Amazon's order list, 10 cards a page, one year at a time (just the last 3 months once synced). */
export const amazonHistory: History = async ({ full, tz }) => {
  const BASE = 'https://www.amazon.in/your-orders/orders'
  const orders: ShopOrder[] = []
  let filters: string[] | null = null
  let start = 0
  await walk<{ cards: AmazonCard[]; years: string[]; count: number }>('amazon', `${BASE}?timeFilter=months-3`, async (_json, page) => {
    if (!page) return null
    orders.push(...ordersFromAmazon(page.cards, (w) => wallToUtc(w, tz)))
    filters ??= ['months-3', ...(full ? page.years : [])]
    start += 10
    if (start >= page.count) { filters.shift(); start = 0 }
    return filters.length ? `${BASE}?timeFilter=${filters[0]}${start ? `&startIndex=${start}` : ''}` : null
  }, () => ({
    cards: [...document.querySelectorAll<HTMLElement>('.order-card, .js-order-card')].map((c) => ({
      text: c.innerText,
      items: [...new Map([...c.querySelectorAll<HTMLAnchorElement>('a[href*="/dp/"], a[href*="/gp/product/"]')]
        .map((a) => ({ name: a.innerText.trim(), asin: /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(a.href)?.[1] }))
        .filter((i) => i.name.length > 3).map((i) => [i.name, i])).values()],
      status: c.querySelector<HTMLElement>('.delivery-box__primary-text, .yohtmlc-shipment-status-primaryText')?.innerText.trim() ?? '',
    })),
    years: [...document.querySelectorAll<HTMLOptionElement>('select[name="timeFilter"] option')].map((o) => o.value).filter((v) => /^year-\d{4}$/.test(v)),
    count: Number(/(\d+) orders? placed/i.exec(document.body.innerText)?.[1] ?? 0),
  }))
  return orders
}

/**
 * MakeMyTrip's My Trips. The page shows 20 bookings per status; the rest come from its own API, which wants the
 * login cookie as an `mmt-auth` header, so the pages are fetched from inside the logged-in page. Every sync reads
 * them all (a few requests). No named functions inside the page script: the dev bundler wraps those in a helper
 * the page doesn't have.
 */
export const makemytripHistory: History = async () => {
  let pages: unknown[] = []
  await walk<unknown[]>('makemytrip', 'https://supportz.makemytrip.com/Mima/BookingSummary/', async (_json, scraped) => {
    pages = scraped ?? []
    return null
  }, (async () => {
    const auth = document.cookie.split('; ').find((c) => c.startsWith('mmt-auth='))?.slice(9)
    if (!auth) return []
    const out: unknown[] = []
    const queue: [number, string][] = [[0, 'ALL']]
    while (queue.length && out.length < 60) {
      const [pageNo, status] = queue.shift()!
      const res = await fetch(`/api/v4/bookingsummary?pageNo=${pageNo}&status=${status}`, { headers: { 'mmt-auth': auth, 'Content-Type': 'application/json' } })
      const r = (await res.json().catch(() => null)) as { newBookingDetails?: { status: string; hasNext: boolean }[] } | null
      out.push(r)
      for (const g of r?.newBookingDetails ?? []) if (g.hasNext && (status === 'ALL' || g.status === status)) queue.push([pageNo + 1, g.status])
    }
    return out
  }) as unknown as () => unknown[])
  if (!pages.length) throw new Error('Logged out of MakeMyTrip. Open Connectors and log in again.')
  return ordersFromMakeMyTrip(pages)
}
