// Turning whatever an app's order-history page loads into orders. Pure: no browser, no DB.
//
// Shopping apps have no public API, so we read the JSON their own web page fetches. Field names
// differ per app and change over time, so instead of one mapper per app we look for any list of
// objects that each have an id, an amount and a date. When nothing qualifies, the connector asks
// the AI model to read the page text instead (see ai/orders.ts).

export type ShopItem = { name: string; qty: number; price?: number; brand?: string; pack?: string; /** The shop's own product type (Flipkart's vertical, e.g. "HairDryer"). */ kind?: string }
export type ShopOrder = {
  orderId: string
  at: string // ISO
  total: number // in rupees (or the order's currency), positive
  currency: string
  merchant?: string
  status?: string
  items: ShopItem[]
  /** A second id some apps need to open the order's page (Blinkit's cart id). */
  detailKey?: string
}

const ID = ['order_id', 'orderId', 'orderID', 'order_number', 'orderNumber', 'order_no', 'orderNo', 'display_order_id', 'id']
const TOTAL = [
  'grandTotalAmount', 'totalPayableAmount',
  'grand_total', 'grandTotal', 'total_amount', 'totalAmount', 'order_total', 'orderTotal', 'net_amount', 'netAmount', 'paid_amount',
  'paidAmount', 'final_amount', 'finalAmount', 'bill_total', 'billTotal', 'total_cost', 'totalCost', 'order_amount', 'orderAmount',
  'total', 'amount', 'price',
]
const DATE = [
  'placedTime', 'placedAt',
  'created_at', 'createdAt', 'order_date', 'orderDate', 'placed_at', 'placedAt', 'ordered_at', 'orderedAt', 'order_time', 'orderTime',
  'delivered_at', 'deliveredAt', 'timestamp', 'created', 'date', 'time',
]
const MERCHANT = ['restaurant_name', 'restaurantName', 'store_name', 'storeName', 'merchant_name', 'merchantName', 'seller_name', 'sellerName', 'restaurant', 'store', 'merchant', 'seller', 'brand']
const STATUS = ['order_status', 'orderStatus', 'status', 'state', 'delivery_status', 'deliveryStatus']
const ITEMS = ['items', 'order_items', 'orderItems', 'products', 'line_items', 'lineItems', 'dishes', 'cart_items', 'cartItems']
const ITEM_NAME = ['name', 'title', 'product_name', 'productName', 'item_name', 'itemName', 'display_name', 'displayName']
const QTY = ['quantity', 'qty', 'count', 'units']

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const pick = (o: Obj, keys: string[]) => { for (const k of keys) if (o[k] != null && o[k] !== '') return { key: k, value: o[k] }; return null }

/** "₹1,234.50", 1234.5 or { amount: 1234.5 } → 1234.5. Keys ending in "paise" are divided by 100. */
export function toAmount(v: unknown, key = ''): number | null {
  if (isObj(v)) { const inner = pick(v, ['amount', 'value', 'total', 'units']); return inner ? toAmount(inner.value, inner.key) : null }
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return /paise/i.test(key) ? n / 100 : n
}

/** Epoch seconds, epoch ms, or a date string → ISO. Rejects anything outside 2010..next year. */
export function toDate(v: unknown): string | null {
  let d: Date
  if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v)
  else if (typeof v === 'string' && /^\d{10,13}$/.test(v)) return toDate(Number(v))
  else if (typeof v === 'string') d = new Date(v)
  else return null
  const y = d.getUTCFullYear()
  return Number.isNaN(d.getTime()) || y < 2010 || y > new Date().getUTCFullYear() + 1 ? null : d.toISOString()
}

function toItems(v: unknown): ShopItem[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((x) => {
    if (!isObj(x)) return []
    const name = pick(x, ITEM_NAME)
    if (typeof name?.value !== 'string') return []
    const qty = Number(pick(x, QTY)?.value ?? 1)
    const price = pick(x, ['price', 'total', 'amount', 'final_price', 'finalPrice'])
    return [{ name: name.value.trim(), qty: Number.isFinite(qty) && qty > 0 ? qty : 1, price: price ? toAmount(price.value, price.key) ?? undefined : undefined }]
  })
}

function toOrder(o: Obj, paise = false): ShopOrder | null {
  const id = pick(o, ID)
  const total = pick(o, TOTAL)
  const date = pick(o, DATE)
  if (!id || !total || !date || (typeof id.value !== 'string' && typeof id.value !== 'number')) return null
  const raw = toAmount(total.value, total.key)
  const amount = raw == null ? null : paise ? raw / 100 : raw
  const at = toDate(date.value)
  if (amount == null || !at) return null
  const m = pick(o, MERCHANT)
  const merchant = typeof m?.value === 'string' ? m.value : isObj(m?.value) && typeof m.value.name === 'string' ? m.value.name : undefined
  const s = pick(o, STATUS)
  return {
    orderId: String(id.value), at, total: Math.round(amount * 100) / 100,
    currency: typeof o.currency === 'string' && /^[A-Z]{3}$/.test(o.currency) ? o.currency : 'INR',
    merchant, status: typeof s?.value === 'string' ? s.value : undefined, items: toItems(pick(o, ITEMS)?.value),
  }
}

/**
 * Every order found in a set of JSON payloads. A list counts as orders when at least 60% of its
 * objects (and at least one) have an id, an amount and a date. Duplicates across payloads are merged.
 */
/** `paise`: the app sends amounts in paise with plain field names (Zepto's grandTotalAmount). */
export function ordersFromJson(payloads: unknown[], { paise = false }: { paise?: boolean } = {}): ShopOrder[] {
  const found = new Map<string, ShopOrder>()
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || v == null || typeof v !== 'object') return
    if (Array.isArray(v)) {
      const objs = v.filter(isObj)
      const orders = objs.map((x) => toOrder(x, paise)).filter((x): x is ShopOrder => !!x)
      if (orders.length && orders.length >= objs.length * 0.6) {
        for (const o of orders) if (!found.has(o.orderId)) found.set(o.orderId, o)
        return
      }
      for (const x of v) walk(x, depth + 1)
      return
    }
    for (const x of Object.values(v)) walk(x, depth + 1)
  }
  for (const p of payloads) walk(p, 0)
  return [...found.values()]
}

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : undefined)

/**
 * Flipkart's order history (RESPONSE.multipleOrderDetailsView.orders): full product titles, quantity, the
 * price paid per item and each item's status, so cancelled or returned items are left out of the order.
 */
export function ordersFromFlipkart(payloads: unknown[]): ShopOrder[] {
  const out: ShopOrder[] = []
  for (const p of payloads) {
    const orders = obj(obj(obj(p).RESPONSE).multipleOrderDetailsView).orders
    if (!Array.isArray(orders)) continue
    for (const o of orders.map(obj)) {
      const meta = obj(o.orderMetaData)
      const orderId = typeof meta.orderId === 'string' ? meta.orderId : null
      const when = num(meta.orderDate)
      if (!orderId || !when) continue
      const products = obj(o.productDataBag)
      const kept: ShopItem[] = []
      let paid = 0
      const statuses: string[] = []
      for (const u of Object.values(obj(o.units)).map(obj)) {
        const md = obj(u.metaData), money = obj(u.moneyDataBag)
        const status = String(obj(md.status).key ?? '')
        statuses.push(status)
        if (/cancel|return|refund|fail/i.test(status)) continue
        const title = typeof md.title === 'string' ? md.title.trim() : ''
        if (!title) continue
        const qty = num(md.quantity) ?? 1
        // `amount` is what the item cost after offers; `totalPayable` reads 0 once an order is paid.
        const pos = (v: unknown) => { const n = num(v); return n && n > 0 ? n : undefined }
        const price = pos(money.amount) ?? pos(money.totalPayable) ?? (pos(money.itemSellingPrice) != null ? pos(money.itemSellingPrice)! * qty : undefined)
        if (price != null) paid += price
        const basic = obj(obj(products[String(md.fsn ?? '')]).productBasicData)
        // Books carry their ISBN as the product id.
        const kind = /^97[89]\d{10}$/.test(String(md.fsn ?? '')) ? 'Book' : typeof basic.vertical === 'string' ? basic.vertical : undefined
        kept.push({ name: title.slice(0, 200), qty, ...(price != null ? { price } : {}), ...(kind ? { kind } : {}) })
      }
      const total = kept.length ? (paid || num(obj(o.orderMoneyDataBag).amount) || 0) : 0
      // The whole order's status: cancelled when nothing is left, else the first item still in play.
      const status = kept.length ? statuses.find((x) => !/cancel|return|refund|fail/i.test(x)) ?? 'Delivered' : statuses[0] || 'Cancelled'
      out.push({ orderId, at: new Date(when).toISOString(), total, currency: 'INR', merchant: 'Flipkart', status: kept.length ? status.toLowerCase() : 'cancelled', items: kept })
    }
  }
  return out
}

/** Cancelled or failed orders cost nothing. */
export const isCancelled = (o: ShopOrder) => /cancel|fail|refund(ed)?\b|reject|\breturned\b/i.test(o.status ?? '') || (o.total <= 0 && !o.items.length)

/** The shop says outright the order did not go through. Refunds, returns and empty reads are not proof the whole order cost nothing. */
export const isHardCancelled = (o: ShopOrder) => /cancel|fail|reject/i.test(o.status ?? '')

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * "12 Nov, 8:15 pm" or "12 Nov 2025, 8:15 pm" as a local wall time → ISO. Without a year it's this
 * year, or last year when that date is still ahead. `toUtc` turns a wall time into the real instant.
 */
export function parseShortDate(s: string, now: Date, toUtc: (wall: Date) => Date): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+(\d{4}))?,?\s+(\d{1,2}):(\d{2})\s*([ap]m)/i.exec(s)
  if (!m) return null
  const month = MONTHS.indexOf(m[2].toLowerCase())
  if (month < 0) return null
  const hour = (Number(m[4]) % 12) + (m[6].toLowerCase() === 'pm' ? 12 : 0)
  const at = (year: number) => toUtc(new Date(Date.UTC(year, month, Number(m[1]), hour, Number(m[5]))))
  let d = at(m[3] ? Number(m[3]) : now.getUTCFullYear())
  if (!m[3] && d.getTime() > now.getTime() + 86_400_000) d = at(now.getUTCFullYear() - 1)
  return d.toISOString()
}

/**
 * Apps built on server-driven "snippets" (Blinkit, Zomato) send each order as a card: an `identity.id`
 * like "order_123_…", and somewhere inside it the amount ("₹345"), the date and a status line.
 */
export function ordersFromSnippets(payloads: unknown[], now: Date, toUtc: (wall: Date) => Date): ShopOrder[] {
  const found = new Map<string, ShopOrder>()
  const texts = (v: unknown, out: string[] = []): string[] => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach((x) => texts(x, out))
    else if (isObj(v)) Object.entries(v).forEach(([k, x]) => { if (!/url|image|icon|color|tracking/i.test(k)) texts(x, out) })
    return out
  }
  const walk = (v: unknown, depth: number) => {
    if (depth > 12 || v == null || typeof v !== 'object') return
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1))
    if (!isObj(v)) return
    const ident = isObj(v.identity) && typeof v.identity.id === 'string' ? /^order[_-]?([A-Za-z0-9]+)(?:[_-]([A-Za-z0-9]+))?/i.exec(v.identity.id) : null
    const id = ident?.[1]
    if (id && !found.has(id)) {
      const all = texts(v)
      const amount = all.map((t) => /^(?:₹|Rs\.?)\s*([\d,]+(?:\.\d+)?)$/.exec(t.trim())?.[1]).find(Boolean)
      const at = all.map((t) => parseShortDate(t, now, toUtc)).find(Boolean)
      if (amount && at) {
        const status = all.find((t) => /arrived|delivered|cancel|refund|fail|on the way|preparing/i.test(t))
        found.set(id, { orderId: id, at, total: Number(amount.replace(/,/g, '')), currency: 'INR', status, items: [], ...(ident?.[2] ? { detailKey: ident[2] } : {}) })
        return
      }
    }
    Object.values(v).forEach((x) => walk(x, depth + 1))
  }
  payloads.forEach((p) => walk(p, 0))
  return [...found.values()]
}

/**
 * The price actually paid in a price label. Blinkit writes "~~<regular-200|{grey-500|₹150}>~~ ₹120": the
 * struck-out MRP, then the price. Struck-out parts are dropped and the last amount wins.
 */
export const paidPrice = (s: string) => {
  const amounts = [...s.replace(/~~.*?~~/g, ' ').matchAll(/₹\s*([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')))
  return amounts.length ? amounts[amounts.length - 1] : undefined
}

/** Zepto's order page: SHIPMENT widgets → orderProductsV2 → products. Prices are in paise. */
export function itemsFromZepto(payloads: unknown[]): ShopItem[] {
  const out: ShopItem[] = []
  const walk = (v: unknown, d: number) => {
    if (d > 10 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) return v.forEach((x) => walk(x, d + 1))
    if (isObj(v) && Array.isArray(v.orderProducts)) {
      for (const p of v.orderProducts) {
        if (!isObj(p) || !isObj(p.storeProduct) || !isObj(p.storeProduct.product)) continue
        const prod = p.storeProduct.product, variant = isObj(p.storeProduct.productVariant) ? p.storeProduct.productVariant : {}
        const qty = Number(p.quantityFulfilled ?? p.quantityOrdered ?? 1)
        if (typeof prod.name !== 'string' || !(qty > 0)) continue
        const total = typeof p.totalFinalSellingPrice === 'number' ? p.totalFinalSellingPrice / 100 : undefined
        out.push({ name: prod.name.trim(), qty, price: total, brand: typeof prod.brand === 'string' ? prod.brand : undefined, pack: typeof variant.formattedPacksize === 'string' ? variant.formattedPacksize : undefined })
      }
      return
    }
    Object.values(v).forEach((x) => walk(x, d + 1))
  }
  payloads.forEach((p) => walk(p, 0))
  return out
}

/** Blinkit's order_details snippets: item rows have a title, "500 g x 2" and the line total "₹120". */
export function itemsFromBlinkit(payloads: unknown[]): ShopItem[] {
  const out: ShopItem[] = []
  for (const p of payloads) {
    const snippets = isObj(p) && isObj(p.response) && Array.isArray(p.response.snippets) ? p.response.snippets : []
    for (const s of snippets) {
      if (!isObj(s) || typeof s.widget_type !== 'string' || !/image_text_snippet_type_30/.test(s.widget_type) || !isObj(s.data)) continue
      const t = (k: string) => (isObj(s.data) && isObj(s.data[k]) && typeof (s.data[k] as Obj).text === 'string' ? ((s.data[k] as Obj).text as string).trim() : '')
      const name = t('title'), sub = t('subtitle1'), price = t('subtitle3')
      const m = /^(.*?)\s*[x×]\s*(\d+)$/.exec(sub)
      if (!name || !m || !/₹/.test(price)) continue
      out.push({ name, qty: Number(m[2]), price: paidPrice(price), pack: m[1] || undefined })
    }
  }
  return out
}

const STOPPED = /cancel|refund|incomplete|fail|return complete|returned/i

/** "November 7, 2026 at 08:12 PM" or "12 October 2024" (no time: midday) as a local wall time → ISO. */
export function parseLongDate(s: string, toUtc: (wall: Date) => Date): string | null {
  const m = /(?:(\d{1,2})\s+([A-Za-z]{3,})|([A-Za-z]{3,})\s+(\d{1,2}),?)\s+(\d{4})(?:\D+(\d{1,2}):(\d{2})\s*([ap]m))?/i.exec(s)
  if (!m) return null
  const month = MONTHS.indexOf((m[2] ?? m[3]).slice(0, 3).toLowerCase())
  if (month < 0) return null
  const hour = m[6] ? (Number(m[6]) % 12) + (m[8].toLowerCase() === 'pm' ? 12 : 0) : 12
  return toUtc(new Date(Date.UTC(Number(m[5]), month, Number(m[1] ?? m[4]), hour, Number(m[7] ?? 0)))).toISOString()
}

/** Zomato's order history (`/webroutes/user/orders?page=N`): `entities.ORDER`, dishes as "1 x Momo, 2 x Naan". */
export function ordersFromZomato(payloads: unknown[], toUtc: (wall: Date) => Date): ShopOrder[] {
  const out: ShopOrder[] = []
  for (const p of payloads) {
    for (const o of Object.values(obj(obj(obj(p).entities).ORDER)).map(obj)) {
      const at = typeof o.orderDate === 'string' ? parseLongDate(o.orderDate, toUtc) : null
      const total = toAmount(o.totalCost)
      if (o.orderId == null || !at || total == null) continue
      const label = String(obj(o.deliveryDetails).deliveryLabel ?? '')
      const items = String(o.dishString ?? '').split(/,\s*(?=\d+\s*x\s)/).map((d) => /^(\d+)\s*x\s+(.+)$/.exec(d.trim())).filter((m) => !!m)
        .map((m) => ({ name: m[2].trim().slice(0, 200), qty: Number(m[1]) }))
      out.push({ orderId: String(o.orderId), at, total, currency: 'INR', merchant: String(obj(o.resInfo).name ?? '') || undefined, status: STOPPED.test(label) ? 'cancelled' : label.toLowerCase() || 'delivered', items })
    }
  }
  return out
}

/** One Amazon order card as read from the page: its text and its product links' titles. */
export type AmazonCard = { text: string; items: { name: string; asin?: string }[]; status: string }

/** Amazon's order list. Wallet top-ups move money, they don't spend it, so they count as not spent. */
export function ordersFromAmazon(cards: AmazonCard[], toUtc: (wall: Date) => Date): ShopOrder[] {
  const out: ShopOrder[] = []
  for (const c of cards) {
    const lines = c.text.split('\n').map((l) => l.trim()).filter(Boolean)
    const after = (re: RegExp) => { const i = lines.findIndex((l) => re.test(l)); return i >= 0 ? lines[i + 1] : undefined }
    const id = /ORDER #\s*([A-Z0-9-]+)/i.exec(c.text)?.[1]
    const placed = after(/^ORDER PLACED$/i)
    const at = placed ? parseLongDate(placed, toUtc) : null
    const total = toAmount(after(/^TOTAL$/i))
    if (!id || !at || total == null) continue
    const stopped = STOPPED.test(c.status) || /wallet|balance/i.test(c.status)
    out.push({ orderId: id, at, total, currency: 'INR', merchant: 'Amazon', status: stopped ? 'cancelled' : c.status.toLowerCase() || 'delivered', items: c.items.map((i) => ({ name: i.name.slice(0, 200), qty: 1, ...(i.asin && /^\d{9}[\dX]$/.test(i.asin) ? { kind: 'Book' } : {}) })) })
  }
  return out
}

/** What a MakeMyTrip booking is, from its line of business ("MOB-ON-Air Domestic", "B2C-ON-Hotel Domestic"). */
const TRIP_KIND: [RegExp, string][] = [[/air|flight/i, 'Flight'], [/hotel|homestay|villa/i, 'Hotel'], [/rail|train/i, 'Train'], [/bus/i, 'Bus'], [/cab|car/i, 'Cab'], [/holiday|package/i, 'Holiday']]

/**
 * MakeMyTrip's My Trips (`/api/v4/bookingsummary`): bookings grouped by status (completed, upcoming, cancelled,
 * failed, pending). Each has its id, when it was booked and what was paid. Pending ones aren't paid yet, so they're
 * left out; cancelled and failed ones keep their status and are skipped like cancelled orders.
 */
export function ordersFromMakeMyTrip(payloads: unknown[]): ShopOrder[] {
  const found = new Map<string, ShopOrder>()
  for (const p of payloads) {
    for (const g of Array.isArray(obj(p).newBookingDetails) ? (obj(p).newBookingDetails as unknown[]).map(obj) : []) {
      const status = String(g.status ?? '').toLowerCase()
      if (status === 'pending' || !Array.isArray(g.bookingDetails)) continue
      for (const b of g.bookingDetails.map(obj)) {
        const id = typeof b.bookingID === 'string' ? b.bookingID : null
        const when = num(b.bookingCreatedTime)
        const total = num(obj(b.paymentInfo).amountPaid) || num(b.bookingAmount)
        if (!id || !when || !total || found.has(id)) continue
        const lob = String(b.lobName ?? '')
        const currency = String(b.regionCurrency ?? obj(b.paymentInfo).currencyCode ?? 'INR')
        found.set(id, {
          orderId: id, at: new Date(when).toISOString(), total, currency: /^[A-Z]{3}$/.test(currency) ? currency : 'INR',
          merchant: TRIP_KIND.find(([re]) => re.test(lob))?.[1] ?? (lob.replace(/^[A-Z0-9]+-[A-Z]+-/, '') || undefined),
          status, items: [],
        })
      }
    }
  }
  return [...found.values()]
}
