import { test } from 'node:test'
import assert from 'node:assert/strict'
import { companionPlan, type PlanItem } from './companion'

const at = (h: number) => new Date(Date.UTC(2026, 10, 12, h))
const time = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:00`
const item = (over: Partial<PlanItem>): PlanItem => ({
  scheduleId: 's1', name: 'Journal', kind: 'routine', area: 'mind', occurrence: at(8), status: 'pending', ...over,
})

test('companionPlan leaves money out, shows a quantity routine once as a goal and splits 100 XP', () => {
  const p = companionPlan([
    item({ scheduleId: 'a', name: 'Skincare', status: 'done' }),
    item({ scheduleId: 'b', name: 'Vitamin D3', kind: 'medicine', status: 'missed', occurrence: at(9) }),
    item({ scheduleId: 'w', name: 'Drink water', area: 'health', trackerSlug: 'water', target: 3000, unit: 'ml', step: 250, occurrence: at(10) }),
    item({ scheduleId: 'w', name: 'Drink water', area: 'health', trackerSlug: 'water', target: 3000, unit: 'ml', step: 250, occurrence: at(14) }),
    item({ scheduleId: 'n', name: 'Netflix', kind: 'subscription' }),
  ], (slug) => (slug === 'water' ? 1000 : 0), time)
  assert.deepEqual(p.routines.map((r) => r.name), ['Skincare', 'Vitamin D3'])
  assert.equal(p.routines[1].time, '09:00')
  assert.equal(p.goals.length, 1)
  assert.deepEqual({ value: p.goals[0].value, target: p.goals[0].target, step: p.goals[0].step }, { value: 1000, target: 3000, step: 250 })
  assert.equal(p.total, 3)
  assert.ok(p.routines.every((r) => r.xp === 33))
  assert.equal(p.done, 1)
  assert.equal(p.left, 2) // the missed medicine and the unmet water goal
})

test('companionPlan counts skipped as handled, a met goal as done, and guesses a goal step', () => {
  const p = companionPlan([
    item({ status: 'skipped' }),
    item({ scheduleId: 'w', trackerSlug: 'steps', target: 8000 }),
  ], () => 9000, time)
  assert.equal(p.left, 0)
  assert.equal(p.done, 1)
  assert.equal(p.goals[0].step, 1000)
})

test('companionPlan is empty on a day with nothing due', () => {
  assert.deepEqual(companionPlan([], () => 0, time), { routines: [], goals: [], done: 0, total: 0, left: 0 })
})
