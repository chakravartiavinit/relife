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

test('codechefRows: a "N days ago" row lands on the same time however late in the day it is read', () => {
  const row = '<tr ><td  title=\'2 days ago\'>x</td><td  title=\'A\'><a href=\'/problems/A\'>A</a></td><td><span title=\'accepted\'></span></td></tr>'
  const at = (iso: string) => codechefRows(row, new Date(iso))[0].at
  assert.equal(at('2026-11-07T01:00:00Z'), at('2026-11-07T17:00:00Z')) // both on the 7th in India
  assert.equal(new Date(at('2026-11-07T01:00:00Z')).toISOString(), '2026-11-05T06:30:00.000Z') // noon on the 5th, India
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('codeforces.check names an unknown handle, accepts a pasted profile link, and lets rate limits through as transient', async () => {
  const { codeforces } = await import('./competitive')
  const real = globalThis.fetch
  const seen: string[] = []
  try {
    globalThis.fetch = (async (url: string) => {
      seen.push(String(url))
      return String(url).includes('handles=nobody')
        ? json({ status: 'FAILED', comment: 'handles: User with handle nobody not found' }, 400)
        : json({ status: 'OK', result: [{ rating: 1500 }] })
    }) as typeof fetch
    await assert.rejects(codeforces.check!((k) => (k === 'CODEFORCES_HANDLE' ? 'nobody' : undefined)), /No Codeforces user “nobody”\. Check the handle\./)
    await codeforces.check!((k) => (k === 'CODEFORCES_HANDLE' ? 'https://codeforces.com/profile/tourist' : undefined))
    assert.match(seen.at(-1)!, /handles=tourist$/)
  } finally {
    globalThis.fetch = real
  }
})

test('leetcode.check reads LeetCode’s "does not exist" answer', async () => {
  const { leetcode } = await import('./competitive')
  const real = globalThis.fetch
  try {
    globalThis.fetch = (async () => json({ errors: [{ message: 'That user does not exist.' }], data: { matchedUser: null } })) as typeof fetch
    await assert.rejects(leetcode.check!(() => '@nobody'), /No LeetCode user “nobody”\. Check the username\./)
  } finally {
    globalThis.fetch = real
  }
})
