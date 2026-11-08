import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codechefRows, cpDays } from './competitive'

test('cpDays counts each problem once, on its first accepted day, and keeps the day’s last rating', () => {
  const t = (iso: string) => Date.parse(iso)
  const days = cpDays('codeforces', {
    submissions: [
      { at: t('2026-11-06T05:00:00Z'), problem: 'A', accepted: false },
      { at: t('2026-11-06T05:10:00Z'), problem: 'A', accepted: true },
      { at: t('2026-11-06T06:00:00Z'), problem: 'B', accepted: true },
      { at: t('2026-11-07T06:00:00Z'), problem: 'A', accepted: true }, // re-solve: not counted again
      { at: t('2026-10-01T06:00:00Z'), problem: 'Z', accepted: true }, // before the window
    ],
    ratings: [{ at: t('2026-11-06T17:00:00Z'), rating: 1500 }, { at: t('2026-11-06T19:00:00Z'), rating: 1532 }],
    current: 1532,
  }, 'Asia/Kolkata', '2026-11-01', '2026-11-07')
  const d6 = days.get('2026-11-06')!, d7 = days.get('2026-11-07')!
  assert.deepEqual([d6.solved, d6.submissions], [2, 3])
  assert.deepEqual([d7.solved, d7.submissions], [0, 1])
  // 17:00Z and 19:00Z are 22:30 on the 6th and 00:30 on the 7th in Kolkata: one contest each day.
  assert.equal(d6.rating, 1500)
  assert.equal(d7.rating, 1532)
})

test('codechefRows reads times (India time), problems and accepted marks', () => {
  const row = (when: string, code: string, ok: boolean) =>
    `<tr ><td  title='${when}'>x</td><td  title='${code}'><a href='/problems/${code}' title=''>${code}</a></td><td><span title='${ok ? 'accepted' : 'wrong answer'}'></span></td></tr>`
  const now = new Date('2026-11-07T12:00:00Z')
  const rows = codechefRows(row('01:52 PM 06/11/26', 'SUMS', true) + row('5 min ago', 'XOR', false), now)
  assert.equal(rows.length, 2)
  assert.equal(new Date(rows[0].at).toISOString(), '2026-11-06T08:22:00.000Z') // 13:52 IST
  assert.deepEqual([rows[0].problem, rows[0].accepted, rows[1].accepted], ['SUMS', true, false])
  assert.equal(rows[1].at, now.getTime() - 5 * 60_000)
})
