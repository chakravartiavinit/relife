import assert from 'node:assert/strict'
import test from 'node:test'
import { and, eq } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run only against the private local mock database:
 *
 * set -a; . /var/tmp/relife-preview-mock.env; set +a
 * RELIFE_GOALS_INTEGRATION=1 npx tsx --test src/core/goals.integration.test.ts
 */
const enabled = process.env.RELIFE_GOALS_INTEGRATION === '1'
const now = new Date('2026-11-11T12:00:00.000Z')
const today = '2026-11-11'
const yesterday = '2026-11-10'

function assertLocalMockBase() {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const raw = process.env.DATABASE_URL
  assert.ok(raw, 'integration tests require DATABASE_URL')
  const url = new URL(raw)
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'integration tests require a loopback database host')
  assert.equal(url.port, '5442', 'integration tests require the local Docker PostgreSQL port')
  assert.ok(url.pathname.length > 1 && !url.pathname.endsWith('_mock'), 'DATABASE_URL must be the local mock base; src/db appends _mock')
}

test('PostgreSQL outcome goals: cap, versions, ownership, reviews, check-ins and quest ranking', { skip: !enabled }, async () => {
  assertLocalMockBase()
  const { db, databaseUrl, schema, sql } = await import('@/db')
  const effective = new URL(databaseUrl)
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(effective.hostname))
  assert.equal(effective.port, '5442')
  assert.ok(effective.pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')

  const { addDays } = await import('./time')
  const { buildRRule } = await import('@/domain/recurrence')
  const goals = await import('./goals')
  const { acceptInsight } = await import('./insights')
  const { systemTick } = await import('./system')
  const { weeklyReview } = await import('@/ai/jobs/weekly-review')
  assert.equal((await import('./notify')).telegramConfigured(), false, 'run without Telegram keys')
  assert.equal((await import('@/ai/models')).aiEnabled('plan'), false, 'run without an AI model')

  const run = `goals-integration-${crypto.randomUUID().slice(0, 8)}`
  const userIds: string[] = []
  const cleanup = async () => {
    for (const userId of userIds.reverse()) {
      await db.delete(schema.goalReviews).where(eq(schema.goalReviews.userId, userId))
      await db.delete(schema.goalCheckIns).where(eq(schema.goalCheckIns.userId, userId))
      await db.delete(schema.goals).where(eq(schema.goals.userId, userId))
      await db.delete(schema.notifications).where(eq(schema.notifications.userId, userId))
      await db.delete(schema.xpEvents).where(eq(schema.xpEvents.userId, userId))
      await db.delete(schema.chests).where(eq(schema.chests.userId, userId))
      await db.delete(schema.insights).where(eq(schema.insights.userId, userId))
      await db.delete(schema.systemQuests).where(eq(schema.systemQuests.userId, userId))
      await db.delete(schema.entries).where(eq(schema.entries.userId, userId))
      await db.delete(schema.trackers).where(eq(schema.trackers.userId, userId))
      await db.delete(schema.schedules).where(eq(schema.schedules.userId, userId))
      await db.delete(schema.users).where(eq(schema.users.id, userId))
    }
  }
  const createUser = async (suffix: string) => {
    const [user] = await db.insert(schema.users).values({ name: `Goals Integration ${suffix}`, timezone: 'Asia/Kolkata', baseCurrency: 'INR', profile: { onboardedAt: now.toISOString() } }).returning()
    userIds.push(user.id)
    return user
  }
  const routine = async (userId: string, name: string) => (await db.insert(schema.schedules).values({
    userId, name, kind: 'routine', category: 'skills', rrule: buildRRule({ freq: 'daily', times: ['09:00'], start: addDays(today, -40) }),
  }).returning())[0]
  /** A tracker with a 28-day usual of 60 and a recent week of `recent`: a quest candidate for coachStats. */
  const tracker = async (userId: string, slug: string, name: string, recent: number) => {
    const [t] = await db.insert(schema.trackers).values({ userId, slug: `${run}-${slug}`, name, category: 'skills', target: 1 }).returning()
    await db.insert(schema.entries).values(Array.from({ length: 35 }, (_, k) => {
      const i = 35 - k
      return { userId, trackerId: t.id, localDate: addDays(today, -i), value: i > 7 ? 60 : recent, source: run, verified: true }
    }))
    return t
  }
  const checkInGoal = (title: string, actions: { kind: 'schedule' | 'tracker'; id: string }[]) => ({
    title, reason: 'Integration', area: 'skills' as const, measureKind: 'check_in' as const, trackerId: null, measureName: 'Score', unit: 'pts',
    direction: 'increase' as const, target: 80, rangeLow: null, rangeHigh: null, baselineValue: 50, baselineDate: today, baselineHow: 'Timed test',
    targetDate: addDays(today, 60), cadence: 'weekly' as const, actions,
  })

  try {
    // 1. The 3-active cap holds under concurrent saves; stale versions are rejected.
    const owner = await createUser('owner')
    const r1 = await routine(owner.id, 'Drill')
    const saves = await Promise.all([1, 2, 3, 4].map((n) => goals.saveGoal(owner, checkInGoal(`Goal ${n}`, [{ kind: 'schedule', id: r1.id }]), now)))
    assert.equal(saves.filter((s) => s.status === 'saved').length, 3)
    assert.equal(saves.filter((s) => s.status === 'invalid').length, 1)
    const active = await db.select().from(schema.goals).where(and(eq(schema.goals.userId, owner.id), eq(schema.goals.status, 'active')))
    assert.equal(active.length, 3)
    const goal = active[0]
    assert.equal((await goals.saveGoal(owner, { ...checkInGoal('Renamed', goal.actions), id: goal.id, version: goal.version + 5 }, now)).status, 'stale')
    const edited = await goals.saveGoal(owner, { ...checkInGoal('Renamed', goal.actions), baselineValue: 999, id: goal.id, version: goal.version }, now)
    assert.equal(edited.status, 'saved')
    const [afterEdit] = await db.select().from(schema.goals).where(eq(schema.goals.id, goal.id))
    assert.equal(afterEdit.title, 'Renamed')
    assert.equal(afterEdit.baselineValue, 50, 'baseline is locked after activation')
    assert.equal(afterEdit.version, goal.version + 1)

    // 2. Foreign IDs are rejected.
    const stranger = await createUser('stranger')
    assert.equal((await goals.setGoalStatus(stranger, { goalId: goal.id, version: afterEdit.version, status: 'paused' }, now)).status, 'not_found')
    assert.equal((await goals.recordCheckIn(stranger, { goalId: goal.id, localDate: today, value: 60 }, now)).status, 'not_found')
    assert.equal((await goals.saveGoal(stranger, { ...checkInGoal('Steal', goal.actions), id: goal.id, version: afterEdit.version }, now)).status, 'not_found')
    assert.equal((await goals.saveGoal(stranger, checkInGoal('Foreign link', goal.actions), now)).status, 'invalid', 'cannot link another user\'s routine')

    // 3. Reviews: idempotent per day; decisions persist with history; a check-in refreshes an undecided snapshot.
    await db.update(schema.goals).set({ nextReviewOn: today }).where(eq(schema.goals.id, goal.id))
    const first = await goals.prepareGoalReviews(owner, now, goal.id)
    const again = await goals.prepareGoalReviews(owner, now, goal.id)
    assert.equal(first.length, 1)
    assert.equal(again[0].review.id, first[0].review.id)
    assert.equal(first[0].review.snapshot.outcome.status, 'not_enough_data')
    assert.equal((await goals.decideReview(stranger, { reviewId: first[0].review.id, goalVersion: afterEdit.version, decision: 'keep' }, now)).status, 'not_found')
    assert.equal((await goals.recordCheckIn(owner, { goalId: goal.id, localDate: yesterday, value: 66 }, now)).status, 'saved')
    const [refreshed] = await db.select().from(schema.goalReviews).where(eq(schema.goalReviews.id, first[0].review.id))
    assert.equal(refreshed.snapshot.outcome.current, 66)
    assert.equal(refreshed.snapshot.outcome.status, 'toward')
    const change = await goals.decideReview(owner, { reviewId: first[0].review.id, goalVersion: afterEdit.version, decision: 'change', change: { target: 90 } }, now)
    assert.equal(change.status, 'saved')
    assert.equal((await goals.decideReview(owner, { reviewId: first[0].review.id, goalVersion: afterEdit.version + 1, decision: 'keep' }, now)).status, 'already_decided')
    const [decided] = await db.select().from(schema.goalReviews).where(eq(schema.goalReviews.id, first[0].review.id))
    assert.equal(decided.decision, 'change')
    assert.equal(decided.before?.target, 80)
    assert.equal(decided.after?.target, 90)

    // 4. Goal drafts are never accepted by the generic insight path.
    const [draft] = await db.insert(schema.insights).values({
      userId: owner.id, kind: 'plan', title: 'Goal draft', body: run, status: 'pending',
      payload: { goalDraft: { title: 'Draft', reason: 'x', area: 'skills', measure: { checkIn: 'Score' }, direction: 'increase', target: 2, targetDate: addDays(today, 30), cadence: 'weekly', actions: [] } },
    }).returning()
    assert.equal(await acceptInsight(owner, draft.id), null)
    const [stillPending] = await db.select().from(schema.insights).where(eq(schema.insights.id, draft.id))
    assert.equal(stillPending.status, 'pending')

    // 5. Without a model, the weekly review writes the template once.
    const reviewer = await createUser('reviewer')
    const r2 = await routine(reviewer.id, 'Drill')
    const saved = await goals.saveGoal(reviewer, checkInGoal('Weekly', [{ kind: 'schedule', id: r2.id }]), now)
    assert.equal(saved.status, 'saved')
    await db.update(schema.goals).set({ nextReviewOn: today }).where(eq(schema.goals.userId, reviewer.id))
    const insight = await weeklyReview(reviewer, now)
    assert.ok(insight)
    assert.equal(insight.title, 'Goal check-in')
    assert.equal(insight.payload.review?.goals?.length, 1)
    assert.equal(await weeklyReview(reviewer, now), null, 'deduped by review:<date>')

    // 6. systemTick ranks a goal-linked tracker first, never adds a sensitive tracker, and respects the recovery pause.
    const player = await createUser('player')
    const slips = await Promise.all([40, 42, 44, 46].map((recent, i) => tracker(player.id, `p${i}`, `Practice ${i}`, recent)))
    const sleep = await tracker(player.id, 'sleep', 'Sleep hours', 40)
    const linked = slips[3] // the smallest slip: without the goal it would rank fourth and be cut by the cap
    assert.equal((await goals.saveGoal(player, checkInGoal('Practice more', [{ kind: 'tracker', id: linked.id }, { kind: 'tracker', id: sleep.id }]), now)).status, 'saved')
    await systemTick(player, now)
    const dailies = await db.select().from(schema.systemQuests).where(and(eq(schema.systemQuests.userId, player.id), eq(schema.systemQuests.kind, 'daily'), eq(schema.systemQuests.fromDate, today)))
    assert.ok(dailies.length <= 3)
    assert.ok(dailies.some((q) => q.statId === `tracker:${linked.slug}`), 'goal-linked candidate survives the cap')
    assert.ok(dailies.find((q) => q.statId === `tracker:${linked.slug}`)?.reason?.includes('Supports your goal: Practice more.'))
    assert.ok(!dailies.some((q) => q.statId === `tracker:${sleep.slug}`), 'sensitive goal trackers never become quests')

    const paused = await createUser('paused')
    const pausedTrackers = await Promise.all([40, 46].map((recent, i) => tracker(paused.id, `q${i}`, `Practice ${i}`, recent)))
    assert.equal((await goals.saveGoal(paused, checkInGoal('Paused goal', [{ kind: 'tracker', id: pausedTrackers[1].id }]), now)).status, 'saved')
    await db.insert(schema.systemQuests).values({
      userId: paused.id, kind: 'daily', fromDate: yesterday, toDate: yesterday, statId: 'tracker:fixture', statName: 'Fixture', area: 'skills', unit: null,
      op: 'gte', agg: 'sum', target: 4, baseline: 4, rank: 'E', xp: 20, title: 'Fixture', reason: run, status: 'failed', progress: 1, ref: `${run}:missed`,
    })
    await systemTick(paused, now)
    const pausedDailies = await db.select().from(schema.systemQuests).where(and(eq(schema.systemQuests.userId, paused.id), eq(schema.systemQuests.fromDate, today)))
    assert.equal(pausedDailies.length, 0, 'goal linkage never bypasses the recovery pause')
  } finally {
    try { await cleanup() } finally { await sql.end() }
  }
})
