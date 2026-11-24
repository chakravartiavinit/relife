import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Change, Link, Signal } from './patterns'
import { areaStatus, balanceStatus, changesOf, crossAreaConnections, joinNames, lifeOpening, pulseChange, spendStatus, worthKnowing } from './life-status'

const sig = (id: string, area: string, direction: Signal['direction'] = 'up'): Signal => ({ id, name: id, area, group: id, direction, days: new Map() })
const change = (id: string, area: string, pct: number, withAreas: string[] = [], direction: Signal['direction'] = 'up'): Change => ({
  signal: sig(id, area, direction), recent: 1, usual: 1, pct, with: withAreas.map((a) => ({ signal: sig(`${id}-${a}`, a), pct })),
})
const link = (a: Signal, b: Signal): Link => ({ a, b, lag: 0, rho: 0.5, n: 30, high: 2, low: 1, split: 1 })

test('joinNames reads like a sentence', () => {
  assert.equal(joinNames([]), '')
  assert.equal(joinNames(['Health']), 'Health')
  assert.equal(joinNames(['Health', 'Mind']), 'Health and Mind')
  assert.equal(joinNames(['Health', 'Mind', 'Skills']), 'Health, Mind and Skills')
})

test('changesOf leaves out routines and other areas, biggest first', () => {
  const cs = [change('a', 'health', 0.1), change('routines', 'health', 0.9), change('b', 'health', -0.4), change('c', 'mind', 0.8)]
  assert.deepEqual(changesOf(cs, 'health').map((c) => c.signal.id), ['b', 'a'])
})

test('areaStatus: a directional change names the area; otherwise the numbers do', () => {
  assert.equal(areaStatus({ changes: [change('sleep', 'health', -0.2)], tones: [], hasData: true }), 'Slipping')
  assert.equal(areaStatus({ changes: [change('sleep', 'health', 0.2)], tones: ['bad'], hasData: true }), 'Ahead')
  // A change with no better direction (spending) falls back to the numbers.
  assert.equal(areaStatus({ changes: [change('spend', 'wealth', 0.5, [], 'none')], tones: ['bad'], hasData: true }), 'Slipping')
  assert.equal(areaStatus({ changes: [], tones: ['good', undefined], hasData: true }), 'On track')
  assert.equal(areaStatus({ changes: [], tones: [undefined], hasData: true }), 'Steady')
  assert.equal(areaStatus({ changes: [], tones: [], hasData: false }), 'Quiet')
})

test('spendStatus: nothing is Quiet, under a usual day On track, over Steady, far over Slipping', () => {
  assert.equal(spendStatus(0, 500), 'Quiet')
  assert.equal(spendStatus(145, 1965), 'On track')
  assert.equal(spendStatus(700, 500), 'Steady')
  assert.equal(spendStatus(900, 500), 'Slipping')
  assert.equal(spendStatus(300, null), 'Steady')
})

test('lifeOpening names the areas that slipped and the ones that are ahead', () => {
  const a = (title: string, status: Parameters<typeof lifeOpening>[0][0]['status']) => ({ title, status })
  assert.equal(lifeOpening([a('Health', 'Slipping'), a('Mind', 'Behind'), a('Skills', 'Ahead'), a('Hobbies', 'Ahead'), a('Time', 'Steady')]), 'Health and Mind slipped together this week. Skills and Hobbies are ahead.')
  assert.equal(lifeOpening([a('Health', 'Slipping'), a('Skills', 'Steady')]), 'Health slipped this week.')
  assert.equal(lifeOpening([a('Skills', 'Ahead')]), 'Skills is ahead.')
  assert.equal(lifeOpening([a('Skills', 'Steady'), a('Mind', 'On track')]), 'Every area is steady this week.')
  assert.equal(lifeOpening([a('Skills', 'Quiet')]), 'Nothing logged in your areas yet this week.')
})

test('balanceStatus follows the share of the week gone', () => {
  assert.equal(balanceStatus({ hit: 6, count: 6, elapsed: 3 }), 'Ahead')
  assert.equal(balanceStatus({ hit: 0, count: 6, elapsed: 1 }), 'Quiet')
  assert.equal(balanceStatus({ hit: 4, count: 6, elapsed: 7 }), 'Behind')
  assert.equal(balanceStatus({ hit: 4, count: 6, elapsed: 4 }), 'On track')
})

test('crossAreaConnections: a change with a partner in another area, then a link between areas, at most two', () => {
  const sleep = sig('sleep', 'health'), mood = sig('mood', 'mind'), steps = sig('steps', 'health')
  const same = change('steps', 'health', 0.3, ['health'])
  const cross = change('mood', 'mind', -0.15, ['health'])
  const l1 = link(sleep, mood), l2 = link(sleep, steps)
  const out = crossAreaConnections({ changes: [same, cross], links: [l2, l1] }, 2)
  assert.equal(out.length, 2)
  assert.ok('change' in out[0] && out[0].change === cross)
  assert.ok('link' in out[1] && out[1].link === l1)
  assert.deepEqual(crossAreaConnections({ changes: [same], links: [l2] }), [])
  assert.equal(crossAreaConnections({ changes: [cross], links: [l1] }, 1).length, 1)
})

test('worthKnowing prefers routines → next day; pulseChange prefers a change with a partner', () => {
  const r = sig('routines', 'mind'), sleep = sig('sleep', 'health'), mood = sig('mood', 'mind')
  const lr = link(r, sleep), lm = link(sleep, mood)
  assert.equal(worthKnowing([lm, lr]), lr)
  assert.equal(worthKnowing([lm]), lm)
  assert.equal(worthKnowing([]), undefined)
  const solo = change('x', 'health', 0.5), pair = change('y', 'mind', 0.2, ['health'])
  assert.equal(pulseChange([solo, pair]), pair)
  assert.equal(pulseChange([solo]), solo)
  assert.equal(pulseChange([]), undefined)
})
