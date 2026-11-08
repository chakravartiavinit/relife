import { test } from 'node:test'
import assert from 'node:assert/strict'
import { levelFor, medalFor, scoreDay, streakMultiplier, titleFor, xpForLevel } from './xp'

test('level curve: about a week to level 5, a month to 10', () => {
  assert.equal(xpForLevel(1), 0)
  assert.equal(levelFor(0).level, 1)
  assert.equal(levelFor(xpForLevel(5)).level, 5)
  assert.equal(levelFor(xpForLevel(5) - 1).level, 4)
  assert.ok(xpForLevel(5) > 900 && xpForLevel(5) < 1200)
  assert.ok(xpForLevel(10) > 4000 && xpForLevel(10) < 5500)
  assert.equal(titleFor(1), 'Awakened')
  assert.equal(titleFor(12), 'Pathfinder')
  assert.equal(titleFor(99), 'Transcendent')
  assert.equal(medalFor(4), null)
  assert.equal(medalFor(10)?.medal, 'silver')
})

test('more routines never raise the daily ceiling', () => {
  const five = scoreDay({ plan: Array.from({ length: 5 }, () => ({ area: 'health' as const, done: 1 })), streak: 0 })
  const fifty = scoreDay({ plan: Array.from({ length: 50 }, () => ({ area: 'health' as const, done: 1 })), streak: 0 })
  const total = (xs: { amount: number }[]) => xs.reduce((s, a) => s + a.amount, 0)
  assert.equal(total(five), 100)
  assert.equal(total(fifty), 100)
  assert.equal(total(scoreDay({ plan: [{ area: 'mind', done: 1 }, { area: 'mind', done: 0 }], streak: 0 })), 50)
})

test('typed-in data earns half and is capped; streak adds a bonus', () => {
  const synced = scoreDay({ plan: [], steps: 9000, stepsVerified: true, streak: 0 })
  const typed = scoreDay({ plan: [], steps: 9000, stepsVerified: false, streak: 0 })
  assert.equal(synced[0].amount, 15)
  assert.equal(typed[0].amount, 8)
  const lots = scoreDay({ plan: [], sleepHours: 8, steps: 9000, meditationMin: 20, learningMin: 60, catchUps: 3, streak: 0 })
  const manual = lots.filter((a) => !a.verified).reduce((s, a) => s + a.amount, 0)
  assert.ok(manual <= 40)
  const streaky = scoreDay({ plan: [{ area: 'health', done: 1 }], streak: 30 })
  assert.equal(streakMultiplier(30), 1.5)
  assert.deepEqual(streaky.map((a) => [a.source, a.amount]), [['plan', 100], ['streak', 50]])
})
