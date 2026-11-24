import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NavStatus } from '@/domain/shell'
import { rowStatus } from './components/shell/nav-status'

const none = { done: 0, total: 0, skipped: 0 }
const status = (over: Partial<NavStatus> = {}): NavStatus => ({
  today: { done: 5, total: 11, skipped: 0 },
  coach: 8,
  areas: { health: { done: 4, total: 7, skipped: 0 }, mind: { done: 2, total: 2, skipped: 0 }, skills: none, wealth: none, hobbies: none, relationships: none },
  ...over,
})

test('rows show only their name while the status loads', () => {
  assert.deepEqual(rowStatus('/'), { sr: '' })
  assert.deepEqual(rowStatus('/health'), { sr: '' })
})

test('Today shows the plan count and a check when the whole plan is done', () => {
  assert.deepEqual(rowStatus('/', status()), { text: '5 of 11', done: false, sr: ', 5 of 11 done today', tip: '5 of 11' })
  assert.equal(rowStatus('/', status({ today: { done: 11, total: 11, skipped: 0 } })).done, true)
  assert.deepEqual(rowStatus('/', status({ today: none })), { sr: '' })
})

test('skipped routines are closed: they leave "N left" and count toward Today\'s check', () => {
  const s = status({ today: { done: 9, total: 11, skipped: 2 }, areas: { ...status().areas, health: { done: 4, total: 7, skipped: 3 }, mind: { done: 1, total: 2, skipped: 1 } } })
  assert.deepEqual(rowStatus('/', s), { text: '11 of 11', done: true, sr: ', 11 of 11 done or skipped today', tip: '11 of 11' })
  assert.equal(rowStatus('/health', s).done, true)
  assert.deepEqual(rowStatus('/mind', s), { done: true, mark: 'done', tip: 'Done', sr: ', done today' })
  assert.equal(rowStatus('/', status({ today: { done: 5, total: 11, skipped: 2 } })).text, '7 of 11')
  assert.equal(rowStatus('/health', status({ areas: { ...status().areas, health: { done: 4, total: 7, skipped: 1 } } })).text, '2 left')
})

test('Coach shows its count, and nothing at zero', () => {
  assert.deepEqual(rowStatus('/coach', status()), { count: 8, sr: ', 8 need you', tip: '8 need you' })
  assert.deepEqual(rowStatus('/coach', status({ coach: 0 })), { sr: '' })
})

test('areas say what is left, a check when done, and nothing when nothing is due', () => {
  assert.deepEqual(rowStatus('/health', status()), { text: '3 left', mark: 'due', tip: '3 left', sr: ', 3 left today' })
  assert.deepEqual(rowStatus('/mind', status()), { done: true, mark: 'done', tip: 'Done', sr: ', done today' })
  assert.deepEqual(rowStatus('/skills', status()), { sr: ', nothing due today' })
})

test('People maps to the relationships category; other links carry no status', () => {
  const s = status({ areas: { ...status().areas, relationships: { done: 0, total: 1, skipped: 0 } } })
  assert.equal(rowStatus('/people', s).text, '1 left')
  assert.deepEqual(rowStatus('/plan', s), { sr: '' })
  assert.deepEqual(rowStatus('/time', s), { sr: '' })
})

test('every status phrase reaches screen readers, not colour alone', () => {
  for (const href of ['/', '/coach', '/health', '/mind', '/skills']) {
    const r = rowStatus(href, status())
    if (r.text || r.done || r.count || r.mark) assert.ok(r.sr.length > 0, href)
  }
})
