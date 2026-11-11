import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTemplates } from './routines'

test('toTemplates keeps runnable routines and drops the rest', () => {
  const out = toTemplates([
    { name: 'Evening walk', area: 'health', kind: 'routine', days: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'], times: ['19:30', '7pm', '19:30'], why: 'You sit all day.' },
    { name: 'Gym', area: 'health', kind: 'routine', days: ['MO', 'WE', 'FR'], times: ['07:00'], note: '45 minutes', why: 'Back to it.' },
    { name: 'Journal', area: 'mind', kind: 'routine', days: [], times: ['22:00'], why: 'Already have it.' },
    { name: 'Invest', area: 'wealth', kind: 'routine', days: [], times: ['10:00'], why: 'Area not picked.' },
    { name: 'No time', area: 'health', kind: 'routine', days: [], times: ['soon'], why: 'Bad time.' },
  ], ['health', 'mind'], ['journal'])
  assert.deepEqual(out.map((r) => r.name), ['Evening walk', 'Gym'])
  assert.deepEqual(out[0].rule, { freq: 'daily', times: ['19:30'] })
  assert.deepEqual(out[1].rule, { freq: 'weekly', times: ['07:00'], byweekday: ['MO', 'WE', 'FR'] })
  assert.ok(out.every((r) => r.id.startsWith('ai-')))
})
