import { test } from 'node:test'
import assert from 'node:assert/strict'
import { difficulty, fairTarget, hitRate, fallbackQuests, judge, penaltyFor, rankFor, stretch, windowValue, xpFor, type Stat } from './system'

const stat = (o: Partial<Stat> = {}): Stat => ({ id: 'steps', name: 'Steps', area: 'health', unit: null, direction: 'up', agg: 'sum', usual: 6000, recent: 5500, daysLogged: 30, ...o })

test('difficulty rises with clears and eases after misses', () => {
  assert.equal(difficulty([]), 2)
  assert.equal(difficulty(Array(10).fill('cleared')), 5)
  assert.equal(difficulty(['cleared', 'failed', 'failed', 'failed']), 1)
  assert.equal(stretch(3), 0.15)
})

test('fairTarget keeps AI targets between your usual and three stretches past it', () => {
  const s = stat()
  assert.equal(fairTarget(s, { statId: 'steps', op: 'gte', target: 50000, days: 1 }, 2), 7801) // 6000 × 1.3 + 1
  assert.equal(fairTarget(s, { statId: 'steps', op: 'gte', target: 3000, days: 1 }, 2), 6000)
  const spend = stat({ id: 'spend:apps', unit: 'INR', direction: 'down', usual: 600 })
  assert.equal(fairTarget(spend, { statId: 'spend:apps', op: 'lte', target: 0, days: 1 }, 2), 420)
  assert.equal(fairTarget(spend, { statId: 'spend:apps', op: 'lte', target: 0, days: 2 }, 5), 0)
  assert.equal(fairTarget(undefined, { statId: 'x', op: 'gte', target: 1, days: 1 }, 2), null)
  assert.equal(fairTarget(stat({ daysLogged: 1 }), { statId: 'steps', op: 'gte', target: 7000, days: 1 }, 2), null)
})

test('rankFor uses how often past days met the target when there is history', () => {
  const late = stat({ id: 'late', direction: 'down', usual: 0.1, history: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0] })
  assert.equal(rankFor(late, { statId: 'late', op: 'lte', target: 0, days: 1 }), 'E')
  const steps = stat({ history: [5000, 6000, 7000, 5500, 6500, 8000, 4000, 6000] })
  assert.equal(rankFor(steps, { statId: 'steps', op: 'gte', target: 6800, days: 1 }), 'A') // 2 of 8 days
  assert.equal(rankFor(steps, { statId: 'steps', op: 'gte', target: 7500, days: 1 }), 'S') // 1 of 8
  assert.equal(hitRate(steps, { statId: 'steps', op: 'gte', target: 14000, days: 2 }), 1 / 7) // 2-day totals
  assert.equal(hitRate(stat({ history: [1, 2] }), { statId: 'steps', op: 'gte', target: 1, days: 1 }), null)
})

test('rankFor grades the stretch, and harder kinds pay more', () => {
  const s = stat()
  assert.equal(rankFor(s, { statId: 'steps', op: 'gte', target: 6100, days: 1 }), 'E')
  assert.equal(rankFor(s, { statId: 'steps', op: 'gte', target: 7000, days: 1 }), 'C')
  assert.equal(rankFor(s, { statId: 'steps', op: 'gte', target: 9000, days: 1 }), 'S')
  assert.ok(xpFor('B', 'emergency') > xpFor('B', 'daily'))
})

test('judge clears "more" quests early and only settles "less" quests after the window', () => {
  const more = { op: 'gte' as const, target: 7000, to: '2026-11-07', agg: 'sum' as const }
  assert.equal(judge(more, 7200, '2026-11-07'), 'cleared')
  assert.equal(judge(more, 5000, '2026-11-07'), 'active')
  assert.equal(judge(more, 5000, '2026-11-08'), 'failed')
  const less = { op: 'lte' as const, target: 400, to: '2026-11-07', agg: 'sum' as const }
  assert.equal(judge(less, 100, '2026-11-07'), 'active')
  assert.equal(judge(less, 500, '2026-11-07'), 'failed')
  assert.equal(judge(less, 100, '2026-11-08'), 'cleared')
})

test('windowValue totals counts and averages measures', () => {
  const days = new Map([['2026-11-06', 6], ['2026-11-07', 8]])
  assert.equal(windowValue(days, '2026-11-06', '2026-11-07', 'sum'), 14)
  assert.equal(windowValue(days, '2026-11-06', '2026-11-08', 'avg'), 7)
  assert.equal(windowValue(new Map(), '2026-11-06', '2026-11-06', 'avg'), null)
})

test('penalty is the same quest a stretch harder; fallback favours focus stats', () => {
  assert.ok(penaltyFor({ op: 'gte', target: 100, agg: 'sum' }, 2).target > 100)
  assert.ok(penaltyFor({ op: 'lte', target: 100, agg: 'sum' }, 2).target < 100)
  // Counts stay whole and always go up by at least one: 3 pull requests becomes 4, never 3.5.
  const prs = { usual: 2.9, unit: null, history: [3, 2, 4, 3] }
  assert.equal(penaltyFor({ op: 'gte', target: 3, agg: 'sum' }, 2, prs).target, 4)
  assert.equal(penaltyFor({ op: 'gte', target: 23, agg: 'sum' }, 2, prs).target % 1, 0)
  const qs = fallbackQuests([stat(), stat({ id: 'mood', name: 'Mood', usual: 3.5, recent: 3, agg: 'avg' })], ['mood'], 2, 1)
  assert.equal(qs[0].statId, 'mood')
  assert.equal(qs[0].target, 3.9)
})
