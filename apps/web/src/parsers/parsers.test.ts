import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParserCtx } from '@/core/types'
import { parsers } from '.'
import { sleepHours } from './sleep'
import { splitPair } from './binance'
import { consumable, lineToRawEvent } from '@/connectors/icloud-inbox'

// Every fixture: { event, expected }. The event runs through the parser list like ingest does
// (first match wins); records are compared as JSON, so dates are ISO strings.
// Add a fixture whenever a real message fails to parse.

const dir = join(__dirname, 'fixtures')
const ctx = {
  user: { id: 'u', name: 'Me', timezone: 'Asia/Kolkata', baseCurrency: 'INR', email: null, profile: {}, createdAt: new Date(), updatedAt: new Date() },
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
  // Bank texts aren't read: spending comes from the order apps.
  assert.equal(lineToRawEvent('INR 250.00 debited A/c no. XX1234', now), null)
  assert.equal(lineToRawEvent('{"type":"sms","text":"INR 250.00 debited","at":"2026-11-08T20:57:33+05:30"}', now), null)
  const sleep = lineToRawEvent('{"type":"sleep","event":"start","at":"2026-11-04T23:40:00+05:30"}', now)!
  assert.deepEqual([sleep.source, sleep.externalId], ['sleep', 'start:2026-11-04T18:10:00.000Z'])
  const steps = lineToRawEvent('{"type":"steps","value":"8,423","date":"2026-11-05"}', now)!
  assert.equal(steps.source, 'shortcuts')
  assert.equal(lineToRawEvent('   ', now), null)
  // iOS appends "\n{entry}", so the newest entry has no line break after it: still read once it's whole JSON.
  const b = (t: string) => Buffer.from(t)
  assert.equal(consumable(b('{"a":1}\n{"b":2}')), 15)
  assert.equal(consumable(b('{"a":1}\n{"b":')), 8) // half-synced last line waits
  assert.equal(consumable(b('\n{"b":2}')), 8)
  assert.equal(consumable(b('{"b":')), 0)
})

test('tradesFromStatement rebuilds trades from Binance statement lines', async () => {
  const { tradesFromStatement } = await import('./binance')
  const line = (t: string, op: string, coin: string, change: string, account = 'Spot') => ({ User_ID: '1', UTC_Time: t, Account: account, Operation: op, Coin: coin, Change: change, Remark: '' })
  const { trades, skipped } = tradesFromStatement([
    line('2024-10-01 10:00:00', 'Transaction Buy', 'SOL', '2'),
    line('2024-10-01 10:00:00', 'Transaction Spend', 'USDT', '-300'),
    line('2024-10-01 10:00:00', 'Transaction Fee', 'SOL', '-0.002'),
    line('2024-10-02 09:00:00', 'Transaction Sold', 'SOL', '-1'),
    line('2024-10-02 09:00:00', 'Transaction Revenue', 'USDT', '160'),
    line('2024-10-03 09:00:00', 'Deposit', 'SOL', '5'), // not a trade
    line('2024-10-04 09:00:00', 'Transaction Buy', 'SOL', '1', 'Funding'), // not spot
  ])
  assert.equal(skipped, 0)
  assert.deepEqual(trades.map(({ base, quote, side, qty, price, fee, feeAsset }) => ({ base, quote, side, qty, price, fee, feeAsset })), [
    { base: 'SOL', quote: 'USDT', side: 'buy', qty: 2, price: 150, fee: 0.002, feeAsset: 'SOL' },
    { base: 'SOL', quote: 'USDT', side: 'sell', qty: 1, price: 160, fee: 0, feeAsset: undefined },
  ])
})

test('app-order deletes the spend of a cancelled order only, and a cancelled order stays cancelled', async () => {
  const { appOrder } = await import('./app-order')
  const order = { platform: 'zepto', name: 'Zepto', orderId: 'Z1', at: '2026-11-11T06:00:00.000Z', total: 500, currency: 'INR', items: [{ name: 'Milk', qty: 1 }] }
  const ev = (o: object) => ({ source: 'zepto', externalId: 'zepto:Z1', at: new Date(order.at), body: o })
  let deleted = 0
  let cancelledSeen: object[] = []
  const select = () => ({ from: () => ({ where: () => ({ limit: async () => cancelledSeen }) }) })
  const db = { delete: () => ({ where: async () => { deleted++ } }), select } as never
  const live = await appOrder.parse(ev(order), { ...ctx, db })
  assert.deepEqual(live.map((r) => r.kind === 'transaction' && [r.amount, r.externalRef]), [[-500, 'zepto:Z1']])
  assert.deepEqual(await appOrder.parse(ev({ ...order, status: 'Cancelled' }), { ...ctx, db }), [])
  assert.equal(deleted, 1)
  assert.deepEqual(await appOrder.parse(ev({ ...order, status: 'Refunded' }), { ...ctx, db }), [], 'a refund records nothing')
  assert.deepEqual(await appOrder.parse(ev({ ...order, status: 'Returned' }), { ...ctx, db }), [])
  assert.equal(deleted, 1, 'a refund or return never deletes the spend')
  cancelledSeen = [{ id: 'x' }]
  assert.deepEqual(await appOrder.parse(ev(order), { ...ctx, db }), [], 'read again after its cancel: stays cancelled')
  assert.equal(appOrder.enriches, true) // an empty result is still "parsed"
})
