import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRRule, occurrencesBetween, parseSimple, nextOccurrence, describe } from './recurrence'
import { streaks } from './streaks'
import { fifo, indiaCryptoTax, financialYear } from './pnl'
import { localDate, localDayRange, wallToUtc, utcToWall } from '@/core/time'

const IST = 'Asia/Kolkata'

test('local dates and day ranges in IST', () => {
  // 20:00 UTC on Jan 1 is 01:30 Jan 2 in India
  assert.equal(localDate(new Date('2026-01-01T20:00:00Z'), IST), '2026-01-02')
  const [s, e] = localDayRange('2026-01-02', IST)
  assert.equal(s.toISOString(), '2026-01-01T18:30:00.000Z')
  assert.equal(e.toISOString(), '2026-01-02T18:30:00.000Z')
})

test('wall time round-trips across DST (New York)', () => {
  const wall = new Date('2026-03-08T08:00:00Z') // 08:00 local on DST switch day
  const real = wallToUtc(wall, 'America/New_York')
  assert.equal(real.toISOString(), '2026-03-08T12:00:00.000Z')
  assert.equal(utcToWall(real, 'America/New_York').toISOString(), wall.toISOString())
})

test('daily rule with two times expands to local instants', () => {
  const r = buildRRule({ freq: 'daily', times: ['08:00', '21:30'], start: '2026-01-01' })
  const [s, e] = localDayRange('2026-01-05', IST)
  const occ = occurrencesBetween(r, s, new Date(e.getTime() - 1), IST)
  assert.deepEqual(occ.map((d) => d.toISOString()), ['2026-01-05T02:30:00.000Z', '2026-01-05T16:00:00.000Z'])
  const back = parseSimple(r)
  assert.deepEqual(back.times, ['08:00', '21:30'])
  assert.equal(back.freq, 'daily')
  assert.match(describe(r), /Daily · 08:00, 21:30/)
})

test('weekly and monthly rules', () => {
  const w = buildRRule({ freq: 'weekly', times: ['10:00'], byweekday: ['SU'], start: '2026-01-01' })
  const next = nextOccurrence(w, new Date('2026-01-01T00:00:00Z'), IST)!
  assert.equal(localDate(next, IST), '2026-01-04') // first Sunday
  const m = buildRRule({ freq: 'monthly', times: ['09:00'], bymonthday: 15, start: '2026-01-01' })
  assert.equal(localDate(nextOccurrence(m, new Date('2026-01-20T00:00:00Z'), IST)!, IST), '2026-02-15')
  assert.equal(parseSimple(w).byweekday?.[0], 'SU')
})

test('streaks count back from yesterday when today is pending', () => {
  const s = streaks(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05', '2026-01-06'], '2026-01-07')
  assert.deepEqual(s, { current: 2, best: 3 })
  assert.equal(streaks(['2026-01-07'], '2026-01-07').current, 1)
})

test('FIFO realizes oldest lots first and folds fees into basis', () => {
  const d = (s: string) => new Date(s)
  const r = fifo([
    { at: d('2026-01-01'), asset: 'BTC', side: 'buy', qty: 1, unitPrice: 100, fee: 1 },
    { at: d('2026-01-02'), asset: 'BTC', side: 'buy', qty: 1, unitPrice: 200, fee: 0 },
    { at: d('2026-01-03'), asset: 'BTC', side: 'sell', qty: 1.5, unitPrice: 300, fee: 0 },
  ])
  assert.equal(r.realized.length, 1)
  assert.equal(r.realized[0].cost, 101 + 100) // 1 @101 + 0.5 @200
  assert.equal(r.realized[0].gain, 450 - 201)
  assert.equal(r.open.BTC[0].qty, 0.5)
  const tax = indiaCryptoTax([...r.realized, { at: d('2026-01-04'), asset: 'ETH', qty: 1, proceeds: 50, cost: 80, gain: -30 }])
  assert.equal(Math.round(tax.taxableGains), 249) // loss is not set off
  assert.equal(financialYear(d('2026-02-01')), 'FY 2025-26')
})

test('interpolateGaps bridges interior gaps and holds the edges', async () => {
  const { interpolateGaps } = await import('./series')
  assert.deepEqual(interpolateGaps([null, 2, null, 4, null]), [null, 2, 3, 4, null])
  assert.deepEqual(interpolateGaps([null, null]), [null, null])
})
