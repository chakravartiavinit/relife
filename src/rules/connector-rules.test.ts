import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streakAlert } from './streak-at-risk'
import { workoutGapAlert } from './workout-gap'
import { addDays } from '@/core/time'

test('streakAlert warns only for a real streak not yet extended today', () => {
  assert.equal(streakAlert(41, false)?.title, '41-day Duolingo streak ends tonight')
  assert.equal(streakAlert(41, true), null) // already practised
  assert.equal(streakAlert(41, undefined), null) // nothing synced today: unknown
  assert.equal(streakAlert(2, false), null) // too short to matter
})

test('workoutGapAlert fires after 4 synced empty days for someone who usually moves', () => {
  const today = '2026-11-11'
  const days = new Map<string, number>()
  for (let i = 1; i <= 32; i++) days.set(addDays(today, -i), i > 4 && i % 3 === 0 ? 40 : 0) // 9 active days before the gap
  const a = workoutGapAlert(days, today)
  assert.equal(a?.title, '4 days without a workout')
  assert.match(a!.body, /2\.3 days a week/)
  // Someone who rarely works out isn't nagged.
  const rare = new Map([...days].map(([d, v]) => [d, v && d < addDays(today, -20) ? 0 : v]))
  assert.equal(workoutGapAlert(rare, today), null)
  // A workout inside the gap: no alert.
  assert.equal(workoutGapAlert(new Map([...days, [addDays(today, -2), 30]]), today), null)
  // Missing days (not synced) aren't a gap.
  const missing = new Map(days); missing.delete(addDays(today, -1))
  assert.equal(workoutGapAlert(missing, today), null)
})
