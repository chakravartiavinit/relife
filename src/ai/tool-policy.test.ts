import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowedScheduleKinds, isSafeAiScheduleProposal, resolveHistoryRange } from './tool-policy'

test('resolveHistoryRange accepts only bounded real past calendar dates', () => {
  const metricStart = (to: string) => to === '2026-03-15' ? '2026-02-16' : '2026-10-15'
  assert.deepEqual(resolveHistoryRange('2026-11-11', {}, metricStart), { from: '2026-10-15', to: '2026-11-11' })
  assert.deepEqual(resolveHistoryRange('2026-11-11', { from: '2026-11-01', to: '2026-11-11' }, metricStart), { from: '2026-11-01', to: '2026-11-11' })
  assert.deepEqual(resolveHistoryRange('2026-11-11', { to: '2026-03-15' }, metricStart), { from: '2026-02-16', to: '2026-03-15' })
  assert.deepEqual(resolveHistoryRange('2026-11-11', { from: '2026-08-14' }, metricStart), { from: '2026-08-14', to: '2026-11-11' })
  assert.match(resolveHistoryRange('2026-11-11', { from: '2026-02-30' }, metricStart).error ?? '', /real/)
  assert.match(resolveHistoryRange('2026-11-11', { from: '2026-11-01', to: '2026-11-12' }, metricStart).error ?? '', /future/)
  assert.match(resolveHistoryRange('2026-11-11', { from: '2026-08-13' }, metricStart).error ?? '', /90 days/)
})

test('AI schedule proposals reject medical kinds and known medication or dose text', () => {
  assert.deepEqual(allowedScheduleKinds(), ['routine', 'subscription', 'bill', 'renewal'])
  assert.equal(isSafeAiScheduleProposal('medicine', 'Take aspirin'), false)
  assert.equal(isSafeAiScheduleProposal('routine', 'Take melatonin10mg'), false)
  assert.equal(isSafeAiScheduleProposal('routine', 'Morning vitamins'), false)
  assert.equal(isSafeAiScheduleProposal('routine', 'Evening walk', '10 mg'), false)
  assert.equal(isSafeAiScheduleProposal('routine', 'Evening walk', '10 minutes'), true)
  assert.equal(isSafeAiScheduleProposal('routine', 'Drink water', '500 ml'), true)
  assert.equal(isSafeAiScheduleProposal('routine', 'Take insulin'), false)
  for (const unit of ['mg', 'mcg', 'µg', 'IU']) assert.equal(isSafeAiScheduleProposal('routine', 'Take magnesium', unit), false)
  assert.equal(isSafeAiScheduleProposal('routine', 'Drink water', 'ml'), true)
  assert.equal(isSafeAiScheduleProposal('unknown', 'Evening walk'), false)
})
