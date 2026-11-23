import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Change, Link, Signal } from './patterns'
import { connectionForText } from './proposal-connection'

const sig = (id: string, name: string, area: string): Signal => ({ id, name, area, group: id, direction: 'up', days: new Map() })
const journal = sig('tracker:journal', 'Journal', 'mind')
const sleep = sig('tracker:sleep', 'Sleep', 'health')
const steps = sig('tracker:steps', 'Steps', 'health')
const routines = sig('routines', 'Routines done', 'mind')
const link = (a: Signal, b: Signal): Link => ({ a, b, lag: 0, rho: 0.5, n: 42, high: 7.4, low: 6.6, split: 1 })
const change = (signal: Signal, partner?: Signal): Change => ({ signal, recent: 1, usual: 2, pct: -0.5, with: partner ? [{ signal: partner, pct: -0.2 }] : [] })

const TEXT = 'Add a wind-down routine at 22:30. You sleep 50 minutes more on nights you journaled.'

test('a proposal that names both signals of a link gets that link', () => {
  const l = link(journal, sleep)
  assert.deepEqual(connectionForText(TEXT, [link(steps, sleep), l], []), { link: l })
})

test('one signal named is not enough for a link', () => {
  assert.equal(connectionForText(TEXT, [link(steps, sleep)], []), null)
})

test('a change qualifies when its signal is named and it has a partner', () => {
  const c = change(sleep, journal)
  assert.deepEqual(connectionForText(TEXT, [], [change(steps, sleep), c]), { change: c })
  assert.equal(connectionForText(TEXT, [], [change(sleep)]), null)
})

test('a generic word such as routine never counts as naming Routines done', () => {
  assert.equal(connectionForText(TEXT, [link(routines, sleep)], []), null)
})

test('no links and no changes show nothing', () => {
  assert.equal(connectionForText(TEXT, [], []), null)
})
