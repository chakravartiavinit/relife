import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCancelled, ordersFromAmazon, ordersFromJson, ordersFromZomato, parseLongDate, toAmount, toDate } from './extract'

test('toAmount reads numbers, rupee strings, nested amounts and paise', () => {
  assert.equal(toAmount(345), 345)
  assert.equal(toAmount('₹1,234.50'), 1234.5)
  assert.equal(toAmount({ amount: 99 }), 99)
  assert.equal(toAmount(34500, 'total_paise'), 345)
  assert.equal(toAmount(0), null)
})

test('toDate takes epoch seconds, ms and ISO strings, and rejects junk', () => {
  assert.equal(toDate(1730880000), '2024-11-06T08:00:00.000Z')
  assert.equal(toDate(1730880000000), '2024-11-06T08:00:00.000Z')
  assert.equal(toDate('2024-11-06T08:00:00Z'), '2024-11-06T08:00:00.000Z')
  assert.equal(toDate('not a date'), null)
  assert.equal(toDate(42), null)
})

test('ordersFromJson finds the order list wherever it sits and ignores other lists', () => {
  const page = {
    data: {
      banners: [{ id: 1, title: 'Sale' }],
      orders: [
        { order_id: 'Z1', created_at: '2026-11-01T13:00:00Z', grand_total: '₹412', restaurant: { name: 'Biryani Blues' }, status: 'Delivered',
          items: [{ name: 'Chicken Biryani', quantity: 1, price: 349 }, { name: 'Coke', quantity: 2, price: 40 }] },
        { order_id: 'Z2', created_at: 1730880000, grand_total: 199, status: 'Cancelled', items: [] },
      ],
    },
  }
  const orders = ordersFromJson([page, page])
  assert.equal(orders.length, 2)
  assert.deepEqual(orders[0], {
    orderId: 'Z1', at: '2026-11-01T13:00:00.000Z', total: 412, currency: 'INR', merchant: 'Biryani Blues', status: 'Delivered',
    items: [{ name: 'Chicken Biryani', qty: 1, price: 349 }, { name: 'Coke', qty: 2, price: 40 }],
  })
  assert.ok(isCancelled(orders[1]))
  assert.deepEqual(ordersFromJson([{ products: [{ id: 1, name: 'x' }] }]), [])
})

test('ordersFromSnippets reads order cards (fake data in Blinkit’s shape)', async () => {
  const { ordersFromSnippets, parseShortDate } = await import('./extract')
  const ist = (wall: Date) => new Date(wall.getTime() - 330 * 60_000) // Asia/Kolkata, UTC+5:30
  const now = new Date('2026-11-07T10:00:00Z')
  const card = (id: string, title: string, amount: string, when: string) => ({
    data: { items: [{ data: { title: { text: title }, left_underlined_subtitle: { text: amount }, subtitle: { text: when }, right_icon: { code: 'e901' } } }], identity: { id } },
    widget_type: 'order_history_card_vr',
  })
  const page = { is_success: true, response: { snippets: [
    { data: { title: { text: 'Your orders' } } },
    card('order_111_222', 'Arrived in 12 minutes', '₹345', '2 Nov, 8:15 pm'),
    card('order_333_444', 'Order cancelled', '₹1,099', '28 Dec, 9:00 am'),
  ] } }
  const orders = ordersFromSnippets([page, page], now, ist)
  assert.equal(orders.length, 2)
  assert.deepEqual(orders[0], { orderId: '111', at: '2026-11-02T14:45:00.000Z', total: 345, currency: 'INR', status: 'Arrived in 12 minutes', items: [], detailKey: '222' })
  assert.equal(orders[1].at, '2025-12-28T03:30:00.000Z') // no year and still ahead: last year
  assert.equal(orders[1].total, 1099)
  assert.equal(parseShortDate('no date here', now, ist), null)
})

test('ordersFromJson reads paise totals when asked (fake data in Zepto’s shape)', () => {
  const page = { orders: [
    { id: 'a1', code: 'ZP1', status: 'DELIVERED', grandTotalAmount: 34550, placedTime: '2026-11-02T08:15:00Z' },
    { id: 'a2', code: 'ZP2', status: 'CANCELLED', grandTotalAmount: 9900, placedTime: '2026-11-03T08:15:00Z' },
  ], endOfList: false }
  const [first, second] = ordersFromJson([page], { paise: true })
  assert.equal(first.total, 345.5)
  assert.equal(first.at, '2026-11-02T08:15:00.000Z')
  assert.ok(isCancelled(second))
  assert.equal(ordersFromJson([page])[0].total, 34550)
})

test('ordersFromFlipkart reads full titles and prices, and drops cancelled items', async () => {
  const { ordersFromFlipkart, isCancelled } = await import('./extract')
  const unit = (title: string, status: string, paid: number, fsn: string, qty = 1) => ({ metaData: { title, quantity: qty, fsn, status: { key: status } }, moneyDataBag: { totalPayable: 0, amount: paid, itemSellingPrice: paid / qty } })
  const payload = { RESPONSE: { multipleOrderDetailsView: { orders: [
    { orderMetaData: { orderId: 'OD1', orderDate: Date.parse('2026-10-31T10:00:00Z') }, orderMoneyDataBag: { amount: 27990 },
      units: { a: unit('SONY WH-1000XM5 Wireless Noise Cancelling Headphones with Auto NC Optimizer', 'Delivered', 24990, 'F1'), b: unit('Cable', 'Cancelled', 3000, 'F2') },
      productDataBag: { F1: { productBasicData: { vertical: 'Headphone' } } } },
    { orderMetaData: { orderId: 'OD2', orderDate: Date.parse('2026-10-01T10:00:00Z') }, orderMoneyDataBag: { amount: 1500 },
      units: { a: unit('PHILIPS Hair Dryer', 'Cancelled', 1500, 'F3') }, productDataBag: {} },
  ] } } }
  const [a, b] = ordersFromFlipkart([payload])
  assert.equal(a.orderId, 'OD1')
  assert.equal(a.total, 24990) // the cancelled cable isn't paid for
  assert.deepEqual(a.items, [{ name: 'SONY WH-1000XM5 Wireless Noise Cancelling Headphones with Auto NC Optimizer', qty: 1, price: 24990, kind: 'Headphone' }])
  assert.equal(a.status, 'delivered')
  assert.ok(isCancelled(b))
})

const utc = (w: Date) => w // treat wall time as UTC in tests

test('parseLongDate reads Zomato and Amazon dates', () => {
  assert.equal(parseLongDate('November 7, 2026 at 08:12 PM', utc), '2026-11-07T20:12:00.000Z')
  assert.equal(parseLongDate('12 October 2024', utc), '2024-10-12T12:00:00.000Z')
  assert.equal(parseLongDate('soon', utc), null)
})

test('ordersFromZomato reads dishes, restaurant and skips unpaid or refunded orders', () => {
  const order = (id: number, label: string, dishes: string) => ({ orderId: id, totalCost: '₹1,249.50', orderDate: 'March 3, 2025 at 01:05 PM', dishString: dishes, deliveryDetails: { deliveryLabel: label }, resInfo: { name: 'Momo Hut' } })
  const [a, b, c] = ordersFromZomato([{ entities: { ORDER: { 1: order(1, 'Delivered', '1 x Paneer, Onion Pizza, 2 x Garlic Naan'), 2: order(2, 'Payment Incomplete', '1 x Tea'), 3: order(3, 'Refund Completed', '1 x Tea') } } }], utc)
  assert.equal(a.total, 1249.5)
  assert.equal(a.merchant, 'Momo Hut')
  assert.deepEqual(a.items, [{ name: 'Paneer, Onion Pizza', qty: 1 }, { name: 'Garlic Naan', qty: 2 }])
  assert.ok(!isCancelled(a) && isCancelled(b) && isCancelled(c))
})

test('ordersFromAmazon reads cards and skips cancelled orders and wallet top-ups', () => {
  const card = (status: string, items: { name: string; asin?: string }[]) => ({ text: 'ORDER PLACED\n12 October 2024\nTOTAL\n₹1,299.00\nSHIP TO\nA\nORDER # 404-1111111-2222222\nView order details', items, status })
  const [a, b, c] = ordersFromAmazon([card('', [{ name: 'Fake USB-C Cable 1m', asin: 'B0FAKE1234' }, { name: 'A Fake Book', asin: '0123456789' }]), card('Cancelled due to lack of payment', [{ name: 'X' }]), card('Added to Amazon Pay Wallet', [{ name: 'Gift Card' }])], utc)
  assert.equal(a.orderId, '404-1111111-2222222')
  assert.equal(a.total, 1299)
  assert.equal(a.at, '2024-10-12T12:00:00.000Z')
  assert.deepEqual(a.items, [{ name: 'Fake USB-C Cable 1m', qty: 1 }, { name: 'A Fake Book', qty: 1, kind: 'Book' }])
  assert.ok(!isCancelled(a) && isCancelled(b) && isCancelled(c))
})
