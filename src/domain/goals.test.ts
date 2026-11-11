import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '@/core/time'
import {
  GOAL_FOOTNOTE, actionAdherence, checkGoalDraft, goalSnapshot, goalStatIds, isActivityMeasure, isSensitiveMeasure,
  minObservations, nextReviewOn, outcomeNow, outcomeStatus, reviewLines, trackerBaseline, validateGoal,
  type GoalInput, type GoalLike, type RawGoalDraft,
} from './goals'

const today = '2026-11-11'
const series = (n: number, value: (i: number) => number, end = today) => {
  const m = new Map<string, number>()
  for (let i = 1; i <= n; i++) m.set(addDays(end, -i), value(i))
  return m
}
const goal = (o: Partial<GoalLike> = {}): GoalLike => ({
  title: 'Type faster', measureKind: 'tracker', measureName: 'Typing speed', unit: 'wpm', direction: 'increase',
  target: 80, rangeLow: null, rangeHigh: null, baselineValue: 60, targetDate: '2027-02-01', cadence: 'weekly', ...o,
})
const ids = { s1: '11111111-1111-4111-8111-111111111111', t1: '22222222-2222-4222-8222-222222222222', t2: '33333333-3333-4333-8333-333333333333' }
const input = (o: Partial<GoalInput> = {}): GoalInput => ({
  title: 'Type faster', reason: 'Work', area: 'skills', measureKind: 'tracker', trackerId: ids.t1, measureName: 'Typing speed', unit: 'wpm',
  direction: 'increase', target: 80, rangeLow: null, rangeHigh: null, baselineValue: 60, baselineDate: today, baselineHow: 'Average',
  targetDate: '2027-02-01', cadence: 'weekly', actions: [{ kind: 'schedule', id: ids.s1 }], ...o,
})
const ctx = { today, activating: true, activeCount: 0, schedules: [{ id: ids.s1, kind: 'routine', active: true }], trackers: [{ id: ids.t1 }, { id: ids.t2 }] }

test('baseline uses the 28 complete days before the start, skips missing days and needs 7 records', () => {
  const days = series(28, (i) => (i % 2 ? 50 : 70))
  days.set(today, 1_000) // today is incomplete and excluded
  days.set(addDays(today, -29), 1_000) // outside the window
  const b = trackerBaseline(days, today)
  assert.equal(b.value, 60)
  assert.equal(b.observations, 28)
  assert.equal(b.from, '2026-10-14')
  assert.equal(b.to, '2026-11-10')
  const sparse = trackerBaseline(series(6, () => 0), today)
  assert.equal(sparse.value, null, 'six records are not enough, even when they are zero')
  assert.equal(sparse.observations, 6)
  assert.equal(trackerBaseline(series(7, () => 0), today).value, 0, 'zero is a real value, not missing')
})

test('minimum current records scale with the window', () => {
  assert.deepEqual([7, 14, 28].map(minObservations), [3, 6, 12])
})

test('increase and decrease statuses use a 10% band of the gap', () => {
  const now = (value: number | null, observations = 5) => ({ value, observations, needed: 3 })
  assert.equal(outcomeStatus(goal(), now(80)).status, 'met')
  assert.equal(outcomeStatus(goal(), now(62)).status, 'toward')
  assert.equal(outcomeStatus(goal(), now(61)).status, 'flat')
  assert.equal(outcomeStatus(goal(), now(58)).status, 'away')
  assert.equal(outcomeStatus(goal(), now(70, 2)).status, 'not_enough_data')
  assert.equal(outcomeStatus(goal(), now(null, 0)).status, 'not_enough_data')
  const down = goal({ direction: 'decrease', baselineValue: 100, target: 50 })
  assert.equal(outcomeStatus(down, now(90)).status, 'toward')
  assert.equal(outcomeStatus(down, now(50)).status, 'met')
  assert.equal(outcomeStatus(down, now(106)).status, 'away')
  assert.equal(outcomeStatus(goal(), now(200)).progressShare, 1)
  assert.equal(outcomeStatus(goal(), now(-500)).progressShare, -1)
})

test('range statuses measure distance to the nearest bound, and leaving the range is away', () => {
  const now = (value: number) => ({ value, observations: 5, needed: 3 })
  const r = goal({ direction: 'range', target: null, rangeLow: 7, rangeHigh: 8, baselineValue: 5 })
  assert.equal(outcomeStatus(r, now(7.5)).status, 'met')
  assert.equal(outcomeStatus(r, now(6)).status, 'toward')
  assert.equal(outcomeStatus(r, now(5.1)).status, 'flat')
  assert.equal(outcomeStatus(r, now(4)).status, 'away')
  const inside = goal({ direction: 'range', target: null, rangeLow: 7, rangeHigh: 8, baselineValue: 7.5 })
  assert.equal(outcomeStatus(inside, now(8.1)).status, 'away')
})

test('tracker outcome uses the complete days of the period; check-ins use the latest in the period', () => {
  const days = series(10, (i) => i)
  const t = outcomeNow(goal(), { days }, today)
  assert.equal(t.observations, 7)
  assert.equal(t.value, 4)
  assert.equal(t.needed, 3)
  const c = outcomeNow(goal({ measureKind: 'check_in' }), { checkIns: [
    { localDate: '2026-11-04', value: 1 }, // the day before the window: excluded
    { localDate: '2026-11-08', value: 3 },
    { localDate: '2026-11-11', value: 4 },
  ] }, today)
  assert.equal(c.value, 4)
  assert.equal(c.observations, 2)
  assert.deepEqual(outcomeNow(goal({ measureKind: 'check_in' }), { checkIns: [] }, today), { value: null, observations: 0, needed: 1, latestCheckIn: null })
})

test('adherence: skips leave both counts, unrecorded tracker days are no record, missing actions are unavailable', () => {
  const window = { from: '2026-11-04', to: '2026-11-10' }
  const s = actionAdherence({ kind: 'schedule', id: 'a' }, { kind: 'schedule', name: 'Drill', statuses: ['done', 'done', 'skipped', 'missed', 'none', 'done', 'done'] }, window)
  assert.equal(s.due, 5)
  assert.equal(s.done, 4)
  assert.equal(s.rate, 0.8)
  const t = actionAdherence({ kind: 'tracker', id: 'b' }, { kind: 'tracker', name: 'Practice', days: new Map([['2026-11-05', 30], ['2026-11-06', 10]]), target: 20, direction: 'up' }, window)
  assert.equal(t.recordedDays, 2)
  assert.equal(t.metDays, 1)
  assert.equal(t.windowDays, 7)
  const gone = actionAdherence({ kind: 'schedule', id: 'c' }, null, window)
  assert.equal(gone.available, false)
  assert.equal(gone.rate, null)
})

test('validateGoal checks fields, directions, links, outcome ≠ action and the active cap', () => {
  assert.deepEqual(validateGoal(input(), ctx), {})
  assert.ok(validateGoal(input({ title: ' ' }), ctx).title)
  assert.ok(validateGoal(input({ target: 50 }), ctx).target)
  assert.ok(validateGoal(input({ direction: 'decrease', target: 70 }), ctx).target)
  assert.ok(validateGoal(input({ direction: 'range', target: null, rangeLow: 9, rangeHigh: 8 }), ctx).rangeLow)
  assert.ok(validateGoal(input({ baselineDate: '2026-11-12' }), ctx).baselineDate)
  assert.ok(validateGoal(input({ targetDate: today }), ctx).targetDate)
  assert.ok(validateGoal(input({ targetDate: addDays(today, 731) }), ctx).targetDate)
  assert.ok(validateGoal(input({ actions: [] }), ctx).actions)
  assert.ok(validateGoal(input({ actions: [{ kind: 'tracker', id: ids.t1 }] }), ctx).actions, 'outcome tracker cannot be an action')
  assert.ok(validateGoal(input({ actions: [{ kind: 'schedule', id: ids.s1 }, { kind: 'schedule', id: ids.s1 }] }), ctx).actions)
  assert.ok(validateGoal(input(), { ...ctx, schedules: [{ id: ids.s1, kind: 'medicine', active: true }] }).actions, 'only routines')
  assert.ok(validateGoal(input({ actions: [{ kind: 'tracker', id: ids.t2 }, { kind: 'schedule', id: ids.s1 }, { kind: 'tracker', id: ids.t2 }, { kind: 'schedule', id: ids.s1 }] }), ctx).actions)
  assert.ok(validateGoal(input(), { ...ctx, activeCount: 3 }).form)
  assert.equal(validateGoal(input(), { ...ctx, activeCount: 3, activating: false }).form, undefined)
})

test('nextReviewOn lands on a Sunday at least 4 days out, across month and year ends', () => {
  assert.equal(nextReviewOn('2026-11-11', 'weekly'), '2026-11-15') // Wed → Sun
  assert.equal(nextReviewOn('2026-11-13', 'weekly'), '2026-11-22') // Fri: Sun 15 is too soon
  assert.equal(nextReviewOn('2026-12-29', 'weekly'), '2027-01-03')
  assert.equal(nextReviewOn('2026-01-30', 'fortnightly'), '2026-02-15')
  assert.equal(nextReviewOn('2026-11-15', 'monthly'), '2026-12-13')
  for (const d of ['2026-02-27', '2026-12-31', '2027-01-01']) assert.equal(new Date(`${nextReviewOn(d, 'weekly')}T00:00:00Z`).getUTCDay(), 0)
})

test('review lines are plain, honest about missing data and never causal', () => {
  const g = goal()
  const snap = goalSnapshot(g, { days: series(7, () => 70) }, [{ link: { kind: 'schedule', id: 'a' }, source: { kind: 'schedule', name: 'Drill', statuses: ['done', 'done', 'done', 'done', 'done', 'missed'] } }], today, false)
  const { lines, prompt } = reviewLines(g, snap)
  assert.match(lines[0], /Drill: done on 5 of 6 due days/)
  assert.match(lines[1], /Outcome: 70 wpm \(7 recordings\) vs 60 wpm at baseline/)
  assert.equal(lines.at(-1), GOAL_FOOTNOTE)
  assert.match(prompt, /kept the actions and the outcome moved/)
  const empty = goalSnapshot(g, { days: new Map() }, [], today, false)
  assert.match(reviewLines(g, empty).lines[0], /Not enough data: 0 recordings, 3 needed/)
  const ci = goal({ measureKind: 'check_in' })
  assert.match(reviewLines(ci, goalSnapshot(ci, { checkIns: [] }, [], today, false)).lines[0], /no check-in for this period/)
  for (const adherence of [0.9, 0.6, 0.2]) {
    for (const status of ['met', 'toward', 'flat', 'away', 'not_enough_data'] as const) {
      const s = { ...snap, adherence, outcome: { ...snap.outcome, status } }
      const text = [...reviewLines(g, s).lines.filter((l) => l !== GOAL_FOOTNOTE), reviewLines(g, s).prompt].join(' ')
      assert.doesNotMatch(text, /\bbecause\b|\bcaused\b|\bled to\b|\bthanks to\b|\bbehind\b|\bfailed\b|off track/i)
    }
  }
})

test('isSensitiveMeasure matches the old canCoach pattern', () => {
  for (const t of ['tracker:sleep Sleep hours', 'Mood', 'Body weight', 'Blood pressure', 'HRV', 'Supplements']) assert.equal(isSensitiveMeasure(t), true, t)
  for (const t of ['Typing speed', 'Steps', 'Guitar tempo', 'Pages read']) assert.equal(isSensitiveMeasure(t), false, t)
})

test('activity measures are flagged, results are not', () => {
  assert.equal(isActivityMeasure({ slug: 'github.commits', kind: 'number' }), true)
  assert.equal(isActivityMeasure({ slug: 'guitar', kind: 'duration' }), true)
  assert.equal(isActivityMeasure({ slug: 'practice.minutes', kind: 'number' }), true)
  assert.equal(isActivityMeasure({ slug: 'typing-wpm', kind: 'number' }), false)
})

test('checkGoalDraft keeps known links and rejects unsafe or unknown drafts', () => {
  const dctx = {
    today,
    trackers: [{ id: ids.t1, slug: 'typing-wpm', name: 'Typing speed', unit: 'wpm', category: 'skills' as const }, { id: ids.t2, slug: 'steps', name: 'Steps', unit: null, category: 'health' as const }],
    routines: [{ id: ids.s1, name: 'Typing drill', category: 'skills' as const }],
  }
  const raw = (o: Partial<RawGoalDraft> = {}): RawGoalDraft => ({
    title: 'Type faster', reason: 'Work', area: 'skills', measure: { tracker: 'typing-wpm' }, direction: 'increase', target: 80,
    targetDate: '2027-02-01', cadence: 'weekly', actions: [{ routine: ids.s1 }], ...o,
  })
  const ok = checkGoalDraft(raw(), dctx)
  assert.equal(ok.ok, true)
  if (ok.ok) assert.deepEqual(ok.draft.actions, [{ kind: 'schedule', id: ids.s1 }])
  assert.equal(checkGoalDraft(raw({ measure: { tracker: 'nope' } }), dctx).ok, false)
  assert.equal(checkGoalDraft(raw({ actions: [{ routine: 'x' }] }), dctx).ok, false)
  assert.equal(checkGoalDraft(raw({ actions: [{ tracker: 'typing-wpm' }] }), dctx).ok, false, 'outcome is also an action')
  assert.equal(checkGoalDraft(raw({ title: 'Lose weight' }), dctx).ok, false)
  assert.equal(checkGoalDraft(raw({ measure: { checkIn: 'Waist size', unit: 'cm' } }), dctx).ok, false)
  assert.equal(checkGoalDraft(raw({ reason: 'Take 500 mg less' }), dctx).ok, false)
  assert.equal(checkGoalDraft(raw({ area: 'health', measure: { checkIn: 'Resting effort' } }), dctx).ok, false, 'health outcomes other than steps')
  assert.equal(checkGoalDraft(raw({ area: 'health', measure: { tracker: 'steps' } }), dctx).ok, true)
  assert.equal(checkGoalDraft(raw({ targetDate: today }), dctx).ok, false)
  assert.equal(checkGoalDraft(raw({ direction: 'range', target: undefined, rangeLow: 9, rangeHigh: 8 }), dctx).ok, false)
})

test('goalStatIds maps tracker actions and quantity routines of active goals only', () => {
  const trackers = [{ id: ids.t1, slug: 'typing-wpm' }, { id: ids.t2, slug: 'water' }]
  const schedules = [{ id: ids.s1, meta: { trackerSlug: 'water' } }, { id: 'plain', meta: {} }]
  const m = goalStatIds([
    { status: 'active', title: 'A', actions: [{ kind: 'tracker', id: ids.t1 }, { kind: 'schedule', id: ids.s1 }, { kind: 'schedule', id: 'plain' }] },
    { status: 'paused', title: 'B', actions: [{ kind: 'tracker', id: ids.t2 }] },
  ], schedules, trackers)
  assert.deepEqual([...m], [['tracker:typing-wpm', 'A'], ['tracker:water', 'A']])
})
