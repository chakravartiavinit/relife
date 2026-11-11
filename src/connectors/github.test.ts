import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calendarDays, github } from './github'

test('calendarDays keeps only the window’s own days, not the calendar’s padding', () => {
  const week = (dates: string[]) => ({ contributionDays: dates.map((date, i) => ({ date, contributionCount: i + 1 })) })
  const days = calendarDays([week(['2026-11-01', '2026-11-02', '2026-11-03']), week(['2026-11-04', '2026-11-05'])], '2026-11-02', '2026-11-04')
  assert.deepEqual(days.map((d) => d.date), ['2026-11-02', '2026-11-03', '2026-11-04'])
})

test('github.check explains a rejected token and an unknown username', async () => {
  const real = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch
    await assert.rejects(github.check!(() => 'bad'), /rejected the token/)
    globalThis.fetch = (async (url: string) => new Response('{}', { status: String(url).endsWith('/user') ? 200 : 404 })) as typeof fetch
    await assert.rejects(github.check!((k) => (k === 'GITHUB_USER' ? '@nobody' : 'tok')), /No GitHub user “nobody”/)
  } finally {
    globalThis.fetch = real
  }
})
