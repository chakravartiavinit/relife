import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setKeys } from '@/core/env'
import { authorizeUrl, readTokens } from '@/core/oauth'
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
