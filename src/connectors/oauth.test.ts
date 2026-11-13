import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { setKeys } from '@/core/env'
import { authorizeUrl, checkClient, isBadClient, readTokens } from '@/core/oauth'
import { apiError } from './oauth'
import { hevy, hevyDays } from './hevy'
import type { ConnectorCtx } from '@/core/types'
import { ouraDays } from './oura'
import { whoopDays } from './whoop'
import { withingsDays } from './withings'
import { calendarDays } from './google-calendar'
import { strava } from './strava'
import { withings } from './withings'

const TZ = 'Asia/Kolkata'

test('readTokens reads standard replies and Withings replies wrapped in body', () => {
  const now = 1_000_000
  assert.deepEqual(readTokens({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, undefined, now), { access: 'a', refresh: 'r', expiresAt: now + 3_600_000 })
  // Strava sends expires_at in seconds.
  assert.equal(readTokens({ access_token: 'a', expires_at: 2000 }).expiresAt, 2_000_000)
  // No new refresh token (Google on refresh): keep the old one.
  assert.equal(readTokens({ access_token: 'a', expires_in: 60 }, 'old', now).refresh, 'old')
  assert.deepEqual(readTokens({ status: 0, body: { access_token: 'w', refresh_token: 'wr', expires_in: 10800 } }, undefined, now), { access: 'w', refresh: 'wr', expiresAt: now + 10_800_000 })
  assert.throws(() => readTokens({ status: 503, error: 'Invalid params' }), /refused the sign-in \(status 503: Invalid params\)/)
  assert.throws(() => readTokens({ error: 'invalid_grant', error_description: 'Bad code' }), /No access token in the reply: Bad code/)
})

test('authorizeUrl joins scopes with the service separator and adds extra parameters', () => {
  setKeys(new Map([['STRAVA_CLIENT_ID', ' 123 '], ['WITHINGS_CLIENT_ID', 'w1']]))
  try {
    const s = new URL(authorizeUrl(strava.oauth!, 'http://127.0.0.1:3030/api/oauth/strava/callback', 'st8'))
    assert.equal(s.searchParams.get('client_id'), '123')
    assert.equal(s.searchParams.get('scope'), 'read,activity:read_all')
    assert.equal(s.searchParams.get('state'), 'st8')
    assert.equal(s.searchParams.get('approval_prompt'), 'auto')
    assert.equal(s.searchParams.get('response_type'), 'code')
    const w = new URL(authorizeUrl(withings.oauth!, 'http://x/cb', 's'))
    assert.equal(w.searchParams.get('scope'), 'user.metrics,user.activity')
  } finally {
    setKeys(new Map())
  }
})

test('ouraDays keeps the main sleep only and joins the four collections by day', () => {
  const days = ouraDays({
    sleep: [
      { day: '2026-11-06', type: 'long_sleep', total_sleep_duration: 26_640, average_hrv: 47.6, lowest_heart_rate: 54 },
      { day: '2026-11-06', type: 'late_nap', total_sleep_duration: 1800, average_hrv: 90, lowest_heart_rate: 40 },
    ],
    dailySleep: [{ day: '2026-11-06', score: 82 }, { day: '2026-11-07', score: null }],
    readiness: [{ day: '2026-11-06', score: 79 }],
    activity: [{ day: '2026-11-05', steps: 10_200 }, { day: '2026-11-06', steps: 9120 }],
  })
  assert.deepEqual(days, [
    { date: '2026-11-05', steps: 10_200 },
    { date: '2026-11-06', sleepHours: 7.4, hrv: 48, restingHr: 54, sleepScore: 82, readiness: 79, steps: 9120 },
  ])
})

test('whoopDays counts scored nights, skips naps and puts recovery on the night it belongs to', () => {
  const days = whoopDays({
    sleep: [
      { id: 's1', end: '2026-11-06T01:30:00Z', nap: false, score_state: 'SCORED', score: { stage_summary: { total_in_bed_time_milli: 27_000_000, total_awake_time_milli: 2_160_000 }, sleep_performance_percentage: 88.4 } },
      { id: 's2', end: '2026-11-06T09:00:00Z', nap: true, score_state: 'SCORED', score: { stage_summary: { total_in_bed_time_milli: 3_600_000 } } },
      { id: 's3', end: '2026-11-07T01:30:00Z', nap: false, score_state: 'PENDING_SCORE' },
    ],
    // Created a day later, but belongs to night s1.
    recovery: [{ sleep_id: 's1', created_at: '2026-11-07T03:00:00Z', score_state: 'SCORED', score: { recovery_score: 66, resting_heart_rate: 52, hrv_rmssd_milli: 71.3 } }],
    cycles: [{ start: '2026-11-05T19:00:00Z', score_state: 'SCORED', score: { strain: 12.44 } }],
  }, TZ)
  assert.deepEqual(days, [{ date: '2026-11-06', sleepHours: 6.9, sleepScore: 88, recovery: 66, hrv: 71, restingHr: 52, strain: 12.4 }])
})

test('withingsDays reads real weigh-ins with their unit, latest of the day wins', () => {
  const days = withingsDays({
    measures: [
      { date: Date.parse('2026-11-06T02:00:00Z') / 1000, category: 1, measures: [{ value: 72_900, type: 1, unit: -3 }] },
      { date: Date.parse('2026-11-06T14:00:00Z') / 1000, category: 1, measures: [{ value: 7240, type: 1, unit: -2 }, { value: 181, type: 6, unit: -1 }] },
      // An objective (category 2), not a reading.
      { date: Date.parse('2026-11-06T15:00:00Z') / 1000, category: 2, measures: [{ value: 70, type: 1, unit: 0 }] },
    ],
    sleep: [{ date: '2026-11-06', data: { total_sleep_time: 25_560, sleep_score: 76 } }],
    activity: [{ date: '2026-11-06', steps: 6400 }],
  }, TZ)
  assert.deepEqual(days, [{ date: '2026-11-06', weight: 72.4, fat: 18.1, sleepHours: 7.1, sleepScore: 76, steps: 6400 }])
})

test('calendarDays counts meetings with others, focus time, and skips all-day, declined and solo events', () => {
  const ev = (start: string, end: string, extra: object = {}) => ({ start: { dateTime: start }, end: { dateTime: end }, ...extra })
  const two = [{ self: true, responseStatus: 'accepted' }, { responseStatus: 'accepted' }]
  const days = calendarDays([
    ev('2026-11-06T10:00:00+05:30', '2026-11-06T11:00:00+05:30', { attendees: two }),
    ev('2026-11-06T12:00:00+05:30', '2026-11-06T12:30:00+05:30', { attendees: [...two, { resource: true }] }),
    ev('2026-11-06T13:00:00+05:30', '2026-11-06T14:00:00+05:30', { attendees: [{ self: true, responseStatus: 'declined' }, {}] }),
    ev('2026-11-06T15:00:00+05:30', '2026-11-06T16:30:00+05:30', { eventType: 'focusTime' }),
    ev('2026-11-06T17:00:00+05:30', '2026-11-06T18:00:00+05:30'), // just me
    ev('2026-11-06T18:00:00+05:30', '2026-11-06T19:00:00+05:30', { attendees: two, status: 'cancelled' }),
    ev('2026-11-06T19:00:00+05:30', '2026-11-06T20:00:00+05:30', { attendees: two, eventType: 'outOfOffice' }),
    { start: { date: '2026-11-06' }, end: { date: '2026-11-07' }, attendees: two },
  ], TZ)
  assert.deepEqual(days, [{ date: '2026-11-06', meetings: 2, meetingMinutes: 90, focusMinutes: 90 }])
})

/** fetch answering from a list of canned replies; returns the calls it saw. */
function fakeFetch(...replies: { status: number; body: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const r = replies.shift() ?? { status: 500, body: {} }
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status })
  })
  return calls
}

test('isBadClient: invalid_client and Strava Application errors are a wrong ID or secret, a bad code is not', () => {
  assert.equal(isBadClient(401, { error: 'invalid_client', error_description: 'The OAuth client was not found.' }), true) // Google, WHOOP
  assert.equal(isBadClient(400, { status: 400, error: 'invalid_client', error_description: 'Invalid client_id.' }), true) // Oura
  assert.equal(isBadClient(401, { message: 'Authorization Error', errors: [{ resource: 'Application', field: '', code: 'invalid' }] }), true) // Strava
  assert.equal(isBadClient(400, { error: 'invalid_grant', error_description: 'Bad Request' }), false)
  assert.equal(isBadClient(400, { message: 'Bad Request', errors: [{ resource: 'AuthorizationCode', field: 'code', code: 'invalid' }] }), false)
  assert.equal(isBadClient(500, { error: 'invalid_client' }), false)
  assert.equal(isBadClient(200, null), false)
})

test('checkClient sends the app with a made-up code and only a wrong client is an error', async () => {
  const keys = (id: string | undefined, secret = 's') => (k: string) => (k === 'WHOOP_CLIENT_ID' ? id : k === 'WHOOP_CLIENT_SECRET' ? secret : undefined)
  const whoop = (await import('./whoop')).whoop
  try {
    let calls = fakeFetch({ status: 401, body: { error: 'invalid_client' } })
    await assert.rejects(checkClient('WHOOP', whoop.oauth!, keys(' id1 ')), /WHOOP doesn’t recognise this client ID and secret.*developer-dashboard\.whoop\.com/)
    const sent = new URLSearchParams(String(calls[0].init?.body))
    assert.equal(calls[0].url, 'https://api.prod.whoop.com/oauth/oauth2/token')
    assert.deepEqual([sent.get('client_id'), sent.get('grant_type'), sent.get('code'), sent.get('scope')], ['id1', 'authorization_code', 'relife-check', 'offline'])
    mock.restoreAll()
    // Right client, made-up code: fine. Server trouble and odd replies: fine too (left for sign-in).
    fakeFetch({ status: 400, body: { error: 'invalid_grant' } }); await checkClient('WHOOP', whoop.oauth!, keys('id'))
    mock.restoreAll(); fakeFetch({ status: 503, body: 'oops' }); await checkClient('WHOOP', whoop.oauth!, keys('id'))
    // Nothing typed yet: no request.
    mock.restoreAll(); calls = fakeFetch(); await checkClient('WHOOP', whoop.oauth!, keys(undefined)); assert.equal(calls.length, 0)
  } finally {
    mock.restoreAll()
  }
})

test('apiError turns a rejected token into advice for the service and passes other errors on', () => {
  assert.throws(() => apiError('Oura', ' Needs a membership.')(new Error('The key was rejected. Check it')), /^Error: Oura rejected the sign-in\. Needs a membership\. Sign in again in You › Connections\.$/)
  assert.throws(() => apiError('Oura')(new Error('HTTP 500')), /^Error: HTTP 500$/)
})

test('hevy check reads user/info with the key; a wrong key is advice, a server error is left to isTransient', async () => {
  try {
    const calls = fakeFetch({ status: 200, body: { data: { name: 'x' } } })
    await hevy.check!((k) => (k === 'HEVY_API_KEY' ? ' 11111111-1111-1111-1111-111111111111 ' : undefined))
    assert.equal(calls[0].url, 'https://api.hevyapp.com/v1/user/info')
    assert.equal((calls[0].init?.headers as Record<string, string>)['api-key'], '11111111-1111-1111-1111-111111111111')
    mock.restoreAll(); fakeFetch({ status: 401, body: 'InvalidApiKey' })
    await assert.rejects(hevy.check!(() => 'bad'), /Hevy rejected the API key.*needs Hevy Pro/)
    mock.restoreAll(); fakeFetch({ status: 502, body: {} })
    await assert.rejects(hevy.check!(() => 'k'), /HTTP 502/)
  } finally {
    mock.restoreAll()
  }
})

test('hevy sync pages newest first, stops at the window and emits one stable event per day', async () => {
  const day = (iso: string, kg: number) => ({ start_time: iso, end_time: new Date(Date.parse(iso) + 3_600_000).toISOString(), exercises: [{ sets: [{ type: 'normal', weight_kg: kg, reps: 10 }, { type: 'warmup', weight_kg: 20, reps: 10 }] }] })
  const now = Date.now()
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString()
  setKeys(new Map([['HEVY_API_KEY', 'k']]))
  const events: { externalId: string; body: unknown }[] = []
  let cursor: unknown
  const ctx = { user: { timezone: TZ }, cursor: null, setCursor: (c: unknown) => { cursor = c }, emit: async (e: { externalId: string; body: unknown }) => { events.push(e) }, log: () => {} } as unknown as ConnectorCtx
  try {
    const calls = fakeFetch(
      { status: 200, body: { page: 1, page_count: 3, workouts: [day(iso(1), 100), day(iso(2), 80)] } },
      { status: 200, body: { page: 2, page_count: 3, workouts: [day(iso(200), 50)] } }, // older than the 90-day window: stop
    )
    await hevy.sync(ctx)
    assert.equal(calls.length, 2)
    assert.match(calls[0].url, /workouts\?page=1&pageSize=10$/)
    const first = events.filter((e) => (e.body as { workouts: number }).workouts > 0)
    assert.equal(first.length, 2)
    assert.equal((first[0].body as { volumeKg: number }).volumeKg > 0, true) // warm-up left out: 100 × 10
    assert.deepEqual(cursor, { backfilled: true })
    // Same data again: same ids, so ingest dedupes.
    const ids = events.map((e) => e.externalId)
    events.length = 0
    mock.restoreAll()
    fakeFetch(
      { status: 200, body: { page: 1, page_count: 3, workouts: [day(iso(1), 100), day(iso(2), 80)] } },
      { status: 200, body: { page: 2, page_count: 3, workouts: [day(iso(200), 50)] } },
    )
    await hevy.sync(ctx)
    assert.deepEqual(events.map((e) => e.externalId), ids)
    assert.equal(ids.length, new Set(ids).size)
  } finally {
    mock.restoreAll()
    setKeys(new Map())
  }
})

test('hevyDays keeps warm-ups out of the volume', () => {
  assert.deepEqual(hevyDays([{ start_time: '2026-11-06T04:00:00Z', end_time: '2026-11-06T05:00:00Z', exercises: [{ sets: [{ type: 'warmup', weight_kg: 40, reps: 10 }, { type: 'normal', weight_kg: 60, reps: 5 }] }] }], TZ),
    [{ date: '2026-11-06', workouts: 1, minutes: 60, volumeKg: 300, exercises: 1 }])
})
