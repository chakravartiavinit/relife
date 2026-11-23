import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '@/core/time'
import { describeChange, describeLink, type Change, type Link, type Signal } from './patterns'
import { connectionView } from './connection-view'

const TODAY = '2026-11-23'
const sig = (id: string, name: string, area: string, extra: Partial<Signal> = {}): Signal => ({
  id, name, area, group: id, direction: 'up', days: new Map([[TODAY, 7], [addDays(TODAY, -1), 6]]), ...extra,
})
const routines = sig('routines', 'Routines done', 'mind')
const sleep = sig('tracker:sleep.hours', 'Sleep', 'health', { unit: 'h' })
const mood = sig('tracker:mood', 'Mood', 'mind')

const link: Link = { a: routines, b: sleep, lag: 1, rho: 0.5, n: 42, high: 7.6, low: 6.8, split: 8 }
const change: Change = { signal: mood, recent: 3.5, usual: 4.1, pct: -0.15, with: [{ signal: sleep, pct: -0.08 }] }

test('a link keeps describeLink as its sentence and bolds the two averages', () => {
  const v = connectionView({ link })
  assert.equal(v.parts.map((p) => p.text).join(''), describeLink(link))
  assert.deepEqual(v.parts.filter((p) => p.bold).map((p) => p.text), ['7.6 h', '6.8 h'])
  assert.deepEqual([v.variant, v.pair, v.when, v.areas, v.caption, v.status], ['link', 'Routines done and sleep', 'next day', ['mind', 'health'], 'From 42 days of data', null])
})

test('a same-day link says so, and its Peek is the effect tracker', () => {
  const v = connectionView({ link: { ...link, lag: 0, a: sleep, b: mood } })
  assert.equal(v.when, 'same day')
  assert.deepEqual(v.peek, { type: 'metric', id: 'mood' })
  // The cause being a tracker does not matter when the effect is not one: fall back to the cause.
  assert.deepEqual(connectionView({ link: { ...link, a: sleep, b: routines } }).peek, { type: 'metric', id: 'sleep.hours' })
})

test('a link between two non-trackers has no metric to open', () => {
  assert.equal(connectionView({ link: { ...link, b: sig('spend', 'Spending', 'wealth') } }).peek, null)
})

test('a change keeps describeChange, bolds this week and usual, and says Slipping', () => {
  const v = connectionView({ change })
  assert.equal(v.parts.map((p) => p.text).join(''), describeChange(change))
  assert.deepEqual(v.parts.filter((p) => p.bold).map((p) => p.text), ['3.5', '4.1'])
  assert.deepEqual([v.variant, v.pair, v.when, v.areas, v.status, v.caption], ['change', 'Mood and sleep', 'this week', ['mind', 'health'], 'Slipping', 'This week against the 4 before'])
  assert.deepEqual(v.peek, { type: 'metric', id: 'mood' })
})

test('a change with no partner names only its signal, and a signal with no better direction has no status', () => {
  const alone = connectionView({ change: { ...change, with: [] } })
  assert.deepEqual([alone.pair, alone.areas], ['Mood', ['mind']])
  const spend = sig('spend', 'Spending', 'wealth', { direction: 'none', unit: '₹' })
  const v = connectionView({ change: { signal: spend, recent: 900, usual: 600, pct: 0.5, with: [] } })
  assert.equal(v.status, null)
  assert.equal(v.peek, null)
})

test('given today it returns the last 28 days of both signals, with this week marked for a change', () => {
  assert.equal(connectionView({ link }).lines, null)
  const l = connectionView({ link }, { today: TODAY }).lines!
  assert.equal(l.a.length, 28)
  assert.equal(l.a[27], 7)
  assert.equal(l.a[26], 6)
  assert.equal(l.a[0], null)
  assert.equal(l.weekFrom, null)
  const c = connectionView({ change }, { today: TODAY }).lines!
  assert.equal(c.weekFrom, 21)
  assert.equal(c.b?.[27], 7)
  assert.equal(connectionView({ change: { ...change, with: [] } }, { today: TODAY }).lines!.b, null)
})
