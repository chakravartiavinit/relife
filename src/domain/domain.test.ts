import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRRule, occurrencesBetween, parseSimple, nextOccurrence, describe } from './recurrence'
import { streaks } from './streaks'
import { allTimePnl, fifo } from './pnl'
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
})

test('interpolateGaps bridges interior gaps and holds the edges', async () => {
  const { interpolateGaps } = await import('./series')
  assert.deepEqual(interpolateGaps([null, 2, null, 4, null]), [null, 2, 3, 4, null])
  assert.deepEqual(interpolateGaps([null, null]), [null, null])
})

test('allTimePnl is value now plus money out minus money in', () => {
  const r = allTimePnl(1200, [{ kind: 'in', usd: 1000 }, { kind: 'in', usd: 500 }, { kind: 'out', usd: 400 }, { kind: 'in', usd: null }])
  assert.equal(r.pnl, 1200 + 400 - 1500)
  assert.equal(r.netIn, 1100)
  assert.equal(r.unvalued, 1)
  assert.equal(Math.round(r.pct! * 1000), Math.round((100 / 1100) * 1000))
})

test('fifo: deposits add lots at that day’s price, withdrawals remove without a gain, unknown sells break even', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`)
  const r = fifo([
    { at: d('2026-01-01'), asset: 'SOL', side: 'in', qty: 2, unitPrice: 100, fee: 0 },
    { at: d('2026-01-02'), asset: 'SOL', side: 'out', qty: 1, unitPrice: 120, fee: 0 },
    { at: d('2026-01-03'), asset: 'SOL', side: 'sell', qty: 3, unitPrice: 150, fee: 0 },
    { at: d('2026-01-04'), asset: 'SOL', side: 'sell', qty: 1, unitPrice: 150, fee: 0 },
  ])
  assert.equal(r.realized.length, 2) // the withdrawal isn't a sale
  assert.equal(r.totals.movedGain, 20) // 1 SOL bought at 100 left when worth 120
  assert.equal(r.realized[0].gain, 50) // 1 SOL from the deposit at 100 sold at 150; the other 2 have no known cost
  assert.equal(r.realized[1].gain, 0)
  assert.deepEqual(r.unmatched, [{ asset: 'SOL', qty: 3, soldQty: 3, soldValue: 450 }]) // one entry per coin, not per sell
})

test('habitSignals: impulse categories and repeat items, only frequent ones offered', async () => {
  const { habitSignals } = await import('./basket')
  const line = (date: string, name: string, category: 'Drinks' | 'Snacks & sweets' | 'Dairy & eggs', spend: number) =>
    ({ date, month: date.slice(0, 7), hour: 20, platform: 'zepto', name, qty: 1, spend, category })
  const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']
  const lines = [
    ...days.map((d) => line(d, 'Diet Coke Can | Cola Sparkling Soft Drink', 'Drinks', 40)),
    line('2026-11-02', 'Diet Coke Diets & Lights', 'Drinks', 45), // same habit, different listing
    line('2026-11-03', 'Lays Classic Salted', 'Snacks & sweets', 20),
    line('2026-11-03', 'Amul Milk', 'Dairy & eggs', 30), // not an impulse buy
  ]
  const s = habitSignals(lines, '2026-11-07', 'INR')
  const coke = s.find((x) => x.id === 'habit:item:diet coke')!
  assert.equal(coke.name, 'Diet Coke spending')
  assert.equal(coke.offer, true)
  assert.equal(coke.days.get('2026-11-02'), 85)
  assert.equal(coke.days.get('2026-11-07'), 0) // zero-filled to today
  assert.equal(s.find((x) => x.id === 'habit:item:lays classic')!.offer, false) // bought once
  assert.ok(!s.some((x) => x.id.includes('Dairy')))
})

test('balanceHabits: at most one habit quest a day, not the one cleared yesterday', async () => {
  const { balanceHabits } = await import('./system')
  const rows = [{ statId: 'habit:item:diet coke' }, { statId: 'tracker:steps' }, { statId: 'habit:cat:Snacks & sweets' }]
  assert.deepEqual(balanceHabits(rows, [], '2026-11-08').map((r) => r.statId), ['habit:item:diet coke', 'tracker:steps'])
  const yesterday = [{ statId: 'habit:item:diet coke', toDate: '2026-11-07', status: 'cleared' }]
  assert.deepEqual(balanceHabits(rows, yesterday, '2026-11-08').map((r) => r.statId), ['tracker:steps', 'habit:cat:Snacks & sweets'])
})

test('watch: change table has every moved number, no rules, deposits never count as gains', async () => {
  const { portfolioRows, signalRows, badness } = await import('./watch')
  const rows = portfolioRows(
    [{ asset: 'INJ', qty: 100, priceNow: 8, price24h: 10 }, { asset: 'FET', qty: 1000, priceNow: 0.2, price24h: 0.2 }],
    [{ symbol: 'XAUUSDT', side: 'short', unrealized: -45, margin: 70, leverage: 100, mark: 4000, liquidation: 4128 }],
    1, 'USD', 0.42,
  )
  const by = (t: string) => rows.find((r) => r.topic === t)
  assert.equal(by('portfolio')!.dayPct, -0.17) // 1000 → 800+200 on the same coins
  assert.equal(by('coin:INJ')!.dayPct, -0.2)
  assert.equal(by('coin:FET'), undefined) // flat: below the noise floor
  // Risk is the distance to liquidation (a short is liquidated if the price rises 3.2%), not −64% of its margin.
  assert.equal(by('futures:XAUUSDT')!.toLiquidation, 0.032)
  assert.equal(by('futures:XAUUSDT')!.dayPct, null)
  assert.equal(by('futures:margin')!.today, 42)
  assert.ok(badness(by('coin:INJ')!) > 0)

  // A signal: usual 100 a day, yesterday 180, last week 150 → in the table; a flat one isn't.
  const days = (f: (i: number) => number) => new Map(Array.from({ length: 40 }, (_, i) => [new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), f(i)]))
  const today = '2026-11-09'
  const spend = { id: 'spend', name: 'Spending', area: 'wealth', group: 'spend', direction: 'down' as const, days: days((i) => (i >= 32 ? (i === 38 ? 180 : 150) : 100)) }
  const flat = { id: 'steps', name: 'Steps', area: 'health', group: 'steps', direction: 'up' as const, days: days(() => 8000) }
  const sig = signalRows([spend, flat], today)
  assert.deepEqual(sig.map((r) => r.topic), ['spend'])
  assert.equal(sig[0].weekPct, 0.54) // (6×150 + 180) / 7 against 100
})

test('wealth: month pace, usual month and repeat buys', async () => {
  const { monthPace, usualMonth, repeatBuys } = await import('./wealth')
  // ₹3,000 by day 10 of 30 is a ₹9,000 month; a usual ₹6,000 month would be at ₹2,000 by now.
  assert.deepEqual(monthPace(3000, 10, 30, 6000), { projected: 9000, expected: 2000, vsUsual: 0.5 })
  assert.equal(monthPace(0, 1, 30, null).vsUsual, null)
  // A ₹2,000 one-off counts once: ₹1,000 of everyday spending in 10 days is ₹3,000 a month, plus the ₹2,000.
  assert.equal(monthPace(3000, 10, 30, 6000, 2000).projected, 5000)
  const { oneOffs } = await import('./wealth')
  assert.equal(oneOffs([300, 2000, 1400], 6000), 2000) // a quarter of a ₹6,000 month is ₹1,500
  assert.equal(oneOffs([300, 6000], null), 6000)
  const months = new Map([['2026-10', 4000], ['2026-09', 6000], ['2026-08', 0], ['2026-11', 999]])
  assert.equal(usualMonth(months, '2026-11'), 5000) // empty months and the current month don't count
  assert.equal(usualMonth(new Map([['2026-10', 4000]]), '2026-11'), null)
  const line = (date: string, name: string, spend: number) => ({ date, name, qty: 1, spend })
  const top = repeatBuys([line('2026-11-01', 'Diet Coke Can (300 ml)', 40), line('2026-11-02', 'diet coke can', 40), line('2026-11-02', 'Diet Coke', 40), line('2026-11-05', 'Diet Coke', 40), line('2026-11-01', 'Bread', 30)])
  assert.deepEqual(top, [{ name: 'Diet Coke', days: 3, qty: 4, spend: 160 }])
})
