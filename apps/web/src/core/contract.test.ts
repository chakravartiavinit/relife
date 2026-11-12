import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ACTIVITY_KINDS as CONTRACT_KINDS, TodayView } from '@relife/contract'
import { ACTIVITY_KINDS } from '@/domain/activity'
import { companionPlan } from '@/domain/companion'

// companionView() is typed as TodayView (a type error if it drifts). These two pure checks cover the runtime side
// without touching the database, as the rest of `npm test` does.

test('the contract lists the same activity kinds as the domain', () => {
  assert.deepEqual([...CONTRACT_KINDS], [...ACTIVITY_KINDS])
})

test('what companionPlan produces parses as the routines and goals of a TodayView', () => {
  const at = new Date('2026-11-12T13:30:00.000Z')
  const plan = companionPlan([
    { scheduleId: '9f1b3d58-4e6a-4c20-b7d9-2a5c8e0f1b05', name: 'Stretch', kind: 'habit', area: 'health', occurrence: at, status: 'pending' },
    { scheduleId: 'b2e4f6a8-0c1d-4a35-8b79-5d1e3f7a9c07', name: 'Water', kind: 'habit', area: 'health', occurrence: at, status: 'pending', trackerSlug: 'water', target: 2500, unit: 'ml' },
  ], () => 1250, () => '7:00 pm')
  const view = {
    today: '2026-11-12', name: 'A', ...plan, left: plan.left, quests: [], focus: { seconds: 0, byKind: [] },
    character: { level: 1, title: 'Newcomer', total: 0, floor: 0, next: 100, progress: 0, todayXp: 0, streak: 0, best: 0, doneToday: false, freezes: 0 },
  }
  const parsed = TodayView.safeParse(JSON.parse(JSON.stringify(view)))
  assert.ok(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3)))
})
