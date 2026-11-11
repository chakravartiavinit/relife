import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDays } from '@/core/time'
import { coachStats, type QuestHistory } from './coach'
import { recoveryView, smallerRecoveryPreview } from './recovery'
import type { Signal } from './patterns'
import { xpFor } from './system'

const today = '2026-11-11'
function signal(overrides: Partial<Signal> = {}, usual = 10, recent = 4.5): Signal {
  const days = new Map<string, number>()
  for (let i = 35; i >= 1; i--) days.set(addDays(today, -i), i > 7 ? usual : recent)
  return { id: 'tracker:practice', name: 'Practice', area: 'skills', group: 'practice', direction: 'up', agg: 'sum', days, ...overrides }
}
const miss = (overrides: Partial<Parameters<typeof smallerRecoveryPreview>[0]['missed'][number]> = {}) => ({
  id: 'parent', statId: 'tracker:practice', statName: 'Practice', area: 'skills', unit: 'min', op: 'gte' as const, agg: 'sum' as const, target: 6, progress: 2, ...overrides,
})
const input = (s: Signal, history: QuestHistory[] = [], missed = [miss()]) => ({ missed, signals: [s], stats: coachStats([s], today), history, today, focus: [] })

test('recovery preview stores one verified, strictly easier exact target', () => {
  const preview = smallerRecoveryPreview(input(signal()))!
  assert.equal(preview.parentId, 'parent')
  assert.equal(preview.target, 4.7)
  assert.equal(preview.fromDate, today)
  assert.equal(preview.toDate, today)
  assert.equal(preview.xp, xpFor(preview.rank, 'daily'))
  assert.ok(preview.target < 6)
})

test('recovery never offers an already satisfied target or an active conflict', () => {
  const satisfied = signal()
  satisfied.days.set(today, 5)
  assert.equal(smallerRecoveryPreview(input(satisfied)), null)
  const conflict: QuestHistory = { statId: 'tracker:practice', fromDate: today, toDate: today, status: 'active' }
  assert.equal(smallerRecoveryPreview(input(signal(), [conflict])), null)
})

test('reductions start tomorrow and sensitive measurements stay unavailable', () => {
  const spending = signal({ id: 'habit:snacks', name: 'Snacks', area: 'wealth', direction: 'down', unit: 'INR' }, 10, 15)
  const preview = smallerRecoveryPreview(input(spending, [], [miss({ statId: 'habit:snacks', statName: 'Snacks', area: 'wealth', unit: 'INR', op: 'lte', target: 10 })]))!
  assert.equal(preview.fromDate, addDays(today, 1))
  assert.ok(preview.target > 10)
  const sensitive = signal({ id: 'tracker:weight', name: 'Weight', area: 'health' })
  assert.equal(smallerRecoveryPreview(input(sensitive)), null)
})

test('recovery view exposes only the UI decision contract', () => {
  const view = recoveryView('insight', {
    localDate: today, missedIds: ['parent'], version: 2, preview: null, choice: 'rest', questId: null,
  }, [{ id: 'parent', title: 'Practice', progress: 2, target: 6, unit: 'min' }])
  assert.deepEqual(view, {
    id: 'insight', version: 2, localDate: today, missed: [{ id: 'parent', title: 'Practice', progress: 2, target: 6, unit: 'min' }],
    preview: null, choice: 'rest', questId: null,
  })
})
