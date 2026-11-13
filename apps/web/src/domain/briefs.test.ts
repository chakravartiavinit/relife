import { test } from 'node:test'
import assert from 'node:assert/strict'
import { briefHash, changeLine, pickAiLines, ruleLine, shouldRewrite, stableJson, topChange, type BriefFacts } from './briefs'

const sleep = { name: 'Sleep', unit: 'h', pct: -0.18, recent: 6.1, usual: 7.4, peek: 'metric:sleep.hours' }
const base: BriefFacts = { changes: [], kpis: [{ label: 'Steps, 7-day avg', value: '6,512' }] }

test('the biggest change wins and reads as a sentence', () => {
  const steps = { name: 'Steps', unit: null, pct: 0.12, recent: 8200, usual: 7300 }
  assert.equal(topChange([steps, sleep]), sleep)
  assert.equal(changeLine(sleep), 'Sleep down 18% this week: 6.1 h vs your usual 7.4 h.')
  assert.equal(ruleLine('health', { ...base, changes: [steps, sleep] })!.text, 'Sleep down 18% this week: 6.1 h vs your usual 7.4 h.')
})

test('changes under 10% are not news', () => {
  assert.equal(topChange([{ ...sleep, pct: -0.09 }]), undefined)
  assert.equal(ruleLine('health', { ...base, changes: [{ ...sleep, pct: 0.05 }] }), null)
})

test('routines are the fallback line', () => {
  assert.equal(ruleLine('mind', { ...base, routines: { done: 9, due: 11 } })!.text, 'On track: 9 of 11 routines this week.')
  assert.equal(ruleLine('mind', { ...base, routines: { done: 4, due: 11 } })!.text, '4 of 11 routines done this week.')
  assert.equal(ruleLine('mind', { ...base, routines: { done: 0, due: 0 } }), null)
})

test('no data, no line', () => {
  assert.equal(ruleLine('skills', base), null)
  assert.equal(ruleLine('today', { ...base, today: { done: 0, total: 0, overdue: 0 } }), null)
})

test('a change beats routines, and the facts carry both plus the headline numbers', () => {
  const b = ruleLine('health', { ...base, changes: [sleep], routines: { done: 9, due: 11 } })!
  assert.match(b.text, /^Sleep down 18%/)
  assert.deepEqual(b.facts.map((f) => f.label), ['Sleep, 7 days', 'Routines, 7 days', 'Steps, 7-day avg'])
  assert.equal(b.facts[0].peek, 'metric:sleep.hours')
})

test('today: progress, overdue and what is next', () => {
  assert.equal(ruleLine('today', { ...base, today: { done: 3, total: 7, overdue: 0, next: { name: 'Vitamin D3', time: '14:30' } } })!.text, '3 of 7 done so far. Next: Vitamin D3 at 14:30.')
  assert.equal(ruleLine('today', { ...base, today: { done: 3, total: 7, overdue: 2 } })!.text, '3 of 7 done, 2 overdue.')
  assert.equal(ruleLine('today', { ...base, today: { done: 7, total: 7, overdue: 0 } })!.text, 'All 7 done for today.')
})

test('wealth: the month pace leads, only when it is off the usual', () => {
  const money = { month: 'November', spent: '₹48,089', projected: '₹78,220', usual: '₹61,283', vsUsual: 0.28 }
  assert.equal(ruleLine('wealth', { ...base, money })!.text, 'On pace for ₹78,220 in November, 28% above your usual ₹61,283.')
  assert.equal(ruleLine('wealth', { ...base, money: { ...money, vsUsual: -0.3 } })!.text, 'On pace for ₹78,220 in November, 30% below your usual ₹61,283.')
  assert.equal(ruleLine('wealth', { ...base, money: { ...money, vsUsual: 0.04 } }), null)
  // another scope ignores money
  assert.equal(ruleLine('health', { ...base, money }), null)
})

test('time: focus share of the laptop', () => {
  const time = { focus: '2h 41m', share: 0.62, total: '4h 20m', distraction: '44m' }
  assert.equal(ruleLine('time', { ...base, time })!.text, '2h 41m of focus today, 62% of your 4h 20m on the laptop.')
  assert.equal(ruleLine('time', { ...base, time: { ...time, share: 0 } }), null)
})

test('facts are capped and never repeat a label', () => {
  const kpis = Array.from({ length: 8 }, (_, i) => ({ label: `K${i}`, value: String(i) }))
  const b = ruleLine('health', { changes: [sleep], kpis: [...kpis, { label: 'K0', value: 'dup' }] })!
  assert.equal(b.facts.length, 6)
  assert.equal(new Set(b.facts.map((f) => f.label)).size, 6)
})

test('the hash ignores key order and undefined, and notices changes', () => {
  const a = { x: 1, y: { p: [1, 2], q: 'a' } }
  const b = { y: { q: 'a', p: [1, 2] }, x: 1, z: undefined }
  assert.equal(stableJson(a), stableJson(b))
  assert.equal(briefHash(a), briefHash(b))
  assert.notEqual(briefHash(a), briefHash({ ...a, x: 2 }))
  assert.match(briefHash(a), /^[0-9a-f]{16}$/)
})

test('rewrite: new, changed after 2 hours, never when unchanged or too soon', () => {
  const now = new Date('2026-11-12T10:00:00Z')
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000)
  assert.equal(shouldRewrite(null, 'a', now), true)
  assert.equal(shouldRewrite({ hash: 'a', updatedAt: ago(5) }, 'a', now), false)
  assert.equal(shouldRewrite({ hash: 'a', updatedAt: ago(1) }, 'b', now), false)
  assert.equal(shouldRewrite({ hash: 'a', updatedAt: ago(2) }, 'b', now), true)
})

test('model lines are kept only when usable', () => {
  const long = 'x'.repeat(111)
  const out = pickAiLines({ health: '  Sleep is\n down. ', mind: long, skills: 5, wealth: '', bogus: 'x' }, ['health', 'mind', 'skills', 'wealth'])
  assert.deepEqual(out, { health: 'Sleep is down.' })
  assert.deepEqual(pickAiLines(null, ['health']), {})
  assert.equal(pickAiLines({ mind: 'x'.repeat(110) }, ['mind']).mind?.length, 110)
})
