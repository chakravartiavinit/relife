import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freezesToUse, pickQuests, questProgress, rollChest, weekStart, DAILY, WEEKLY, type QuestMeasure } from './quests'

test('weekStart is the Monday of that week', () => {
  assert.equal(weekStart('2026-11-06'), '2026-11-02') // Friday
  assert.equal(weekStart('2026-11-02'), '2026-11-02') // Monday
  assert.equal(weekStart('2026-11-08'), '2026-11-02') // Sunday
})

test('pickQuests is stable, respects data and areas, and leads with the focus area', () => {
  const available = new Set<QuestMeasure>(['fullplan', 'steps8k', 'mood', 'commit', 'active'])
  const opts = { period: 'day' as const, seed: 'u:2026-11-06', available, areas: ['health', 'mind'] as const, focus: 'mind' as const, count: 2 }
  const a = pickQuests({ ...opts, areas: [...opts.areas] })
  const b = pickQuests({ ...opts, areas: [...opts.areas] })
  assert.deepEqual(a, b)
  assert.equal(a.length, 2)
  assert.equal(a[0].area, 'mind')
  assert.ok(a.every((q) => available.has(q.measure) && q.area !== 'skills'))
  assert.deepEqual(pickQuests({ ...opts, areas: [], available: new Set() }), [])
  assert.ok(pickQuests({ period: 'week', seed: 'w', available, areas: ['health'], count: 1 })[0].period === 'week')
  assert.ok(DAILY.length && WEEKLY.length)
})

test('questProgress counts days in range and caps at target', () => {
  const q = WEEKLY.find((x) => x.key === 'w-steps')!
  const days = new Map<string, Set<QuestMeasure>>([
    ['2026-11-01', new Set(['steps8k'])], // before range
    ['2026-11-02', new Set(['steps8k'])],
    ['2026-11-03', new Set(['mood'])],
    ['2026-11-04', new Set(['steps8k', 'mood'])],
  ])
  assert.equal(questProgress(q, '2026-11-02', '2026-11-08', days), 2)
})

test('rollChest is deterministic and within range', () => {
  assert.deepEqual(rollChest('rare', 'quest:x'), rollChest('rare', 'quest:x'))
  for (let i = 0; i < 50; i++) {
    const c = rollChest('common', `r${i}`)
    assert.ok(c.xp >= 25 && c.xp <= 50)
  }
  assert.equal(rollChest('epic', 'level:21').freeze, true)
})

test('freezesToUse covers a short gap and never a broken streak', () => {
  const covered = new Set(['2026-11-03', '2026-11-04'])
  // Missed the 5th only: one freeze covers it.
  assert.deepEqual(freezesToUse({ covered, today: '2026-11-06', held: 1 }), ['2026-11-05'])
  // Yesterday was a show-up day: nothing to do.
  assert.deepEqual(freezesToUse({ covered: new Set(['2026-11-05']), today: '2026-11-06', held: 2 }), [])
  // Two missed days, one freeze: streak is gone, keep the freeze.
  assert.deepEqual(freezesToUse({ covered, today: '2026-11-07', held: 1 }), [])
  assert.deepEqual(freezesToUse({ covered, today: '2026-11-07', held: 2 }), ['2026-11-06', '2026-11-05'])
  // Never reaches before the fresh start.
  assert.deepEqual(freezesToUse({ covered, today: '2026-11-06', held: 2, since: '2026-11-06' }), [])
})
