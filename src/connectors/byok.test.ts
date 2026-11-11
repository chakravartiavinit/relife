import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toggl, togglDays } from './toggl'
import { rescuetime, rescueDays } from './rescuetime'
import { hevy, hevyDays } from './hevy'
import { readwise, readwiseDays } from './readwise'
import { codewars, codewarsDays } from './codewars'

const TZ = 'Asia/Kolkata'

test('every key connector names the env vars its fields read', () => {
  for (const c of [toggl, rescuetime, hevy, readwise, codewars]) {
    assert.deepEqual(c.fields.map((f) => f.env), c.env, c.id)
    assert.ok(c.description && c.provides.length, c.id)
  }
})

test('togglDays sums minutes per local day, skips running timers and names the top project', () => {
  const days = togglDays([
    { start: '2026-11-06T19:00:00Z', duration: 1800, project_name: 'Writing' }, // 00:30 on the 7th in India
    { start: '2026-11-07T05:00:00Z', duration: 5400, project_name: 'Study' },
    { start: '2026-11-07T08:00:00Z', duration: 600, project_name: 'Writing' },
    { start: '2026-11-07T09:00:00Z', duration: -1_762_000_000 }, // still running
    { start: '2026-11-07T10:00:00Z', duration: 120, project_name: null },
  ], TZ)
  assert.deepEqual(days, [{ date: '2026-11-07', minutes: 132, entries: 4, topProject: 'Study' }])
})

test('rescueDays reads the daily summary feed: minutes from hours, no pulse for an empty day', () => {
  const days = rescueDays([
    { date: '2026-11-09', productivity_pulse: 0, total_hours: 0 },
    { date: '2026-11-08', productivity_pulse: 71.6, total_hours: 7.5, all_productive_hours: 4.25, all_distracting_hours: 1.1 },
    { date: '2026-10-01', productivity_pulse: 50, total_hours: 3 }, // before the window
  ], '2026-11-01', '2026-11-10')
  assert.deepEqual(days, [
    { date: '2026-11-08', pulse: 72, productiveMin: 255, distractingMin: 66, loggedMin: 450 },
    { date: '2026-11-09', pulse: undefined, productiveMin: 0, distractingMin: 0, loggedMin: 0 },
  ])
})

test('hevyDays counts workouts, minutes and volume without warm-ups on the local day', () => {
  const sets = (...s: [string, number | null, number | null][]) => s.map(([type, weight_kg, reps]) => ({ type, weight_kg, reps }))
  const days = hevyDays([
    { start_time: '2026-11-06T19:00:00Z', end_time: '2026-11-06T19:50:00Z', exercises: [{ sets: sets(['warmup', 20, 10], ['normal', 60, 8], ['normal', 60, 8]) }, { sets: sets(['normal', null, 12]) }] },
    { start_time: '2026-11-07T10:00:00Z', exercises: [] }, // no end time
    { start_time: 'nonsense' },
  ], TZ)
  assert.deepEqual(days, [
    { date: '2026-11-07', workouts: 2, minutes: 50, volumeKg: 960, exercises: 2 },
  ])
})

test('readwiseDays counts highlights by when they were made and ignores undated ones', () => {
  const days = readwiseDays([
    { highlighted_at: '2026-11-06T19:00:00Z', book_id: 1 }, // 00:30 on the 7th in India
    { highlighted_at: '2026-11-07T04:00:00Z', book_id: 1 },
    { highlighted_at: '2026-11-07T05:00:00Z', book_id: 2 },
    { highlighted_at: null, book_id: 3 },
    { book_id: 4 },
  ], TZ)
  assert.deepEqual(days, [{ date: '2026-11-07', highlights: 3, sources: 2 }])
})

test('codewarsDays counts kata per local day', () => {
  const days = codewarsDays([
    { completedAt: '2026-11-06T19:00:00Z' },
    { completedAt: '2026-11-07T08:00:00Z' },
    { completedAt: '2026-11-08T08:00:00Z' },
    { completedAt: 'bad' },
  ], TZ)
  assert.deepEqual([...days.values()], [{ date: '2026-11-07', solved: 2 }, { date: '2026-11-08', solved: 1 }])
})
