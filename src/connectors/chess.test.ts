import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chesscomDays } from './chess'

const game = (end: string, me: 'white' | 'black', result: string, opts: { cls?: string; rating?: number; start?: string } = {}) => {
  const mine = { username: 'Me', rating: opts.rating ?? 1200, result }
  const them = { username: 'Opp', rating: 1300, result: result === 'win' ? 'resigned' : 'win' }
  const s = new Date(opts.start ?? new Date(Date.parse(end) - 10 * 60_000).toISOString())
  const pgn = `[UTCDate "${s.toISOString().slice(0, 10).replace(/-/g, '.')}"]\n[UTCTime "${s.toISOString().slice(11, 19)}"]`
  return { end_time: Date.parse(end) / 1000, time_class: opts.cls ?? 'blitz', rated: true, rules: 'chess', pgn, white: me === 'white' ? mine : them, black: me === 'black' ? mine : them }
}

test('chesscomDays counts results, minutes and the main-control rating per local day', () => {
  const days = chesscomDays([
    game('2026-11-06T10:00:00Z', 'white', 'win', { rating: 1210 }),
    game('2026-11-06T11:00:00Z', 'black', 'agreed', { rating: 1212 }),
    game('2026-11-06T12:00:00Z', 'white', 'checkmated', { rating: 1204 }),
    game('2026-11-06T13:00:00Z', 'white', 'win', { cls: 'daily', rating: 1500, start: '2026-11-01T00:00:00Z' }),
    game('2026-11-05T23:00:00Z', 'white', 'win'), // 04:30 on the 6th in Kolkata
    game('2026-10-01T10:00:00Z', 'white', 'win'), // before `from`
  ], 'me', 'Asia/Kolkata', '2026-11-01')
  const d = days.get('2026-11-06')!
  assert.deepEqual([d.games, d.wins, d.draws, d.losses], [5, 3, 1, 1])
  assert.equal(d.minutes, 40) // four timed games of 10 minutes; the daily game doesn't count
  assert.equal(d.rating, 1204) // last rated blitz game of the day, not the daily one
  assert.equal(days.size, 1)
})
