import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { parseIncomeCsv, unzipFirst } from './binance'

const CSV = '﻿"Date(UTC)","type","Amount","Asset","Symbol","Transaction ID"\n"2026-04-01 12:00:00","REALIZED_PNL","-12.5","USDT","BTCUSDT","111"\n"2026-04-01 12:00:00","TRANSFER","100","USDT",,"222"\n'

test('parseIncomeCsv reads Binance futures income rows, empty symbol included', () => {
  const rows = parseIncomeCsv(CSV)
  assert.deepEqual(rows, [
    { time: Date.parse('2026-04-01T12:00:00Z'), incomeType: 'REALIZED_PNL', income: -12.5, asset: 'USDT', symbol: 'BTCUSDT', tranId: '111' },
    { time: Date.parse('2026-04-01T12:00:00Z'), incomeType: 'TRANSFER', income: 100, asset: 'USDT', symbol: null, tranId: '222' },
  ])
})

test('unzipFirst reads a one-file deflated zip', () => {
  const name = Buffer.from('a.csv')
  const data = deflateRawSync(Buffer.from(CSV))
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26)
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42)
  const cdOffset = local.length + name.length + data.length
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt32LE(cd.length + name.length, 12); eocd.writeUInt32LE(cdOffset, 16)
  const zip = Buffer.concat([local, name, data, cd, name, eocd])
  assert.equal(unzipFirst(zip).toString('utf8'), CSV)
})

import ccxt from 'ccxt'
import { binance, futuresProblem, keyProblem, readOnlyProblem, window as historyWindow, windowRows } from './binance'

/** Answers every Binance request with `reply` (a body, or an Error to throw); no network. */
function fakeBinance(reply: (url: string) => unknown) {
  const proto = ccxt.binance.prototype as unknown as { fetch: (url: string) => Promise<unknown> }
  const real = proto.fetch
  const urls: string[] = []
  proto.fetch = async (url: string) => { urls.push(url); const r = reply(url); if (r instanceof Error) throw r; return r }
  return { urls, restore: () => { proto.fetch = real } }
}

test('keyProblem turns Binance codes into advice', () => {
  assert.match(keyProblem(new Error('binance {"code":-2015,"msg":"Invalid API-key, IP, or permissions for action."}'))!, /trusted IP/)
  assert.match(keyProblem(new Error('binance {"code":-2014,"msg":"API-key format invalid."}'))!, /paste both again/i)
  assert.match(keyProblem(new Error('binance {"code":-1021,"msg":"Timestamp outside recvWindow"}'))!, /clock/)
  assert.equal(keyProblem(new Error('binance {"code":-1121,"msg":"Invalid symbol."}')), null)
  assert.equal(keyProblem(new Error('socket hang up')), null)
})

test('readOnlyProblem names every permission that can move money', () => {
  assert.equal(readOnlyProblem({ enableReading: true, enableWithdrawals: false }), null)
  assert.match(readOnlyProblem({ enableReading: true, enableWithdrawals: true, enableFutures: true })!, /enableWithdrawals, enableFutures/)
})

test('check reports a rejected key and passes a read-only one', async () => {
  const bad = fakeBinance((url) => url.includes('/time') ? { serverTime: Date.now() } : new ccxt.AuthenticationError('binance {"code":-2015,"msg":"Invalid API-key, IP, or permissions for action."}'))
  try { await assert.rejects(binance.check!((k) => (k === 'BINANCE_API_KEY' ? 'k' : 's')), /Enable Reading/) } finally { bad.restore() }
  const ok = fakeBinance((url) => url.includes('/time') ? { serverTime: Date.now() } : { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false })
  try { await binance.check!(() => 'x') } finally { ok.restore() }
  const trading = fakeBinance((url) => url.includes('/time') ? { serverTime: Date.now() } : { enableReading: true, enableWithdrawals: true })
  try { await assert.rejects(binance.check!(() => 'x'), /not read-only/) } finally { trading.restore() }
})

test('check lets a transient failure pass for the first sync to report', async () => {
  const down = fakeBinance(() => new ccxt.RequestTimeout('binance GET timed out'))
  try { await binance.check!(() => 'x') } finally { down.restore() }
})

test('windowRows splits a full window so nothing past the row limit is lost', async () => {
  const all = Array.from({ length: 25 }, (_, i) => ({ t: i * 10 })) // at most 10 rows per call
  const read = async (a: number, b: number) => all.filter((r) => r.t >= a && r.t <= b).slice(0, 10)
  const rows = await windowRows(0, 249, 10, read)
  assert.equal(new Set(rows.map((r) => r.t)).size, 25)
})

test('futuresProblem advises a new read-only key, never Enable Futures', () => {
  const advice = futuresProblem(new Error('binance {"code":-2015,"msg":"Invalid API-key, IP, or permissions for action."}'))!
  assert.match(advice, /new key with only “Enable Reading”/)
  assert.match(advice, /don’t tick “Enable Futures”/)
  assert.equal(futuresProblem(new Error('socket hang up')), null)
})

test('readOnlyProblem still refuses a key with futures trading', () => {
  assert.match(readOnlyProblem({ enableReading: true, enableFutures: true })!, /enableFutures/)
})

test('window skips a refusal only for history older than the endpoint keeps; everything else is thrown', async () => {
  const refused = () => Promise.reject(new ccxt.BadRequest('binance {"code":-1000,"msg":"Time range too old."}'))
  assert.equal(await historyWindow(refused, true), null)
  await assert.rejects(historyWindow(refused, false), /too old/) // a recent window must not be skipped
  await assert.rejects(historyWindow(() => Promise.reject(new Error('boom')), true), /boom/) // unknown: keep the cursor
  await assert.rejects(historyWindow(() => Promise.reject(new ccxt.RateLimitExceeded('slow down')), true), /slow down/)
  await assert.rejects(historyWindow(() => Promise.reject(new ccxt.PermissionDenied('no')), true), /no/)
  assert.equal(await historyWindow(() => Promise.resolve(7), false), 7)
})
