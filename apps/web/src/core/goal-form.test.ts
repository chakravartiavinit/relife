import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseGoalForm } from './goal-form'

// The fields the goal form posts when editing (measure and baseline are locked, so only hidden inputs carry them).
const GOAL = '0f6c1c0e-6a8a-4a57-9a43-3c1f2f6f4f01'
const ROUTINE = '5b0d9d3e-1c1e-4d1a-8f0e-2a7d6b9c0e11'
function editForm(skip: string[] = []) {
  const f = new FormData()
  const fields: [string, string][] = [
    ['id', GOAL], ['version', '3'], ['area', 'skills'], ['measureKind', 'tracker'], ['direction', 'increase'],
    ['title', 'Type 80 words a minute'], ['reason', 'Keep up in meetings'], ['target', '80'], ['targetDate', '2027-02-10'],
    ['actions', `schedule:${ROUTINE}`], ['cadence', 'fortnightly'],
  ]
  for (const [k, v] of fields) if (!skip.includes(k)) f.append(k, v)
  return f
}

test('the locked edit form parses', () => {
  const p = parseGoalForm(editForm())
  assert.ok(p)
  assert.equal(p.fields.id, GOAL)
  assert.equal(p.fields.version, 3)
  assert.equal(p.fields.cadence, 'fortnightly')
  assert.deepEqual(p.actions, [{ kind: 'schedule', id: ROUTINE }])
})

test('the edit form fails without the hidden measure fields', () => {
  for (const k of ['area', 'measureKind', 'direction']) assert.equal(parseGoalForm(editForm([k])), null, k)
})

test('unknown action keys are dropped', () => {
  const f = editForm()
  f.append('actions', 'quest:abc')
  f.append('actions', 'schedule:not-a-uuid')
  assert.deepEqual(parseGoalForm(f)?.actions, [{ kind: 'schedule', id: ROUTINE }])
})
