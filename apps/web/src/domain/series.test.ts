import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasTrend, leadSeries, trimLeadingEmpty, type Series } from './series'

const s = (id: string, values: (number | null)[]): Series => ({ id, name: id.toUpperCase(), color: `var(--${id})`, values })

test('leadSeries keeps one series as the lead, with no Other', () => {
  const r = leadSeries([s('a', [1, 2])], 3)
  assert.deepEqual(r.map((x) => [x.id, x.rank]), [['a', 1]])
})

test('leadSeries with exactly the top count has no Other either', () => {
  const r = leadSeries([s('a', [1]), s('b', [3]), s('c', [2])], 3)
  assert.deepEqual(r.map((x) => [x.id, x.rank]), [['b', 1], ['c', 2], ['a', 3]])
  assert.ok(!r.some((x) => x.other))
})

test('leadSeries folds 11 series into the top 3 and Other, summing per period', () => {
  const all = Array.from({ length: 11 }, (_, i) => s(`s${i}`, [i + 1, i === 4 ? null : 1, null]))
  const r = leadSeries(all, 3)
  assert.deepEqual(r.map((x) => x.id), ['s10', 's9', 's8', 'other'])
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 3, 4])
  const other = r[3]
  assert.equal(other.name, 'Other')
  assert.equal(other.other, true)
  // The eight folded series are s0..s7: 1+2+…+8 = 36 in period 0, one 1 each but s4's null in period 1, and nothing in period 2.
  assert.deepEqual(other.values, [36, 7, null])
  assert.deepEqual(all.map((x) => x.id), Array.from({ length: 11 }, (_, i) => `s${i}`), 'the input is not reordered')
})

test('leadSeries breaks ties by input order and pins the lead', () => {
  const tied = [s('a', [5]), s('b', [5]), s('c', [5])]
  assert.deepEqual(leadSeries(tied, 2).map((x) => x.id), ['a', 'b', 'other'])
  assert.deepEqual(leadSeries([s('a', [9]), s('b', [1]), s('c', [5])], 2, 'b').map((x) => x.id), ['b', 'a', 'other'])
})

test('trimLeadingEmpty drops leading periods where every series is 0 or null', () => {
  const r = trimLeadingEmpty(['Jan', 'Feb', 'Mar', 'Apr'], [s('a', [null, 0, 4, 5]), s('b', [0, null, null, 1])])
  assert.deepEqual(r.categories, ['Mar', 'Apr'])
  assert.deepEqual(r.series.map((x) => x.values), [[4, 5], [null, 1]])
  assert.equal(r.dropped, 2)
})

test('trimLeadingEmpty keeps an interior zero and changes nothing when the first period is active', () => {
  const kept = trimLeadingEmpty(['Jan', 'Feb', 'Mar'], [s('a', [3, 0, 2])])
  assert.deepEqual(kept.categories, ['Jan', 'Feb', 'Mar'])
  assert.deepEqual(kept.series[0].values, [3, 0, 2])
  assert.equal(kept.dropped, 0)
  const gap = trimLeadingEmpty(['Jan', 'Feb', 'Mar', 'Apr'], [s('a', [0, 6, 0, 2])])
  assert.deepEqual(gap.series[0].values, [6, 0, 2])
})

test('trimLeadingEmpty with every period empty drops them all', () => {
  const r = trimLeadingEmpty(['Jan', 'Feb'], [s('a', [null, 0]), s('b', [0, 0])])
  assert.deepEqual(r.categories, [])
  assert.deepEqual(r.series.map((x) => x.values), [[], []])
  assert.equal(r.dropped, 2)
})

test('hasTrend needs three logged points', () => {
  const p = (value: number | null) => ({ value })
  assert.equal(hasTrend([]), false)
  assert.equal(hasTrend([p(1), p(2), p(null)]), false)
  assert.equal(hasTrend([p(1), p(null), p(2), p(3)]), true)
})
