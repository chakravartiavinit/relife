import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fillDays } from './daily'
import { stravaDays } from './strava'
import { todoistDays } from './todoist'
import { lastfmDays } from './lastfm'
import { typingDays } from './monkeytype'
import { leetcodeDays } from './competitive'

const TZ = 'Asia/Kolkata'

test('fillDays adds zero days from the first day with data, or the whole window once backfilled', () => {
  const blank = (date: string) => ({ date, n: 0 })
  const days = [{ date: '2026-11-08', n: 2 }, { date: '2026-11-10', n: 1 }]
  assert.deepEqual(fillDays(days, '2026-11-01', '2026-11-11', blank, false).map((d) => `${d.date}:${d.n}`),
    ['2026-11-08:2', '2026-11-09:0', '2026-11-10:1', '2026-11-11:0'])
  assert.equal(fillDays(days, '2026-11-01', '2026-11-11', blank, true).length, 11)
  assert.deepEqual(fillDays([], '2026-11-01', '2026-11-11', blank, false), []) // never used: nothing to say
})

test('stravaDays sums minutes and splits distance by sport on the local date', () => {
  const days = stravaDays([
    { sport_type: 'Run', type: 'Run', moving_time: 1800, distance: 5210, start_date_local: '2026-11-06T06:30:00Z' },
    { sport_type: 'TrailRun', type: 'Run', moving_time: 600, distance: 1500, start_date_local: '2026-11-06T18:00:00Z' },
    { sport_type: 'Ride', type: 'Ride', moving_time: 2700, distance: 12400, start_date_local: '2026-11-06T19:00:00Z' },
    { sport_type: 'WeightTraining', type: 'WeightTraining', moving_time: 2400, distance: 0, start_date_local: '2026-11-07T07:00:00Z' },
  ])
  assert.deepEqual(days.get('2026-11-06'), { date: '2026-11-06', activities: 3, minutes: 85, runKm: 6.71, rideKm: 12.4, walkKm: 0, swimKm: 0 })
  assert.equal(days.get('2026-11-07')?.minutes, 40)
})

test('todoistDays counts completions per local day and names the busiest project', () => {
  const days = todoistDays([
    { completed_at: '2026-11-06T19:00:00Z', project_id: 'a' }, // 00:30 on the 7th in India
    { completed_at: '2026-11-07T05:00:00Z', project_id: 'b' },
    { completed_at: '2026-11-07T06:00:00Z', project_id: 'b' },
  ], TZ, new Map([['b', 'Work']]))
  assert.deepEqual(days, [{ date: '2026-11-07', done: 3, topProject: 'Work' }])
})

test('lastfmDays skips the song playing now and estimates minutes', () => {
  const t = (uts: number, artist = 'A') => ({ artist: { '#text': artist }, date: { uts: String(uts) } })
  const at = Date.parse('2026-11-06T10:00:00Z') / 1000
  const days = lastfmDays([
    { artist: { '#text': 'B' }, '@attr': { nowplaying: 'true' } },
    t(at), t(at + 200), t(at + 400, 'B'),
  ], TZ)
  assert.deepEqual(days, [{ date: '2026-11-06', tracks: 3, minutes: 11, topArtist: 'A' }])
})

test('typingDays averages speed and accuracy per day', () => {
  const at = Date.parse('2026-11-06T10:00:00Z')
  const days = typingDays([
    { wpm: 70, acc: 95, timestamp: at, testDuration: 60 },
    { wpm: 80.5, acc: 97, timestamp: at + 60_000, testDuration: 30 },
  ], TZ)
  assert.deepEqual(days, [{ date: '2026-11-06', tests: 2, minutes: 2, wpm: 75.3, best: 80.5, accuracy: 96 }])
})

test('leetcodeDays: submissions from the calendar, solved only on days the last 20 cover', () => {
  const ts = (iso: string) => String(Date.parse(iso) / 1000)
  // A full list of 20: the oldest day (Nov 5) may be cut off, so it gets no solved count.
  const acs = [
    ...Array.from({ length: 17 }, (_, i) => ({ titleSlug: `p${i}`, timestamp: ts('2026-11-07T06:00:00Z') })),
    { titleSlug: 'p0', timestamp: ts('2026-11-06T06:00:00Z') }, // first accepted earlier: counts on the 6th
    { titleSlug: 'x', timestamp: ts('2026-11-05T06:00:00Z') },
    { titleSlug: 'y', timestamp: ts('2026-11-05T07:00:00Z') },
  ]
  const days = leetcodeDays({
    matchedUser: { userCalendar: { submissionCalendar: JSON.stringify({ [ts('2026-11-05T00:00:00Z')]: 4, [ts('2026-11-06T00:00:00Z')]: 2, [ts('2026-11-07T00:00:00Z')]: 20 }) } },
    recentAcSubmissionList: acs,
    userContestRanking: { rating: 1834.6 },
    userContestRankingHistory: [{ attended: true, rating: 1801.2, contest: { startTime: Date.parse('2026-11-01T02:30:00Z') / 1000 } }],
  }, TZ, '2026-10-01', '2026-11-07')
  assert.equal(days.get('2026-11-05')?.solved, undefined)
  assert.equal(days.get('2026-11-05')?.submissions, 4)
  assert.equal(days.get('2026-11-06')?.solved, 1)
  assert.equal(days.get('2026-11-07')?.solved, 16)
  assert.deepEqual([days.get('2026-11-01')?.rating, days.get('2026-11-01')?.contests], [1801, 1])
  assert.equal(days.get('2026-11-07')?.rating, 1835)
})

test('xpDay puts XP on yesterday when Duolingo says the streak was last extended yesterday', async () => {
  const { xpDay } = await import('./duolingo')
  assert.equal(xpDay('2026-11-11', '2026-11-10'), '2026-11-10')
  assert.equal(xpDay('2026-11-11', '2026-11-11'), '2026-11-11')
  assert.equal(xpDay('2026-11-11', undefined), '2026-11-11')
  assert.equal(xpDay('2026-11-11', '2026-11-01'), '2026-11-11') // streak broken: new XP is today's
})
