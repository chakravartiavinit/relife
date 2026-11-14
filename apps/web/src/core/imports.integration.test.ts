import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { and, eq, sql } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database:
 *
 * RELIFE_MOCK=1 RELIFE_IMPORT_INTEGRATION=1 npx tsx --env-file=../../.env --test src/core/imports.integration.test.ts
 *
 * Fake data only. Every test cleans up after itself.
 */
const enabled = process.env.RELIFE_IMPORT_INTEGRATION === '1'
after(async () => { if (enabled) await (await import('@/db')).sql.end() })

const CSV = (d: string, e: string) => `Date,Narration,Debit,Credit
${d},UPI/412345678901/SWIGGY ORDER,250.00,
${d},FAKE CAFE POS,40.00,
${d},FAKE CAFE POS,40.00,
${e},SALARY FAKE EMPLOYER,,5000.00
`

async function setup() {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { getUser } = await import('./user')
  const imports = await import('./imports')
  return { db, schema, user: await getUser(), imports }
}

/** Upload a file the way the route does (one chunk), then start it. */
async function upload(imports: typeof import('./imports'), user: Awaited<ReturnType<typeof setup>>['user'], kind: 'statement' | 'apple-health', name: string, body: Buffer, mapping?: unknown) {
  const { id } = await imports.createImport(user, { kind, fileName: name, size: body.length })
  const r = await imports.appendChunk(user, id, 0, body)
  assert.equal(r.ok, true)
  const preview = await imports.finishUpload(user, id)
  assert.equal(preview.ok, true, JSON.stringify(preview))
  const m = mapping ?? (preview.ok && 'mapping' in preview ? preview.mapping : undefined)
  await imports.startImport(user, id, m)
  const [row] = await (await import('@/db')).db.select().from((await import('@/db')).schema.imports).where(eq((await import('@/db')).schema.imports.id, id))
  await imports.runImport(row)
  return { id, preview }
}

test('a statement import adds its rows, links the matching app order, and a second run adds nothing', { skip: !enabled }, async () => {
  const { db, schema, user, imports } = await setup()
  const { persist } = await import('./ingest')
  const { transactionsBetween } = await import('./metrics')
  const { addDays, localDate } = await import('./time')
  const day = addDays(localDate(new Date(), user.timezone), -3)
  const sal = addDays(day, 1)
  const T = schema.transactions
  const ids: string[] = []
  const ymd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` // DD/MM/YYYY
  // An app order for the same amount a day apart.
  await persist(user, {
    kind: 'transaction', account: { key: 'app:swiggy', kind: 'wallet', name: 'Swiggy orders' }, at: new Date(`${addDays(day, -1)}T08:00:00Z`),
    amount: -250, currency: 'INR', merchant: 'Swiggy', source: 'swiggy', externalRef: 'swiggy:TEST-1', meta: { platform: 'swiggy', appOrder: true },
  })
  try {
    const first = await upload(imports, user, 'statement', 'sample-bank-jan.csv', Buffer.from(CSV(ymd(day), ymd(sal))))
    ids.push(first.id)
    const [done] = await db.select().from(schema.imports).where(eq(schema.imports.id, first.id))
    assert.equal(done.status, 'done', done.error ?? '')
    assert.deepEqual([done.summary.rows, done.summary.added, done.summary.linked, done.summary.invalid], [4, 4, 1, 0])
    // The linked bank row is the Swiggy one; it is left out of every total, the order counts.
    const rows = await db.select().from(T).where(and(eq(T.userId, user.id), sql`${T.meta}->>'importId' = ${first.id}`))
    const swiggy = rows.find((r) => r.amount === -250)!
    const order = (await db.select().from(T).where(and(eq(T.userId, user.id), eq(T.externalRef, 'swiggy:TEST-1'))))[0]
    assert.equal(swiggy.linkedTo, order.id)
    const counted = await transactionsBetween(user, addDays(day, -2), sal)
    assert.equal(counted.filter((t) => t.amount === -250).length, 1, 'counted once')
    assert.equal(counted.find((t) => t.amount === -250)!.id, order.id)
    assert.equal((await transactionsBetween(user, addDays(day, -2), sal, { includeLinked: true })).filter((t) => t.amount === -250).length, 2)
    assert.equal(counted.filter((t) => t.amount === -40).length, 2, 'two identical coffees stay two rows')
    const shell = await db.execute<{ n: number }>(sql`select count(*)::int as n from transactions where user_id = ${user.id} and id = ${swiggy.id} and linked_to is null`)
    assert.equal(shell[0].n, 0)

    // The same file again: nothing new, and the saved mapping is used.
    const second = await upload(imports, user, 'statement', 'sample-bank-jan.csv', Buffer.from(CSV(ymd(day), ymd(sal))))
    ids.push(second.id)
    assert.equal(second.preview.ok && 'savedFrom' in second.preview ? second.preview.savedFrom : null, 'sample-bank-jan.csv')
    const [again] = await db.select().from(schema.imports).where(eq(schema.imports.id, second.id))
    assert.deepEqual([again.summary.added, again.summary.duplicates], [0, 4])

    // Undo removes the rows; the order still counts.
    const undone = await imports.undoImport(user, first.id)
    assert.equal(undone.removed >= 4, true)
    assert.equal((await db.select().from(T).where(sql`${T.meta}->>'importId' = ${first.id}`)).length, 0)
    const left = await transactionsBetween(user, addDays(day, -2), sal)
    assert.equal(left.filter((t) => t.amount === -250).length, 1)

    // An order deleted later sets linked_to to null, so its bank row counts again.
    const third = await upload(imports, user, 'statement', 'sample-bank-jan.csv', Buffer.from(CSV(ymd(day), ymd(sal))))
    ids.push(third.id)
    await db.delete(T).where(and(eq(T.userId, user.id), eq(T.externalRef, 'swiggy:TEST-1')))
    const after = await transactionsBetween(user, addDays(day, -2), sal)
    assert.equal(after.filter((t) => t.amount === -250).length, 1)
  } finally {
    for (const id of ids) await db.delete(T).where(sql`${T.meta}->>'importId' = ${id}`)
    await db.delete(T).where(and(eq(T.userId, user.id), eq(T.externalRef, 'swiggy:TEST-1')))
    await db.delete(schema.rawEvents).where(and(eq(schema.rawEvents.userId, user.id), sql`${schema.rawEvents.body}->>'importId' is not null`, sql`${schema.rawEvents.source} = 'statement'`))
    await db.delete(schema.imports).where(and(eq(schema.imports.userId, user.id), sql`${schema.imports.fileName} = 'sample-bank-jan.csv'`))
    await db.delete(schema.accounts).where(and(eq(schema.accounts.userId, user.id), sql`${schema.accounts.key} in ('statement:sample-bank-jan', 'app:swiggy')`))
  }
})

test('a manual Capture spend links to a matching bank row the same way', { skip: !enabled }, async () => {
  const { db, schema, user } = await setup()
  const { persist } = await import('./ingest')
  const { linkStatements } = await import('./statement-link')
  const { addDays, localDate } = await import('./time')
  const T = schema.transactions
  const day = addDays(localDate(new Date(), user.timezone), -1)
  const acc = { key: 'statement:test-link', kind: 'bank' as const, name: 'Test link' }
  try {
    await persist(user, { kind: 'transaction', account: acc, at: new Date(`${day}T06:30:00Z`), amount: -77, currency: 'INR', merchant: 'TEST MARKET', source: 'statement', externalRef: 'statement:test-link:1', meta: { description: 'TEST MARKET' } })
    await persist(user, { kind: 'transaction', account: { key: 'manual:cash', kind: 'manual_asset', name: 'Cash & manual' }, at: new Date(`${day}T10:00:00Z`), amount: -77, currency: 'INR', merchant: 'market', source: 'manual', externalRef: 'manual:test-link' })
    assert.equal(await linkStatements(user, { from: day, to: day }), 1)
    const [bank] = await db.select().from(T).where(and(eq(T.userId, user.id), eq(T.externalRef, 'statement:test-link:1')))
    const [manual] = await db.select().from(T).where(and(eq(T.userId, user.id), eq(T.externalRef, 'manual:test-link')))
    assert.equal(bank.linkedTo, manual.id)
    assert.equal(manual.linkedTo, null)
    // "Not the same payment": clears the link for good, and Undo (linking back) works.
    const { setTransactionLink } = await import('./statement-link')
    assert.deepEqual(await setTransactionLink(user, bank.id, null), { before: manual.id })
    assert.equal(await linkStatements(user, { from: day, to: day }), 0)
    const [cleared] = await db.select().from(T).where(eq(T.id, bank.id))
    assert.equal(cleared.linkedTo, null)
    assert.deepEqual((cleared.meta as { linkRejected?: string[] }).linkRejected, [manual.id])
    assert.deepEqual(await setTransactionLink(user, bank.id, manual.id), { before: null })
    const [back] = await db.select().from(T).where(eq(T.id, bank.id))
    assert.equal(back.linkedTo, manual.id)
    assert.deepEqual((back.meta as { linkRejected?: string[] }).linkRejected, [])
  } finally {
    await db.delete(T).where(and(eq(T.userId, user.id), sql`${T.externalRef} in ('statement:test-link:1', 'manual:test-link')`))
    await db.delete(schema.accounts).where(and(eq(schema.accounts.userId, user.id), eq(schema.accounts.key, 'statement:test-link')))
  }
})

test('a fill entry never replaces live data, and a newer import refreshes only its own days', { skip: !enabled }, async () => {
  const { db, schema, user } = await setup()
  const { persist, ensureTracker } = await import('./ingest')
  const E = schema.entries
  const slug = 'import-test.metric'
  const tracker = await ensureTracker(user.id, slug, { name: 'Import test', category: 'health' })
  const entry = (date: string, value: number, importId?: string, source = 'apple-health') => persist(user, {
    kind: 'entry', tracker: slug, date, value, source, mode: 'fill', ...(importId ? { meta: { importId } } : {}),
  })
  const read = async (date: string, source = 'apple-health') => (await db.select().from(E).where(and(eq(E.trackerId, tracker.id), eq(E.localDate, date), eq(E.source, source))))[0]
  try {
    // Live data (a Shortcuts day: same source, no importId) wins over an import.
    await persist(user, { kind: 'entry', tracker: slug, date: '2020-01-01', value: 100, source: 'apple-health' })
    await entry('2020-01-01', 5, 'imp-a')
    assert.equal((await read('2020-01-01')).value, 100)
    // Another source's day is left alone too.
    await persist(user, { kind: 'entry', tracker: slug, date: '2020-01-02', value: 70, source: 'oura' })
    await entry('2020-01-02', 5, 'imp-a')
    assert.equal(await read('2020-01-02'), undefined)
    // A new day is written; the same value from a later import is left (still imp-a); a changed value refreshes it.
    await entry('2020-01-03', 10, 'imp-a')
    assert.equal((await read('2020-01-03')).meta.importId, 'imp-a')
    await entry('2020-01-03', 10, 'imp-b')
    assert.equal((await read('2020-01-03')).meta.importId, 'imp-a', 'nothing changed, so nothing re-stamped')
    await entry('2020-01-03', 12, 'imp-b')
    assert.deepEqual([(await read('2020-01-03')).value, (await read('2020-01-03')).meta.importId], [12, 'imp-b'])
    // Live data arriving later replaces the imported row and drops importId: it is live now.
    await persist(user, { kind: 'entry', tracker: slug, date: '2020-01-03', value: 15, source: 'apple-health' })
    assert.deepEqual([(await read('2020-01-03')).value, (await read('2020-01-03')).meta.importId], [15, undefined])
  } finally {
    await db.delete(E).where(eq(E.trackerId, tracker.id))
    await db.delete(schema.trackers).where(eq(schema.trackers.id, tracker.id))
  }
})

test('setup with the Fitness pack adds exactly one pending goal draft, linked to the Workout routine, and a rerun adds none', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { completeOnboarding } = await import('./onboarding')
  const [user] = await db.insert(schema.users).values({ name: 'Pack Integration', timezone: 'Asia/Kolkata', baseCurrency: 'INR' }).returning()
  const now = new Date('2026-11-13T06:00:00.000Z')
  const input = { name: 'Ada', timezone: 'Asia/Kolkata', baseCurrency: 'INR', areas: ['health', 'mind'] as ('health' | 'mind')[], improve: [], templates: ['workout', 'stretch'], pack: 'fitness' }
  const drafts = () => db.select().from(schema.insights).where(and(eq(schema.insights.userId, user.id), sql`${schema.insights.payload} ? 'goalDraft'`))
  try {
    await completeOnboarding(user, input, now)
    const [workout] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.name, 'Workout')))
    const first = await drafts()
    assert.equal(first.length, 1)
    assert.equal(first[0].status, 'pending')
    const draft = first[0].payload.goalDraft!
    assert.deepEqual(draft.origin, { pack: 'fitness' })
    assert.deepEqual('checkIn' in draft.measure, true)
    assert.deepEqual(draft.actions, [{ kind: 'schedule', id: workout.id }], 'only the routine that was created is linked')
    assert.equal(draft.targetDate, '2027-01-08')
    // Nothing started: a draft is not a goal.
    assert.equal((await db.select().from(schema.goals).where(eq(schema.goals.userId, user.id))).length, 0)
    await completeOnboarding(user, input, now)
    assert.equal((await drafts()).length, 1, 'a rerun adds none')
  } finally {
    await db.delete(schema.users).where(eq(schema.users.id, user.id))
  }
})
