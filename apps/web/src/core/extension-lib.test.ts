import { test } from 'node:test'
import assert from 'node:assert/strict'

// extension/lib.js is a plain browser script shared by the extension's worker, popup and options page. It hangs its
// helpers off `self`, so give Node one before loading it.
;(globalThis as { self?: unknown }).self = globalThis
const RL = require('../../../../extension/lib.js') as {
  keyOf: (url: string) => string | null
  under: (a: string, k: string) => boolean
  domainOf: (url: string) => string | null
  hm: (sec: number) => string
  num: (v: number | null) => string
  esc: (t: string) => string
  progressOf: (done: unknown, total: unknown) => { done: number; total: number } | null
}

test('keyOf: a YouTube playlist, else the site and the first two parts of the path', () => {
  assert.equal(RL.keyOf('https://www.youtube.com/watch?v=abc&list=PL123'), 'youtube.com/list/PL123')
  assert.equal(RL.keyOf('https://app.100xdevs.com/new-courses/13/lesson/4?x=1'), 'app.100xdevs.com/new-courses/13')
  assert.equal(RL.keyOf('not a url'), null)
})

test('under: a page under an item, but not a sibling that shares a prefix', () => {
  assert.ok(RL.under('site/course/13/lesson', 'site/course/13'))
  assert.ok(RL.under('site/course/13', 'site/course/13'))
  assert.ok(!RL.under('site/course/130', 'site/course/13'))
  assert.ok(!RL.under('site/course/1', 'site/course/13'))
})

test('domainOf drops www and ignores non-web pages', () => {
  assert.equal(RL.domainOf('https://www.example.com/a'), 'example.com')
  assert.equal(RL.domainOf('chrome://extensions'), null)
})

test('formatters: hm, num and esc', () => {
  assert.equal(RL.hm(0), '0m')
  assert.equal(RL.hm(20), '<1m')
  assert.equal(RL.hm(45 * 60), '45m')
  assert.equal(RL.hm(125 * 60), '2h 05m')
  assert.equal(RL.num(1234.5), '1,235')
  assert.equal(RL.num(2.5), '2.5')
  assert.equal(RL.num(null), '–')
  assert.equal(RL.esc('<b a="x">\'&'), '&lt;b a=&quot;x&quot;&gt;&#39;&amp;')
})

test('progressOf keeps a lesson count and drops fractional players and loaders', () => {
  assert.deepEqual(RL.progressOf(7, 42), { done: 7, total: 42 })
  assert.equal(RL.progressOf(0.4658385093167702, 1), null)
  assert.equal(RL.progressOf(1, 1), null)
  assert.equal(RL.progressOf(43, 42), null)
  assert.equal(RL.progressOf(undefined, 42), null)
})
