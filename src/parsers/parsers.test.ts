import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParserCtx } from '@/core/types'
import { parsers } from '.'
import { parseOrderEmail } from './order-email'
import { sleepHours } from './sleep'
import { splitPair } from './binance'
import { lineToRawEvent } from '@/connectors/icloud-inbox'

// Every fixture: { event, expected }. The event runs through the parser list like ingest does
// (first match wins); records are compared as JSON, so dates are ISO strings.
// Add a fixture whenever a real message fails to parse.

const dir = join(__dirname, 'fixtures')
const ctx = {
  user: { id: 'u', name: 'Me', timezone: 'Asia/Kolkata', baseCurrency: 'INR', profile: {}, createdAt: new Date(), updatedAt: new Date() },
  db: null as never, // fixture parsers must be pure; DB-backed parsers are tested below via helpers
} satisfies ParserCtx

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  test(`fixture ${file}`, async () => {
    const { event, expected } = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    const ev = { ...event, at: new Date(event.at) }
    const parser = parsers.find((p) => p.match(ev))
    const recs = parser ? await parser.parse(ev, ctx) : []
    assert.deepEqual(JSON.parse(JSON.stringify(recs)), expected)
  })
}

test('order email: total, order id and items', () => {
  const o = parseOrderEmail('Zomato <noreply@zomato.com>', 'Your Zomato order from Behrouz Biryani', [
    'Order ID: 7654321098',
    '1 x Chicken Dum Biryani ₹ 389',
    'Raita x 2 ₹60',
    'Item Total ₹449',
    'Taxes ₹22.45',
    'Grand Total ₹471.45',
  ].join('\n'))
  assert.deepEqual(o, {
    platform: 'zomato', total: 471.45, orderId: '7654321098',
    items: [{ qty: 1, name: 'Chicken Dum Biryani', price: 389 }, { qty: 2, name: 'Raita', price: 60 }],
  })
  assert.equal(parseOrderEmail('news@zomato.com', 'Weekend offers', 'Get 50% off'), null)
})

test('sleep pairs start and end within one night', () => {
  assert.equal(sleepHours(new Date('2026-11-04T18:10:00Z'), new Date('2026-11-05T01:40:00Z')), 7.5)
  assert.equal(sleepHours(new Date('2026-11-04T18:10:00Z'), new Date('2026-11-04T18:15:00Z')), null)
  assert.equal(sleepHours(new Date('2026-11-03T18:00:00Z'), new Date('2026-11-05T01:40:00Z')), null)
})

test('binance pair split', () => {
  assert.equal(splitPair('BTCUSDT'), 'BTC/USDT')
  assert.equal(splitPair('ETHFDUSD'), 'ETH/FDUSD')
  assert.equal(splitPair('SOL/BTC'), 'SOL/BTC')
})

test('inbox lines map to raw events', () => {
  const now = new Date('2026-11-05T10:00:00Z')
  const sms = lineToRawEvent('INR 250.00 debited A/c no. XX1234', now)!
  assert.equal(sms.source, 'sms')
  assert.deepEqual(sms.body, { text: 'INR 250.00 debited A/c no. XX1234' })
  const sleep = lineToRawEvent('{"type":"sleep","event":"start","at":"2026-11-04T23:40:00+05:30"}', now)!
  assert.deepEqual([sleep.source, sleep.externalId], ['sleep', 'start:2026-11-04T18:10:00.000Z'])
  const steps = lineToRawEvent('{"type":"steps","value":"8,423","date":"2026-11-05"}', now)!
  assert.equal(steps.source, 'shortcuts')
  assert.equal(lineToRawEvent('   ', now), null)
})
