import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coachOpening } from './coach-opening'
import type { NeedsYouItem } from './needs-you'

const AT = '2026-11-23T09:00:00.000Z'
const alert = (id: string, title: string): NeedsYouItem => ({ kind: 'alert', id, insight: { id, kind: 'alert', title, body: '', at: AT }, at: AT })
const cat = (id: string): NeedsYouItem => ({ kind: 'categorise', id, merchant: id, sampleTxnId: id, count: 1, total: 10, currency: 'INR', at: AT })
const party: NeedsYouItem = { kind: 'party-invite', id: 'p', party: 'Morning crew', from: 'Priya', members: 2, at: AT }

test('it names the first decision and counts the ones after it', () => {
  const o = coachOpening([alert('a', 'vitamin D3 runs out in 9 days'), alert('b', 'x'), alert('c', 'y'), alert('d', 'z'), cat('k')])
  assert.equal(o.line, 'Vitamin D3 runs out in 9 days; three more decisions after it. The rest can wait.')
  assert.equal(o.eyebrow, '5 waiting · 4 need a decision')
  assert.equal(o.insightId, 'a')
})

test('one decision and nothing else says only the decision', () => {
  const o = coachOpening([alert('a', 'Vitamin D3 runs out in 9 days')])
  assert.equal(o.line, 'Vitamin D3 runs out in 9 days.')
  assert.equal(o.eyebrow, '1 waiting · 1 needs a decision')
})

test('one more reads in the singular, and an invite has no insight to open', () => {
  const o = coachOpening([party, alert('a', 'Alert')])
  assert.equal(o.line, 'Priya asked you to join Morning crew; one more decision after it.')
  assert.equal(o.insightId, null)
})

test('only data to sort, and an empty queue', () => {
  assert.equal(coachOpening([cat('a'), cat('b')]).line, 'Nothing needs a decision. Two to sort can wait.')
  assert.deepEqual(coachOpening([]), { eyebrow: '', line: 'Nothing needs you. New decisions land here as they come.', insightId: null })
})
