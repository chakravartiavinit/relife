import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate, wallToUtc } from '@/core/time'
import { chromePath, LoggedOut, readPage, readPages, replayDetails } from './browser'
import { amazonHistory, makemytripHistory, swiggyHistory, zomatoHistory, type History } from './history'
import { isCancelled, isHardCancelled, itemsFromBlinkit, itemsFromZepto, ordersFromJson, ordersFromSnippets, type ShopItem, type ShopOrder, ordersFromFlipkart } from './extract'

// Shopping and food apps, read from your own logged-in account. No public APIs exist, so this opens
// the app's order-history page in Chrome with your saved session (see browser.ts), reads the order
// JSON the page loads, and falls back to the AI model reading the page text.
//
// Personal use only. This is not an official integration: it may go against an app's terms, it
// breaks when the app changes its site, and OTP sessions expire every few weeks (log in again).
// Each order is matched to its bank payment so nothing is counted twice (parsers/app-order.ts).

type Platform = {
  id: string; name: string
  login: string
  /** Order-history page. Overridable from the Connect dialog when an app moves it. */
  orders: string
  provides: string[]
  description: string
  /** Amounts arrive in paise. */
  paise?: boolean
  /** How to read each order's items: open its page, or replay the request a click on it makes. */
  details?:
    | { kind: 'page'; url: (o: ShopOrder) => string | null }
    | { kind: 'replay'; click: RegExp; match: RegExp; url: (template: string, o: ShopOrder) => string | null }
  items?: (json: unknown[]) => ShopItem[]
  /** Reads the whole order history page by page, for apps whose orders page shows only the latest few. */
  history?: History
}

// Item pages opened per sync; the rest follow on later syncs, newest first.
const ITEM_BATCH = 40

// ponytail: order-page URLs for Zomato, Blinkit and Zepto are best guesses until a first real sync;
// fix them in the Connect dialog (stored per app) rather than in code.
export const PLATFORMS: Platform[] = [
  { id: 'swiggy', name: 'Swiggy', login: 'https://www.swiggy.com/', orders: 'https://www.swiggy.com/my-account/orders', provides: ['Food orders', 'Instamart'], description: 'Food and Instamart orders from your Swiggy account, with items and totals.', history: swiggyHistory },
  { id: 'zomato', name: 'Zomato', login: 'https://www.zomato.com/', orders: 'https://www.zomato.com/users/orders', provides: ['Food orders', 'Restaurants'], description: 'Every Zomato order with restaurant, items and what you paid.', history: zomatoHistory },
  { id: 'blinkit', name: 'Blinkit', login: 'https://blinkit.com/', orders: 'https://blinkit.com/account/orders', provides: ['Grocery orders', 'Items'], description: 'Blinkit grocery orders, item by item.',
    details: {
      kind: 'replay', click: /^(Arrived in|Delivered)/, match: /\/order_details\//,
      url: (t, o) => (o.detailKey ? t.replace(/order_details\/\d+\?cart_id=\d+/, `order_details/${o.orderId}?cart_id=${o.detailKey}`) : null),
    }, items: itemsFromBlinkit },
  { id: 'zepto', name: 'Zepto', login: 'https://www.zepto.com/', orders: 'https://www.zepto.com/account/orders', provides: ['Grocery orders', 'Items'], description: 'Zepto grocery orders, item by item.', paise: true,
    details: { kind: 'page', url: (o) => `https://www.zepto.com/order/${o.orderId}?isArchived=false` }, items: itemsFromZepto },
  { id: 'flipkart', name: 'Flipkart', login: 'https://www.flipkart.com/account/login', orders: 'https://www.flipkart.com/account/orders', provides: ['Orders', 'Returns'], description: 'Flipkart orders and returns, with sellers and amounts.' },
  // Trips: bookings show under My Trips (upcoming, completed, cancelled); cancelled ones are skipped like orders. Log in
  // on the flights page: the bot wall often blocks the home page ("You are offline") but lets this one through.
  { id: 'makemytrip', name: 'MakeMyTrip', login: 'https://www.makemytrip.com/flights/', orders: 'https://supportz.makemytrip.com/Mima/BookingSummary/', provides: ['Flights', 'Hotels', 'Trains & buses'], description: 'Flights, hotels, trains and buses booked on MakeMyTrip, with what you paid.', history: makemytripHistory },
  { id: 'amazon', name: 'Amazon India', login: 'https://www.amazon.in/gp/css/order-history', orders: 'https://www.amazon.in/gp/css/order-history', provides: ['Orders', 'Returns'], description: 'Amazon.in orders and returns.', history: amazonHistory },
]

const QUICK = new Set(['zomato', 'swiggy', 'blinkit', 'zepto'])

const LOGIN_PAGE = /\/(log-?in|sign-?in|ap\/signin|auth)\b/i
const envKey = (id: string) => `${id.toUpperCase()}_ORDERS_URL`

/** A saved order page is opened in a Chrome that is logged in to the shop, so it has to be on the shop's own site (its orders address's domain, subdomains too). */
function ownSite(p: Platform, url: string) {
  const labels = new URL(p.orders).hostname.split('.')
  const site = labels.slice(-2).join('.')
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === site || host.endsWith(`.${site}`)
  } catch { return false }
}

function shopConnector(p: Platform): Connector {
  return {
    id: p.id,
    name: p.name,
    category: 'wealth',
    description: p.description,
    provides: p.provides,
    login: { url: p.login },
    fields: [{ env: envKey(p.id), label: 'Order history page', optional: true, placeholder: p.orders, hint: 'Leave blank. Only if the app moves its orders page: open your orders in Chrome and paste the address bar (not an API link).' }],
    env: [],
    // Food and grocery orders matter the same day; big-store orders less often. A bank SMS paying one of these apps
    // also syncs it at once (src/jobs/index.ts). Each sync opens a hidden Chrome window, so not more often.
    everyMinutes: QUICK.has(p.id) ? 2 * 60 : 6 * 60,
    /** Before connecting: Chrome has to be there, and a pasted order page has to be a web address. */
    async check(get) {
      chromePath()
      const url = get(envKey(p.id))
      if (!url) return
      let u: URL | null = null
      try { u = new URL(url) } catch { /* not an address */ }
      if (!u || !/^https?:$/.test(u.protocol)) throw new Error(`“${url.slice(0, 60)}” isn’t a web address. Copy it from Chrome’s address bar while your orders are open.`)
      if (!ownSite(p, url)) throw new Error(`That address isn’t on ${p.name}’s own site. Copy it from Chrome’s address bar while your ${p.name} orders are open.`)
    },
    async sync(ctx) {
      try { await run(ctx) } catch (e) {
        if (e instanceof LoggedOut) throw new Error(`Logged out of ${p.name}. Open You › Connections and log in again.`)
        throw e
      }
    },
  }
  async function run(ctx: Parameters<Connector['sync']>[0]) {
    const tz = ctx.user.timezone
    // Plain order lists first, then server-driven order cards (Blinkit, Zomato); merged by order id.
    const read = async (url: string) => {
      const page = await readPage(p.id, url)
      if (LOGIN_PAGE.test(new URL(page.finalUrl).pathname)) throw new Error(`Logged out of ${p.name}. Open You › Connections and log in again.`)
      if (/^\s*access denied/i.test(page.text)) throw new Error(`${p.name} blocked the sync (“access denied”). Try again later, or log in again in You › Connections.`)
      const byId = new Map<string, ShopOrder>()
      for (const o of [...(p.id === 'flipkart' ? ordersFromFlipkart(page.json) : []), ...ordersFromJson(page.json, { paise: p.paise }), ...ordersFromSnippets(page.json, new Date(), (w) => wallToUtc(w, tz))]) if (!byId.has(o.orderId)) byId.set(o.orderId, o)
      return { page, orders: [...byId.values()] }
    }
    const emitOrders = async (orders: ShopOrder[]) => {
      ctx.log(`${p.name}: ${orders.length} order${orders.length === 1 ? '' : 's'} read`)
      for (const o of orders) {
        const cancelled = isHardCancelled(o)
        if (isCancelled(o) && !cancelled) continue // a refund, return or empty read: skipped, never deletes a spend
        // A cancelled order gets its own id: under the order's id it would be dropped as a duplicate of the
        // earlier confirmed one, and the parser could not delete the spend it recorded.
        const id = `${p.id}:${o.orderId}${cancelled ? ':cancelled' : ''}`
        await ctx.emit({ source: p.id, externalId: id, at: new Date(o.at), body: { platform: p.id, name: p.name, ...o }, replace: true }) // a changed total is read again
      }
    }
    // A saved address that finds nothing (say, an API link pasted instead of the page) falls back to the default page.
    const saved = env(envKey(p.id))
    const custom = saved && ownSite(p, saved) ? saved : undefined // an address off the shop's own site is ignored, even if it got into .env
    if (saved && !custom) ctx.log(`${p.name}: ignoring the saved order page, it is not on ${p.name}’s own site`)
    const url0 = p.orders
    const cursor = (ctx.cursor ?? {}) as { withItems?: string[]; full?: boolean }
    if (p.history) {
      const byId = new Map((await p.history({ full: !cursor.full, tz })).map((o) => [o.orderId, o]))
      await emitOrders([...byId.values()])
      // A walk that found nothing (a fresh account, or a page that changed) is not a finished history: walk it all next time.
      ctx.setCursor({ lastSync: new Date().toISOString(), seen: byId.size, withItems: [], full: !!cursor.full || byId.size > 0 })
      return
    }
    let { page, orders } = await read(custom || p.orders)
    if (!orders.length && custom && custom !== p.orders) {
      ctx.log(`${p.name}: nothing at the saved address, trying ${p.orders}`)
      ;({ page, orders } = await read(p.orders))
    }
    if (!orders.length && page.text.trim()) {
      const { ordersFromText } = await import('@/ai/orders')
      orders = await ordersFromText(p.name, page.text, localDate(new Date(), ctx.user.timezone))
    }
    if (!orders.length && /log ?in|sign ?in/i.test(page.text) && !/order/i.test(page.text)) {
      throw new Error(`Logged out of ${p.name}. Open You › Connections and log in again.`)
    }
    await emitOrders(orders)
    // Items: open each order's page once (newest first, ITEM_BATCH per sync) and send its item list.
    const done = new Set(cursor.withItems ?? [])
    const d = p.details
    const need = p.items && d
      ? orders.filter((o) => !isCancelled(o) && !done.has(o.orderId) && (d.kind === 'page' ? d.url(o) : d.url('order_details/0?cart_id=0', o)))
        .sort((a, b) => b.at.localeCompare(a.at)).slice(0, ITEM_BATCH)
      : []
    const save = async (o: ShopOrder, json: unknown[]) => {
      const items = p.items!(json)
      if (!items.length) return // read again on the next sync
      await ctx.emit({ source: `${p.id}-items`, externalId: `${p.id}:items:${o.orderId}`, at: new Date(o.at), body: { platform: p.id, orderId: o.orderId, items } })
      done.add(o.orderId)
    }
    // The orders are saved already: items that can't be read now (the app moved a page) are retried next sync, not an error.
    try {
      if (need.length && d?.kind === 'page') await readPages(p.id, need.map((o) => d.url(o)!), (i, json) => save(need[i], json))
      if (need.length && d?.kind === 'replay') {
        await replayDetails(p.id, { listUrl: url0, click: d.click, match: d.match, keys: need.map((o) => o.orderId), urlFor: (t, key) => d.url(t, need.find((o) => o.orderId === key)!)!, onJson: (i, json) => save(need[i], [json]) })
      }
    } catch (e) {
      if (e instanceof LoggedOut) throw e
      ctx.log(`${p.name}: items skipped: ${e instanceof Error ? e.message : e}`)
    }
    if (need.length) ctx.log(`${p.name}: items read for ${need.filter((o) => done.has(o.orderId)).length} of ${need.length} orders`)
    ctx.setCursor({ lastSync: new Date().toISOString(), seen: orders.length, withItems: [...done] })
  }
}

export const shopConnectors = PLATFORMS.map(shopConnector)
export const SHOP_IDS = new Set(PLATFORMS.map((p) => p.id))
export const SHOP_ITEM_SOURCES = new Set(PLATFORMS.map((p) => `${p.id}-items`))
