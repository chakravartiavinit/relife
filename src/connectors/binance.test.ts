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
