import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowedScheduleKinds, canProposeSchedule, hasExplicitMedicineIntent, resolveHistoryRange } from './tool-policy'

test('resolveHistoryRange accepts only bounded real past calendar dates', () => {
  assert.deepEqual(resolveHistoryRange('2026-11-11', {}, '2026-10-15'), { from: '2026-10-15', to: '2026-11-11' })
  assert.deepEqual(resolveHistoryRange('2026-11-11', { from: '2026-11-01', to: '2026-11-11' }, '2026-10-15'), { from: '2026-11-01', to: '2026-11-11' })
  assert.deepEqual(resolveHistoryRange('2026-11-11', { from: '2026-08-14' }, '2026-10-15'), { from: '2026-08-14', to: '2026-11-11' })
  assert.match(resolveHistoryRange('2026-11-11', { from: '2026-02-30' }, '2026-10-15').error ?? '', /real/)
  assert.match(resolveHistoryRange('2026-11-11', { from: '2026-11-01', to: '2026-11-12' }, '2026-10-15').error ?? '', /future/)
  assert.match(resolveHistoryRange('2026-11-11', { from: '2026-08-13' }, '2026-10-15').error ?? '', /90 days/)
})

test('hasExplicitMedicineIntent does not enable medicine proposals for unrelated questions', () => {
  assert.equal(hasExplicitMedicineIntent('How did my sleep change this month?'), false)
  assert.equal(hasExplicitMedicineIntent('Can you remind me to take my medicine?'), true)
  assert.deepEqual(allowedScheduleKinds(false), ['routine', 'subscription', 'bill', 'renewal'])
  assert.deepEqual(allowedScheduleKinds(true), ['routine', 'subscription', 'bill', 'renewal', 'medicine'])
  assert.equal(canProposeSchedule('medicine'), true)
  assert.equal(canProposeSchedule('medicine', 2, 'tablets'), false)
  assert.equal(canProposeSchedule('routine', 2, 'litres'), true)
})
