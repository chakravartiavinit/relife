import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historyForModel, proposalIds, sourcesFromSteps, windowLabel, type ThreadMessage } from './coach-thread'

const m = (role: 'user' | 'assistant', text: string, error = false): ThreadMessage => ({ role, text, payload: error ? { error: true } : {} })

test('history keeps the last turns in order and starts with a user message', () => {
  const h = historyForModel([m('user', 'a'), m('assistant', 'b'), m('user', 'c'), m('assistant', 'd')], 3)
  assert.deepEqual(h, [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'd' }])
})

test('history drops a failed answer together with its question', () => {
  const h = historyForModel([m('user', 'a'), m('assistant', 'b'), m('user', 'broken'), m('assistant', 'LLM error', true), m('user', 'c')])
  assert.deepEqual(h.map((x) => x.content), ['a', 'b', 'c'])
})

test('history is cut to the character budget from the oldest end', () => {
  const long = 'x'.repeat(900)
  const h = historyForModel([m('user', long), m('assistant', long), m('user', long), m('assistant', 'short')], 6, 2000)
  assert.equal(h.length, 2)
  assert.equal(h[0].role, 'user')
  assert.ok(h.reduce((s, x) => s + x.content.length, 0) <= 2000)
  assert.deepEqual(historyForModel([]), [])
})

test('a single message longer than the budget is trimmed, not dropped', () => {
  const h = historyForModel([m('user', 'y'.repeat(5000))], 6, 2000)
  assert.equal(h[0].content.length, 2000)
})

test('window labels read like a person would write them', () => {
  assert.equal(windowLabel('2026-10-01', '2026-10-31'), '1–31 Oct')
  assert.equal(windowLabel('2026-10-28', '2026-11-03'), '28 Oct–3 Nov')
  assert.equal(windowLabel('2026-10-28', undefined), 'from 28 Oct')
  assert.equal(windowLabel(undefined, undefined), '')
})

test('a metric read becomes a chip that opens the metric Peek', () => {
  const s = sourcesFromSteps([{ toolResults: [{ toolName: 'get_metric', input: { slug: 'sleep.hours', from: '2026-11-02', to: '2026-11-08' }, output: [{ slug: 'sleep.hours', name: 'Sleep' }] }] }])
  assert.deepEqual(s, [{ label: 'Sleep · 2–8 Nov', peek: 'metric:sleep.hours' }])
})

test('a merchant spend read opens that merchant; a category read is a label only', () => {
  const s = sourcesFromSteps([{ toolResults: [
    { toolName: 'spend_by', input: { by: 'merchant', filter: 'zepto', from: '2026-10-01', to: '2026-10-31' }, output: { groups: [{ merchant: 'Zepto', total: 6840 }] } },
    { toolName: 'spend_by', input: { by: 'category' }, output: { groups: [] } },
  ] }])
  assert.deepEqual(s, [{ label: 'Zepto · 1–31 Oct', peek: 'merchant:Zepto' }, { label: 'Spending by category' }])
})

test('the same source twice is one chip, tool names without a label add none', () => {
  const step = { toolResults: [{ toolName: 'goals', input: {}, output: {} }, { toolName: 'goals', input: {}, output: {} }, { toolName: 'propose_schedule', input: {}, output: { pending: true, id: 'i1' } }] }
  assert.deepEqual(sourcesFromSteps([step]), [{ label: 'Goals' }])
  assert.deepEqual(proposalIds([step, step]), ['i1'])
})

test('calls without results still give a chip', () => {
  assert.deepEqual(sourcesFromSteps([{ toolCalls: [{ toolName: 'people', input: {} }] }]), [{ label: 'People' }])
})

test('a rejected proposal is not linked', () => {
  assert.deepEqual(proposalIds([{ toolResults: [{ toolName: 'propose_schedule', output: { pending: false, reason: 'similar suggestion exists' } }] }]), [])
})
