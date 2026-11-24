import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryPace, totalPace } from './category-pace'

const row = (localDate: string, category: string | null, v: number) => ({ localDate, category, base: -v })

test('this month against the same days of the prior months, largest first', () => {
  const spend = [
    row('2026-11-02', 'Rent', 1000), row('2026-10-02', 'Rent', 1000), row('2026-09-02', 'Rent', 1000),
    row('2026-11-05', 'Eating out', 600), row('2026-10-05', 'Eating out', 200), row('2026-09-20', 'Eating out', 900), // the 20th is after the day
    row('2026-11-24', 'Shopping', 50), // after the day
  ]
  const r = categoryPace(spend, '2026-11', 10)
  assert.deepEqual(r.map((c) => c.category), ['Rent', 'Eating out'])
  assert.equal(r[0].usual, 1000)
  assert.equal(r[0].vsUsual, 0)
  assert.equal(r[1].usual, 100) // 200 over the two months with spending by the 10th
  assert.equal(r[1].vsUsual, 5)
})

test('fewer than two prior months, or a category with no history, has no vsUsual', () => {
  assert.equal(categoryPace([row('2026-11-02', 'Rent', 1000), row('2026-10-02', 'Rent', 1000)], '2026-11', 10)[0].vsUsual, null)
  const r = categoryPace([row('2026-11-02', 'Gifts', 500), row('2026-10-02', 'Rent', 1), row('2026-09-02', 'Rent', 1)], '2026-11', 10)
  assert.equal(r[0].usual, 0)
  assert.equal(r[0].vsUsual, null)
})

test('a missing category takes the fallback name', () => {
  assert.equal(categoryPace([row('2026-11-02', null, 5)], '2026-11', 10, { fallback: 'Uncategorized' })[0].category, 'Uncategorized')
})

test('the whole month against the same days of the prior months', () => {
  const spend = [row('2026-11-02', 'A', 300), row('2026-10-02', 'B', 100), row('2026-09-02', 'A', 200), row('2026-09-28', 'A', 999)]
  const t = totalPace(spend, '2026-11', 10)
  assert.equal(t.now, 300)
  assert.equal(t.usual, 150)
  assert.equal(t.vsUsual, 1)
  assert.equal(totalPace([row('2026-11-02', 'A', 5)], '2026-11', 10).vsUsual, null)
})
