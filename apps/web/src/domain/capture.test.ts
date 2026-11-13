import { test } from 'node:test'
import assert from 'node:assert/strict'
import { amountText, bucketOf, previewQuickLog, rankCaptureSuggestions, type ManualLog } from './capture'

test('buckets and their edges', () => {
  assert.equal(bucketOf(3.99), 'night')
  assert.equal(bucketOf(4), 'morning')
  assert.equal(bucketOf(11.99), 'morning')
  assert.equal(bucketOf(12), 'afternoon')
  assert.equal(bucketOf(16.99), 'afternoon')
  assert.equal(bucketOf(17), 'evening')
  assert.equal(bucketOf(21.99), 'evening')
  assert.equal(bucketOf(22), 'night')
  assert.equal(bucketOf(0), 'night')
  assert.equal(bucketOf(24), 'night')
})

const log = (slug: string, day: number, hour: number, value: number): ManualLog =>
  ({ slug, name: slug, unit: 'min', area: 'hobbies', day: `2026-11-${String(day).padStart(2, '0')}`, hour, value })
const run = (slug: string, hours: number[], values = hours.map(() => 20)) => hours.map((h, i) => log(slug, i + 1, h, values[i]))

test('a tracker needs 4 log days to count as frequent', () => {
  assert.deepEqual(rankCaptureSuggestions(run('guitar', [18, 18, 19]), 18), [])
  assert.equal(rankCaptureSuggestions(run('guitar', [18, 18, 19, 20]), 18).length, 1)
})

test('only trackers logged mostly in this bucket are listed', () => {
  const h = [...run('guitar', [18, 19, 20, 21, 9, 9]), ...run('stretch', [8, 9, 7, 10, 18])]
  assert.deepEqual(rankCaptureSuggestions(h, 19).map((f) => f.slug), ['guitar'])
  assert.deepEqual(rankCaptureSuggestions(h, 8).map((f) => f.slug), ['stretch'])
  // exactly half counts
  assert.equal(rankCaptureSuggestions(run('a', [9, 10, 18, 19]), 9).length, 1)
  assert.equal(rankCaptureSuggestions(run('a', [9, 18, 19, 20]), 9).length, 0)
})

test('night wraps past midnight', () => {
  assert.equal(rankCaptureSuggestions(run('journal', [23, 22, 1, 2]), 23.5).length, 1)
})

test('typical is the median manual value', () => {
  assert.equal(rankCaptureSuggestions(run('guitar', [18, 18, 18, 18, 18], [10, 20, 20, 90, 30]), 18)[0].typical, 20)
  assert.equal(rankCaptureSuggestions(run('guitar', [18, 18, 18, 18], [10, 20, 30, 40]), 18)[0].typical, 25)
})

test('most-logged first, then by name, capped at 6, with exclusions', () => {
  const h = [...run('b', [18, 18, 18, 18]), ...run('a', [18, 18, 18, 18]), ...run('z', [18, 18, 18, 18, 18])]
  assert.deepEqual(rankCaptureSuggestions(h, 18).map((f) => f.slug), ['z', 'a', 'b'])
  assert.deepEqual(rankCaptureSuggestions(h, 18, new Set(['z'])).map((f) => f.slug), ['a', 'b'])
  const many = 'abcdefgh'.split('').flatMap((s) => run(s, [18, 18, 18, 18]))
  assert.equal(rankCaptureSuggestions(many, 18).length, 6)
})

test('amounts read in litres once they are big', () => {
  assert.equal(amountText(250, 'ml'), '250 ml')
  assert.equal(amountText(1500, 'ml'), '1.5 L')
  assert.equal(amountText(12, 'pages'), '12 pages')
  assert.equal(amountText(3, null), '3')
})

test('typed log preview', () => {
  const trackers = [{ slug: 'water', name: 'Water', unit: 'ml' }, { slug: 'mood', name: 'Mood', unit: null }]
  const goals = [{ slug: 'water', value: 1250, target: 3000, unit: 'ml' }]
  assert.deepEqual(previewQuickLog({ type: 'entry', slug: 'water', value: 250 }, trackers, goals), { title: 'Log Water +250 ml', sub: '1.5 L of 3 L after this', slug: 'water' })
  assert.equal(previewQuickLog({ type: 'entry', slug: 'water', value: -250 }, trackers, goals).title, 'Log Water −250 ml')
  assert.equal(previewQuickLog({ type: 'entry', slug: 'mood', value: 4 }, trackers, goals).title, 'Set Mood to 4')
  assert.match(previewQuickLog({ type: 'entry', slug: 'cold-shower', value: 1 }, trackers, goals).sub, /New tracker/)
  assert.match(previewQuickLog({ type: 'spend', amount: 120, currency: 'INR', note: 'chai' }, trackers, goals).title, /^Spend .*120.* · chai$/)
})
