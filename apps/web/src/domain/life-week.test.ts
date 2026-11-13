import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeek, type XpDay } from './life-week'

// 2026-11-12 is a Thursday: the week is Mon 9 – Sun 15, last week Mon 2 – Sun 8.
const TODAY = '2026-11-12'
const xp = (date: string, area: string, amount: number): XpDay => ({ date, area, amount })

test('the week runs Monday to Sunday and marks each day', () => {
  const w = buildWeek([xp('2026-11-09', 'health', 10), xp('2026-11-11', 'health', 20)], TODAY, ['health'])
  assert.equal(w.start, '2026-11-09')
  assert.equal(w.days.at(-1), '2026-11-15')
  assert.deepEqual(w.rows[0].marks, ['active', 'idle', 'active', 'idle', 'future', 'future', 'future'])
  assert.equal(w.rows[0].activeDays, 2)
  assert.equal(w.rows[0].elapsed, 4)
  assert.equal(w.rows[0].xp, 30)
})

test('compares with the same days of last week, not all of it', () => {
  const rows = [
    xp('2026-11-10', 'mind', 100), // this week
    xp('2026-11-03', 'mind', 50), // last week, Tuesday: counts
    xp('2026-11-07', 'mind', 500), // last week, Saturday: after the same-days cut
  ]
  assert.equal(buildWeek(rows, TODAY, ['mind']).rows[0].delta, 1)
  // nothing last week: no percentage
  assert.equal(buildWeek([xp('2026-11-10', 'mind', 100)], TODAY, ['mind']).rows[0].delta, null)
  // a drop
  assert.equal(buildWeek([xp('2026-11-10', 'mind', 30), xp('2026-11-03', 'mind', 60)], TODAY, ['mind']).rows[0].delta, -0.5)
})

test('areas hit counts the areas with XP this week; zero amounts do not count', () => {
  const w = buildWeek([xp('2026-11-09', 'health', 10), xp('2026-11-10', 'mind', 0), xp('2026-11-08', 'skills', 99)], TODAY, ['health', 'mind', 'skills', 'wealth'])
  assert.equal(w.areasHit, 1)
  assert.equal(w.areaCount, 4)
  assert.equal(w.rows[1].activeDays, 0)
})

test('on a Monday only today has passed', () => {
  const w = buildWeek([xp('2026-11-09', 'health', 5)], '2026-11-09', ['health'])
  assert.deepEqual(w.rows[0].marks, ['active', 'future', 'future', 'future', 'future', 'future', 'future'])
  assert.equal(w.rows[0].elapsed, 1)
})
