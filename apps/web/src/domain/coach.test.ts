import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '@/core/time'
import { canCoach, coachStats, lateClear, questCandidates, questProgress, selectQuests, spendingSpike, type QuestHistory } from './coach'
import type { Signal } from './patterns'

const today = '2026-11-11'
function signal(overrides: Partial<Signal> = {}, usual = 60, recent = 50): Signal {
  const days = new Map<string, number>()
  for (let i = 35; i >= 1; i--) days.set(addDays(today, -i), i > 7 ? usual : recent)
  return { id: 'tracker:practice', name: 'Practice minutes', area: 'skills', group: 'practice', direction: 'up', agg: 'sum', days, ...overrides }
}
const candidates = (signals: Signal[], history: QuestHistory[] = []) => questCandidates(coachStats(signals, today), [], 2, history, today)
const history = (overrides: Partial<QuestHistory> = {}): QuestHistory => ({ statId: 'other', fromDate: today, toDate: today, status: 'active', ...overrides })

test('evidence excludes today, future data and nonfinite values from complete-day baselines', () => {
  const s = signal()
  s.days.set(today, 50_000)
  s.days.set(addDays(today, 1), 90_000)
  s.days.set(addDays(today, -12), NaN)
  const [e] = coachStats([s], today)
  assert.equal(e.usual, 60)
  assert.equal(e.recent, 50)
  assert.equal(e.baselineDays, 27)
  assert.equal(e.recentDays, 7)
  assert.equal(e.recentTo, '2026-11-10')
})

test('recovery targets follow recent capacity rather than an unreachable former baseline', () => {
  const [q] = candidates([signal({}, 100, 20)])
  assert.equal(q.intent, 'recovery')
  assert.equal(q.target, 22)
  assert.equal(q.stat.usual, 100)
})

test('candidate evidence must have a baseline, recent observations and freshness', () => {
  const sparse = signal()
  for (let i = 35; i >= 10; i--) sparse.days.delete(addDays(today, -i))
  assert.deepEqual(candidates([sparse]), [])
  const stale = signal()
  for (let i = 1; i <= 3; i++) stale.days.delete(addDays(today, -i))
  assert.deepEqual(candidates([stale]), [])
  const thin = signal()
  for (let i = 2; i <= 7; i++) thin.days.delete(addDays(today, -i))
  assert.deepEqual(candidates([thin]), [])
})

test('gaps do not become consecutive observations for multi-day hit rates', () => {
  const s = signal()
  s.days.delete(addDays(today, -3))
  assert.equal(coachStats([s], today)[0].history?.length, 2)
})

test('automatic quests exclude sensitive measures and aggregate essential spending', () => {
  for (const [id, name, area] of [
    ['tracker:sleep.hours', 'Sleep hours', 'health'], ['tracker:meds', 'Medication doses', 'health'],
    ['tracker:weight', 'Weight', 'health'], ['tracker:calories', 'Calories', 'health'],
    ['tracker:mood', 'Mood', 'mind'], ['spend', 'Spending', 'wealth'], ['spend:apps', 'App spending', 'wealth'],
  ]) assert.deepEqual(candidates([signal({ id, name, area })]), [], id)
  assert.equal(canCoach(coachStats([signal({ id: 'tracker:steps', name: 'Steps', area: 'health' })], today)[0]), true)
})

test('discretionary habit candidates require a worsening pattern, never a zero-spend target', () => {
  const habit = { id: 'habit:cat:Snacks', name: 'Snacks spending', area: 'wealth', direction: 'down' as const, unit: 'INR' }
  assert.deepEqual(candidates([signal(habit, 100, 90)]), [])
  const [q] = candidates([signal(habit, 100, 150)])
  assert.equal(q.intent, 'recovery')
  assert.equal(q.target, 135)
})

test('selection rejects invented IDs, deduplicates and caps the total active load', () => {
  const cs = candidates(['a', 'b', 'c', 'd'].map((id) => signal({ id })))
  assert.equal(selectQuests(cs, ['invented', 'a', 'a', 'b', 'c', 'd'], [], today).length, 3)
  assert.deepEqual(selectQuests(cs, [], [], today), [])
  assert.equal(selectQuests(cs, ['a', 'b', 'c'], [history(), history({ statId: 'other2' })], today).length, 1)
  assert.deepEqual(selectQuests(cs, ['a'], [history(), history(), history()], today), [])
})

test('active conflicts and load are evaluated on the proposed quest date', () => {
  const future = history({ statId: 'tracker:practice', fromDate: addDays(today, 1), toDate: addDays(today, 1) })
  assert.equal(candidates([signal()], [future]).length, 1)
  assert.deepEqual(questCandidates(coachStats([signal()], today), [], 2, [future], today, addDays(today, 1)), [])
})

test('count precision and one-day hit rates survive a missing yesterday', () => {
  const s = signal({}, 3, 2)
  s.days.delete(addDays(today, -1))
  const [q] = candidates([s])
  assert.equal(Number.isInteger(q.target), true)
  assert.equal(coachStats([s], today)[0].history?.length, 0)
  assert.equal(coachStats([s], today)[0].observations?.length, 27)
})

test('selection allows at most one spending habit and respects yesterday\'s completion', () => {
  const cs = candidates(['a', 'b'].map((id) => signal({ id: `habit:${id}`, area: 'wealth', name: 'Discretionary spending', direction: 'down' }, 100, 150)))
  assert.equal(selectQuests(cs, cs.map((c) => c.statId), [], today).length, 1)
  const rested = history({ statId: 'habit:a', status: 'cleared', fromDate: addDays(today, -1), toDate: addDays(today, -1) })
  assert.deepEqual(selectQuests(cs, ['habit:a'], [rested], today), [])
})

test('same-day spending spikes use only prior observations and prefer the narrower app signal', () => {
  const overall = signal({ id: 'spend', area: 'wealth' }, 100, 100)
  const apps = signal({ id: 'spend:apps', area: 'wealth' }, 50, 50)
  overall.days.set(today, 1000)
  apps.days.set(today, 300)
  const spike = spendingSpike([overall, apps], today)!
  assert.equal(spike.signal.id, 'spend:apps')
  assert.equal(spike.usual, 50)
  assert.equal(spike.n, 28)
  assert.equal(spike.current, 300)
})

test('ordinary spending, insufficient history and zero baselines do not trigger a spike', () => {
  const ordinary = signal({ id: 'spend' }, 100, 100)
  ordinary.days.set(today, 150)
  assert.equal(spendingSpike([ordinary], today), null)
  const thin = signal({ id: 'spend', days: new Map([[today, 1000], [addDays(today, -1), 10]]) })
  assert.equal(spendingSpike([thin], today), null)
  const zero = signal({ id: 'spend' }, 0, 0)
  zero.days.set(today, 1000)
  assert.equal(spendingSpike([zero], today), null)
})

test('future quests do not consume today\'s values or clear early', () => {
  const q = { fromDate: addDays(today, 1), toDate: addDays(today, 1), agg: 'sum' as const, op: 'gte' as const, target: 5 }
  assert.deepEqual(questProgress(q, signal(), today), { value: null, status: 'active' })
})

test('missing or partial reduction data cannot earn completion; explicit zero can', () => {
  const q = { fromDate: addDays(today, -2), toDate: addDays(today, -1), agg: 'sum' as const, op: 'lte' as const, target: 50 }
  assert.deepEqual(questProgress(q, undefined, today), { value: null, status: 'unverified' })
  const s = signal({ days: new Map([[q.fromDate, 0]]) })
  assert.deepEqual(questProgress(q, s, today), { value: null, status: 'unverified' })
  s.days.set(q.toDate, 0)
  assert.deepEqual(questProgress(q, s, today), { value: 0, status: 'cleared' })
})

test('averaged increases wait for the complete quest window', () => {
  const q = { fromDate: today, toDate: addDays(today, 1), agg: 'avg' as const, op: 'gte' as const, target: 5 }
  const s = signal({ days: new Map([[today, 10], [q.toDate, 0]]) })
  assert.equal(questProgress(q, s, today).status, 'active')
  assert.equal(questProgress(q, s, addDays(today, 2)).status, 'cleared')
  s.days.delete(q.toDate)
  assert.deepEqual(questProgress(q, s, addDays(today, 2)), { value: null, status: 'unverified' })
})

test('late evidence only upgrades a judged quest to cleared', () => {
  const yesterday = addDays(today, -1)
  const q = { fromDate: yesterday, toDate: yesterday, agg: 'sum' as const, op: 'gte' as const, target: 8000 }
  const steps = (v?: number) => signal({ days: new Map(v == null ? [] : [[yesterday, v]]) })
  assert.deepEqual(lateClear({ ...q, status: 'failed' }, steps(9000), today), { value: 9000, status: 'cleared' }, 'a late import clears a recorded miss')
  assert.deepEqual(lateClear({ ...q, status: 'unverified' }, steps(8000), today), { value: 8000, status: 'cleared' }, 'a late import clears an unknown result')
  assert.equal(lateClear({ ...q, status: 'failed' }, steps(7000), today), null, 'a still-short total stays a miss')
  assert.equal(lateClear({ ...q, status: 'unverified' }, steps(100), today), null, 'late partial data never creates a new miss')
  assert.equal(lateClear({ ...q, status: 'cleared' }, steps(9000), today), null)
  assert.equal(lateClear({ ...q, status: 'cancelled' }, steps(9000), today), null, 'retired quests stay retired')
  const limit = { ...q, op: 'lte' as const, target: 500 }
  assert.equal(lateClear({ ...limit, status: 'unverified' }, steps(900), today), null, 'an over-limit late total never becomes a miss')
  assert.deepEqual(lateClear({ ...limit, status: 'unverified' }, steps(400), today), { value: 400, status: 'cleared' })
})

test('goal-linked candidates rank first and survive the 24-candidate cut', () => {
  const many = Array.from({ length: 30 }, (_, i) => signal({ id: `tracker:s${i}`, name: `Stat ${i}`, group: `s${i}` }, 60, 50 - i * 0.5))
  const goal = 'tracker:s0' // the smallest slip: last without a preference
  const plain = questCandidates(coachStats(many, today), [], 2, [], today)
  assert.equal(plain.length, 24)
  assert.ok(!plain.some((c) => c.statId === goal))
  const preferred = questCandidates(coachStats(many, today), [], 2, [], today, today, new Set([goal]))
  assert.equal(preferred[0].statId, goal)
  assert.equal(preferred.length, 24)
})

test('prefer never adds a candidate a safeguard excluded, and no preference changes nothing', () => {
  const sleep = signal({ id: 'tracker:sleep', name: 'Sleep hours', group: 'sleep' })
  const practice = signal()
  const got = questCandidates(coachStats([sleep, practice], today), [], 2, [], today, today, new Set(['tracker:sleep']))
  assert.deepEqual(got.map((c) => c.statId), ['tracker:practice'])
  const stats = coachStats([practice, signal({ id: 'tracker:other', name: 'Other', group: 'o' }, 60, 40)], today)
  assert.deepEqual(questCandidates(stats, [], 2, [], today, today, new Set()), questCandidates(stats, [], 2, [], today))
})

test('selectQuests keeps preferred picks within the cap and trims other picks first', () => {
  const pool = [1, 2, 3, 4].map((i) => signal({ id: `tracker:p${i}`, name: `P${i}`, group: `p${i}` }, 60, 40 + i))
  const cs = questCandidates(coachStats(pool, today), [], 2, [], today)
  const ids = cs.map((c) => c.statId)
  const goal = ids.at(-1)!
  const chosen = selectQuests(cs, ids, [], today, 3, new Set([goal]))
  assert.equal(chosen.length, 3)
  assert.equal(chosen[0].statId, goal)
  assert.equal(selectQuests(cs, ids, [history(), history(), history()], today, 3, new Set([goal])).length, 0)
})
