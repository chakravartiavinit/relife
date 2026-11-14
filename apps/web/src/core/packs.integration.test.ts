import assert from 'node:assert/strict'
import test from 'node:test'
import { and, eq } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database:
 *
 * RELIFE_MOCK=1 RELIFE_PACKS_INTEGRATION=1 npx tsx --env-file=.env --test src/core/packs.integration.test.ts
 */
const enabled = process.env.RELIFE_PACKS_INTEGRATION === '1'
const now = new Date('2026-11-11T12:00:00.000Z')

test('templates gallery: apply is one locked step that a second run cannot repeat, Undo removes only its own rows, goal slots hold', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema, sql } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { applyPack, previewPack, undoPackImport, exportPack, exportChoices } = await import('./packs')
  const { BUILT_IN_PACKS } = await import('@/packs')
  const { Pack, parsePack } = await import('@relife/contract')
  const fitness = BUILT_IN_PACKS.find((p) => p.id === 'fitness')!

  const [user] = await db.insert(schema.users).values({ name: 'Packs Integration', timezone: 'Asia/Kolkata', baseCurrency: 'INR', profile: { areas: ['health', 'mind'] } }).returning()
  const all = { routineKeys: fitness.routines.map((r) => r.key), trackerSlugs: [] as string[], goals: [{ key: 'active-days', baselineValue: 2 }], addAreas: true }
  try {
    // Preview writes nothing and says what would be added.
    const pv = await previewPack(user, fitness, now)
    assert.equal(pv.plan.routines.length, 4)
    assert.equal(pv.plan.goals.length, 1)
    assert.equal((await db.select().from(schema.schedules).where(eq(schema.schedules.userId, user.id))).length, 0)

    // A user's own routine of the same name is left alone and not counted as the import's.
    await db.insert(schema.schedules).values({ userId: user.id, name: 'Stretch', kind: 'routine', category: 'health', rrule: 'FREQ=DAILY' })

    // Two applies at once: the lock makes them take turns, so the second adds nothing.
    const [a, b] = await Promise.all([applyPack(user, fitness, all, now), applyPack(user, fitness, all, now)])
    const [first, second] = a.created.scheduleIds.length >= b.created.scheduleIds.length ? [a, b] : [b, a]
    assert.equal(first.created.scheduleIds.length, 3) // Stretch existed
    assert.equal(first.created.goalIds.length, 1)
    assert.equal(first.line, 'Added 3 routines, 1 goal')
    assert.deepEqual([second.created.scheduleIds.length, second.created.goalIds.length, second.line], [0, 0, 'Nothing new to add'])
    assert.equal((await db.select().from(schema.schedules).where(eq(schema.schedules.userId, user.id))).length, 4)

    const [goal] = await db.select().from(schema.goals).where(eq(schema.goals.userId, user.id))
    assert.equal((goal.meta as { pack?: { importId: string } }).pack?.importId, first.importId)
    assert.equal(goal.baselineValue, 2)
    assert.equal(goal.actions.length, 2) // the user's Workout... linked: workout and evening walk

    // Undo takes back this import's rows only; the user's own Stretch stays.
    const undone = await undoPackImport(user, first.importId)
    assert.deepEqual(undone, { routines: 3, trackers: 0, goals: 1 })
    const left = await db.select({ name: schema.schedules.name }).from(schema.schedules).where(eq(schema.schedules.userId, user.id))
    assert.deepEqual(left.map((r) => r.name), ['Stretch'])
    assert.deepEqual(await undoPackImport(user, first.importId), { routines: 0, trackers: 0, goals: 0 })

    // A goal that has a check-in has been used: Undo keeps it.
    const again = await applyPack(user, fitness, all, now)
    assert.equal(again.created.goalIds.length, 1)
    await db.insert(schema.goalCheckIns).values({ userId: user.id, goalId: again.created.goalIds[0], localDate: '2026-11-11', value: 3 })
    assert.equal((await undoPackImport(user, again.importId)).goals, 0)
    assert.equal((await db.select().from(schema.goals).where(eq(schema.goals.userId, user.id))).length, 1)

    // Goal slots: with three active goals a fourth is skipped, not created.
    const slots = await db.insert(schema.goals).values([2, 3].map((n) => ({
      userId: user.id, title: `Own goal ${n}`, reason: 'r', area: 'health' as const, measureKind: 'check_in' as const, measureName: 'x', direction: 'increase' as const, target: 5,
      baselineValue: 1, baselineDate: '2026-11-01', baselineHow: 'x', targetDate: '2027-01-01', nextReviewOn: '2026-11-15',
    }))).returning({ id: schema.goals.id })
    assert.equal(slots.length, 2)
    const money = BUILT_IN_PACKS.find((p) => p.id === 'money')!
    const full = await applyPack(user, money, { routineKeys: [], trackerSlugs: [], goals: [{ key: 'fewer-orders', baselineValue: 5 }], addAreas: true }, now)
    assert.deepEqual([full.created.goalIds.length, full.skipped.map((s) => s.reason)], [0, ['goal_slots']])

    // A goal without a baseline fails cleanly instead of throwing, and a pack's new area is turned on.
    await db.delete(schema.goals).where(eq(schema.goals.userId, user.id))
    const bad = await applyPack(user, money, { routineKeys: ['budget', 'log-spends'], trackerSlugs: [], goals: [{ key: 'fewer-orders' }], addAreas: true }, now)
    assert.equal(bad.created.goalIds.length, 0)
    assert.equal(bad.failed.length, 1)
    assert.equal(bad.created.scheduleIds.length, 2)
    const [u] = await db.select({ profile: schema.users.profile }).from(schema.users).where(eq(schema.users.id, user.id))
    assert.ok(u.profile.areas?.includes('wealth'))

    // Share my setup: routines (never medicines), no notes unless asked, and the file reads back with the same schema.
    await db.insert(schema.schedules).values({ userId: user.id, name: 'Vitamin D', kind: 'medicine', category: 'health', rrule: 'FREQ=DAILY', meta: { dose: '1000 IU' } })
    const ch = await exportChoices(user)
    assert.ok(!ch.routines.some((r) => r.name === 'Vitamin D'))
    const noNotes = await exportPack(user, { scheduleIds: ch.routines.map((r) => r.id), trackerIds: [], goalIds: [], includeNotes: false }, { name: 'My setup', description: 'What I use' })
    assert.ok(noNotes.ok)
    if (noNotes.ok) {
      assert.equal(noNotes.filename, 'my-setup.relife-pack.json')
      assert.ok(!JSON.stringify(noNotes.pack).includes('"note"'))
      assert.equal(parsePack(JSON.stringify(noNotes.pack)).ok, true)
      assert.equal(Pack.safeParse(noNotes.pack).success, true)
    }
    const empty = await exportPack(user, { scheduleIds: [], trackerIds: [], goalIds: [], includeNotes: false }, { name: 'x', description: 'y' })
    assert.equal(empty.ok, false)
  } finally {
    await db.delete(schema.goals).where(eq(schema.goals.userId, user.id))
    await db.delete(schema.trackers).where(eq(schema.trackers.userId, user.id))
    await db.delete(schema.schedules).where(eq(schema.schedules.userId, user.id))
    try { await db.delete(schema.users).where(and(eq(schema.users.id, user.id))) } finally { await sql.end() }
  }
})
