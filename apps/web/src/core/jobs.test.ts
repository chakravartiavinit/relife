import { test } from 'node:test'
import assert from 'node:assert/strict'
import { due, nextRun, type Job } from './jobs'

const tz = 'Asia/Kolkata'
const every: Job = { id: 'sync:x', schedule: { everyMinutes: 60 }, backoff: true, run: async () => {} }
const daily: Job = { id: 'ai:daily', schedule: { cron: '0 8 * * *' }, catchUpMinutes: 120, run: async () => {} }
const at = (s: string) => new Date(s)

test('interval jobs run at once the first time, then every interval', () => {
  assert.deepEqual(due(every, undefined, at('2026-11-08T10:00:00Z'), tz), { run: true })
  assert.equal(due(every, { nextRunAt: at('2026-11-08T11:00:00Z'), requestedAt: null }, at('2026-11-08T10:30:00Z'), tz).run, false)
  assert.equal(due(every, { nextRunAt: at('2026-11-08T11:00:00Z'), requestedAt: null }, at('2026-11-08T11:00:01Z'), tz).run, true)
})

test('a request runs the job now, whatever the schedule says', () => {
  assert.equal(due(daily, { nextRunAt: at('2026-11-09T02:30:00Z'), requestedAt: at('2026-11-08T10:00:00Z') }, at('2026-11-08T10:00:05Z'), tz).run, true)
})

test('failures back off: interval × failures, at most 6 hours', () => {
  const from = at('2026-11-08T10:00:00Z')
  assert.equal(nextRun(every, from, tz, 0).toISOString(), '2026-11-08T11:00:00.000Z')
  assert.equal(nextRun(every, from, tz, 3).toISOString(), '2026-11-08T13:00:00.000Z')
  assert.equal(nextRun(every, from, tz, 20).toISOString(), '2026-11-08T16:00:00.000Z')
})

test('cron jobs follow the user’s time zone, catch up once if just missed, skip if long gone', () => {
  // 08:00 in Kolkata is 02:30 UTC.
  assert.equal(nextRun(daily, at('2026-11-08T00:00:00Z'), tz).toISOString(), '2026-11-08T02:30:00.000Z')
  const state = { nextRunAt: at('2026-11-08T02:30:00Z'), requestedAt: null }
  assert.equal(due(daily, state, at('2026-11-08T03:30:00Z'), tz).run, true) // an hour late: run once
  const late = due(daily, state, at('2026-11-08T09:00:00Z'), tz) // over two hours late: skip to tomorrow
  assert.equal(late.run, false)
  assert.equal(late.skipTo?.toISOString(), '2026-11-09T02:30:00.000Z')
  // Never seen: wait for the first 08:00 rather than running at start.
  assert.deepEqual(due(daily, undefined, at('2026-11-08T00:00:00Z'), tz), { run: false, skipTo: at('2026-11-08T02:30:00Z') })
})
