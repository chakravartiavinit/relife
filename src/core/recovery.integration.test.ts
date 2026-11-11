import assert from 'node:assert/strict'
import test from 'node:test'
import { and, eq } from 'drizzle-orm'

/**
 * This suite is deliberately opt-in: normal `npm test` must never import the DB
 * client or make a connection. Run only with the private local mock environment:
 *
 * set -a; . /var/tmp/relife-preview-mock.env; set +a
 * RELIFE_RECOVERY_INTEGRATION=1 npx tsx --test src/core/recovery.integration.test.ts
 */
const enabled = process.env.RELIFE_RECOVERY_INTEGRATION === '1'
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

test('PostgreSQL recovery transactions remain stable, local, and idempotent', { skip: !enabled }, async () => {
  // This guard executes before the dynamic imports below, so a normal suite never loads src/db.
  assertLocalMockBase()

  const { db, databaseUrl, schema } = await import('@/db')
  const effective = new URL(databaseUrl)
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(effective.hostname))
  assert.equal(effective.port, '5442')
  assert.ok(effective.pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')

  const { addDays } = await import('./time')
  const { loadSignals } = await import('./patterns')
  const { coachStats } = await import('@/domain/coach')
  const { chooseRecovery, getRecovery, insertCoachQuests, prepareRecovery, recoveryPaused } = await import('./recovery')

  const run = `recovery-integration:${crypto.randomUUID()}`
  const userIds: string[] = []
  const cleanup = async () => {
    for (const userId of userIds.reverse()) {
      await db.delete(schema.notifications).where(eq(schema.notifications.userId, userId))
      await db.delete(schema.insights).where(eq(schema.insights.userId, userId))
      await db.delete(schema.systemQuests).where(eq(schema.systemQuests.userId, userId))
      await db.delete(schema.entries).where(eq(schema.entries.userId, userId))
      await db.delete(schema.trackers).where(eq(schema.trackers.userId, userId))
      await db.delete(schema.users).where(eq(schema.users.id, userId))
    }
  }

  const createUser = async (suffix: string, timezone = 'Asia/Kolkata') => {
    const [user] = await db.insert(schema.users).values({
      name: `Recovery Integration ${suffix}`,
      timezone,
      baseCurrency: 'INR',
      profile: { onboardedAt: now.toISOString() },
    }).returning()
    userIds.push(user.id)
    return user
  }

  const addQuest = (userId: string, ref: string, values: Record<string, unknown>) =>
    db.insert(schema.systemQuests).values({
      userId, kind: 'daily', fromDate: yesterday, toDate: yesterday,
      statId: 'tracker:fixture', statName: 'Fixture', area: 'skills', unit: null,
      op: 'gte', agg: 'sum', target: 4, baseline: 4, rank: 'E', xp: 20,
      title: 'Push 4 commits', reason: run, status: 'failed', progress: 1, ref,
      ...values,
    } as typeof schema.systemQuests.$inferInsert).returning()

  const createEligibleFixture = async (suffix: string) => {
    const user = await createUser(suffix)
    const [commits] = await db.insert(schema.trackers).values({
      userId: user.id, slug: `${run}:${suffix}:commits`, name: 'Practice commits', category: 'skills', target: 1,
    }).returning()
    const entries: (typeof schema.entries.$inferInsert)[] = []
    for (let i = 35; i >= 0; i--) {
      const day = addDays(today, -i)
      entries.push({
        userId: user.id, trackerId: commits.id, localDate: day,
        value: day === today ? 0 : day === yesterday || i <= 7 ? 1 : 4,
        source: run, verified: true,
      })
    }
    await db.insert(schema.entries).values(entries)
    const [parent] = await addQuest(user.id, `${run}:${suffix}:parent`, {
      statId: `tracker:${run}:${suffix}:commits`, statName: 'Practice commits',
    })
    const { signals } = await loadSignals(user, now)
    const prepared = await prepareRecovery(user, now, signals, coachStats(signals, today))
    assert.ok(prepared, 'verified failed daily creates a recovery decision')
    return { user, commits, parent, signals, prepared }
  }

  const createUnavailableFixture = async (suffix: string) => {
    const user = await createUser(suffix)
    const [weight] = await db.insert(schema.trackers).values({
      userId: user.id, slug: `${run}:${suffix}:weight`, name: 'Weight', category: 'health', unit: 'kg', target: 72, direction: 'down', aggregate: 'last',
    }).returning()
    const entries: (typeof schema.entries.$inferInsert)[] = []
    for (let i = 35; i >= 0; i--) entries.push({ userId: user.id, trackerId: weight.id, localDate: addDays(today, -i), value: 72, source: run, verified: true })
    await db.insert(schema.entries).values(entries)
    await addQuest(user.id, `${run}:${suffix}:parent`, {
      statId: `tracker:${run}:${suffix}:weight`, statName: 'Weight', area: 'health', unit: 'kg', op: 'lte', target: 71,
    })
    const { signals } = await loadSignals(user, now)
    const prepared = await prepareRecovery(user, now, signals, coachStats(signals, today))
    assert.ok(prepared)
    assert.equal(prepared.preview, null, 'sensitive data never creates a smaller-step preview')
    return { user, prepared }
  }

  try {
    // jsonb normalizes object-key order. Two serialized concurrent prepares must retain version 1.
    const primary = await createUser('primary')
    const [commits] = await db.insert(schema.trackers).values({
      userId: primary.id, slug: `${run}:primary:commits`, name: 'Practice commits', category: 'skills', target: 1,
    }).returning()
    const entries: (typeof schema.entries.$inferInsert)[] = []
    for (let i = 35; i >= 0; i--) {
      const day = addDays(today, -i)
      entries.push({ userId: primary.id, trackerId: commits.id, localDate: day, value: day === today ? 0 : day === yesterday || i <= 7 ? 1 : 4, source: run, verified: true })
    }
    await db.insert(schema.entries).values(entries)
    const [parent] = await addQuest(primary.id, `${run}:primary:parent`, {
      statId: `tracker:${run}:primary:commits`, statName: 'Practice commits',
    })
    const [legacy] = await addQuest(primary.id, `${run}:primary:legacy`, {
      kind: 'penalty', fromDate: today, toDate: today, statId: 'legacy', statName: 'Legacy penalty', status: 'active', progress: null, xp: 25,
    })
    const preservedResolvedAt = new Date('2026-11-01T12:00:00.000Z')
    const [alreadyResolved] = await addQuest(primary.id, `${run}:primary:resolved`, {
      kind: 'penalty', fromDate: yesterday, toDate: yesterday, statId: 'resolved', statName: 'Resolved penalty history', status: 'cleared', xp: 75, resolvedAt: preservedResolvedAt,
    })
    const [unknown] = await addQuest(primary.id, `${run}:primary:unknown`, {
      statId: 'missing', statName: 'Missing data', progress: null, resolvedAt: preservedResolvedAt,
    })
    const { signals } = await loadSignals(primary, now)
    const stats = coachStats(signals, today)
    const [first, second] = await Promise.all([
      prepareRecovery(primary, now, signals, stats),
      prepareRecovery(primary, now, signals, stats),
    ])
    assert.ok(first && second)
    assert.equal(first.id, second.id, 'concurrent prepares share one persisted decision')
    assert.equal(first.version, 1, 'first persisted preview starts at version 1')
    assert.equal(second.version, 1, 'JSONB round-trip does not spuriously change preview version')
    const repeated = await prepareRecovery(primary, now, signals, stats)
    assert.equal(repeated?.version, 1, 'repeated prepare keeps the JSONB preview version stable')
    assert.equal(await recoveryPaused(primary, today), true)
    assert.equal(await recoveryPaused(primary, addDays(today, 1)), false, 'recovery pause expires on the next local date')

    const [legacyAfter, resolvedAfter, unknownAfter] = await Promise.all([
      db.select().from(schema.systemQuests).where(eq(schema.systemQuests.id, legacy.id)).then((rows) => rows[0]),
      db.select().from(schema.systemQuests).where(eq(schema.systemQuests.id, alreadyResolved.id)).then((rows) => rows[0]),
      db.select().from(schema.systemQuests).where(eq(schema.systemQuests.id, unknown.id)).then((rows) => rows[0]),
    ])
    assert.equal(legacyAfter.status, 'cancelled')
    assert.equal(legacyAfter.xp, 25, 'retirement keeps legacy XP metadata')
    assert.equal(resolvedAfter.status, 'cleared')
    assert.equal(resolvedAfter.xp, 75)
    assert.equal(resolvedAfter.resolvedAt?.getTime(), preservedResolvedAt.getTime(), 'resolved history is unchanged')
    assert.equal(unknownAfter.status, 'unverified')
    assert.equal(unknownAfter.resolvedAt?.getTime(), preservedResolvedAt.getTime(), 'null-progress correction keeps historical resolvedAt')

    const foreign = await createUser('foreign', 'America/New_York')
    assert.deepEqual(await chooseRecovery(foreign, { insightId: first.id, version: first.version, choice: 'rest' }, now), { status: 'not_found' })
    assert.equal((await chooseRecovery(primary, { insightId: first.id, version: first.version + 1, choice: 'smaller' }, now)).status, 'stale')

    const smaller = await createEligibleFixture('smaller')
    assert.ok(smaller.prepared.preview)
    const [choiceA, choiceB] = await Promise.all([
      chooseRecovery(smaller.user, { insightId: smaller.prepared.id, version: smaller.prepared.version, choice: 'smaller' }, now),
      chooseRecovery(smaller.user, { insightId: smaller.prepared.id, version: smaller.prepared.version, choice: 'smaller' }, now),
    ])
    assert.deepEqual(new Set([choiceA.status, choiceB.status]), new Set(['accepted', 'already_chosen']), 'concurrent smaller choices create at most one decision')
    const smallerView = await getRecovery(smaller.user, now)
    assert.equal(smallerView?.choice, 'smaller')
    assert.ok(smallerView?.questId)
    const recoveryRows = await db.select().from(schema.systemQuests).where(and(eq(schema.systemQuests.userId, smaller.user.id), eq(schema.systemQuests.kind, 'recovery')))
    assert.equal(recoveryRows.length, 1)
    assert.equal(recoveryRows[0].xp, smaller.prepared.preview!.xp, 'smaller recovery earns normal daily XP only after approval')
    const [parentAfter] = await db.select().from(schema.systemQuests).where(eq(schema.systemQuests.id, smaller.parent.id))
    assert.equal(parentAfter.status, 'failed')
    assert.equal(parentAfter.xp, 20, 'parent history/XP are unchanged')
    const duplicateSame = await chooseRecovery(smaller.user, { insightId: smaller.prepared.id, version: smaller.prepared.version, choice: 'smaller' }, now)
    assert.equal(duplicateSame.status, 'already_chosen')
    if (duplicateSame.status === 'already_chosen') assert.equal(duplicateSame.view.choice, 'smaller', 'same duplicate returns the saved choice')
    const duplicateDifferent = await chooseRecovery(smaller.user, { insightId: smaller.prepared.id, version: smaller.prepared.version, choice: 'rest' }, now)
    assert.equal(duplicateDifferent.status, 'already_chosen')
    if (duplicateDifferent.status === 'already_chosen') assert.equal(duplicateDifferent.view.choice, 'smaller', 'different duplicate returns the saved choice')

    const stale = await createEligibleFixture('stale')
    await db.update(schema.entries).set({ value: 4 }).where(and(eq(schema.entries.userId, stale.user.id), eq(schema.entries.trackerId, stale.commits.id), eq(schema.entries.localDate, today)))
    const staleSmaller = await chooseRecovery(stale.user, { insightId: stale.prepared.id, version: stale.prepared.version, choice: 'smaller' }, now)
    assert.equal(staleSmaller.status, 'stale', 'changed evidence rejects stale smaller preview')
    if (staleSmaller.status !== 'stale') throw new Error('expected stale recovery preview')
    assert.equal(staleSmaller.view.version, stale.prepared.version + 1, 'stale preview requires a new explicit version')
    const durableRest = await chooseRecovery(stale.user, { insightId: stale.prepared.id, version: staleSmaller.view.version, choice: 'rest' }, now)
    assert.equal(durableRest.status, 'accepted', 'rest remains available after preview evidence changes')

    const noPreviewRest = await createUnavailableFixture('no-preview-rest')
    assert.equal((await chooseRecovery(noPreviewRest.user, { insightId: noPreviewRest.prepared.id, version: noPreviewRest.prepared.version, choice: 'rest' }, now)).status, 'accepted')
    const noPreviewPriorities = await createUnavailableFixture('no-preview-priorities')
    assert.equal((await chooseRecovery(noPreviewPriorities.user, { insightId: noPreviewPriorities.prepared.id, version: noPreviewPriorities.prepared.version, choice: 'priorities' }, now)).status, 'accepted')

    const [capUser] = await db.insert(schema.users).values({
      name: `Recovery Integration cap ${run}`, timezone: 'Asia/Kolkata', baseCurrency: 'INR', profile: { onboardedAt: now.toISOString() },
    }).returning()
    userIds.push(capUser.id)
    const capped = await insertCoachQuests(capUser, today, [0, 1, 2, 3].map((n) => ({
      kind: 'daily' as const, fromDate: today, toDate: today, statId: `cap:${n}`, statName: `Cap ${n}`, area: 'skills', unit: null,
      op: 'gte' as const, agg: 'sum' as const, target: 1, rank: 'E' as const, xp: 20, title: `Cap ${n}`, reason: run, status: 'active' as const, ref: `${run}:cap:${n}`,
    })))
    assert.equal(capped.length, 3, 'at most three overlapping active coach quests persist')

    const blocked = await insertCoachQuests(primary, today, [{
      kind: 'daily', fromDate: today, toDate: today, statId: 'blocked', statName: 'Blocked by recovery pause', area: 'skills', unit: null,
      op: 'gte', agg: 'sum', target: 1, rank: 'E', xp: 20, title: 'Blocked', reason: run, status: 'active', ref: `${run}:blocked`,
    }])
    assert.equal(blocked.length, 0, 'recovery pause blocks same-day normal insertion')
  } finally {
    await cleanup()
  }
})
