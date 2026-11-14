import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { readFile, rm } from 'node:fs/promises'
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

const inList = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `)

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
    assert.deepEqual(draft.origin, { pack: 'fitness', name: 'Fitness' })
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

test('a spend typed in Capture links only when the bank description holds its name, and two links to one order cannot both stand', { skip: !enabled }, async () => {
  const { db, schema, user } = await setup()
  const { persist } = await import('./ingest')
  const { linkStatements, setTransactionLink } = await import('./statement-link')
  const { addDays, localDate } = await import('./time')
  const T = schema.transactions
  const day = addDays(localDate(new Date(), user.timezone), -1)
  const acc = { key: 'statement:test-unique', kind: 'bank' as const, name: 'Test unique' }
  const refs = ['statement:test-unique:1', 'statement:test-unique:2', 'statement:test-unique:3', 'manual:test-unique', 'swiggy:TEST-UNIQUE']
  const bank = (n: number, desc: string, amount = -91) => persist(user, { kind: 'transaction', account: acc, at: new Date(`${day}T06:30:00Z`), amount, currency: 'INR', merchant: desc, source: 'statement', externalRef: `statement:test-unique:${n}`, meta: { description: desc } })
  const row = async (ref: string) => (await db.select().from(T).where(and(eq(T.userId, user.id), eq(T.externalRef, ref))))[0]
  try {
    // An amount alone is not enough for a manual spend.
    await bank(1, 'UNRELATED SHOP')
    await persist(user, { kind: 'transaction', account: { key: 'manual:cash', kind: 'manual_asset', name: 'Cash & manual' }, at: new Date(`${day}T10:00:00Z`), amount: -91, currency: 'INR', merchant: 'bakery', source: 'manual', externalRef: 'manual:test-unique' })
    assert.equal(await linkStatements(user, { from: day, to: day }), 0, 'no name, no link')
    await db.delete(T).where(eq(T.externalRef, 'manual:test-unique'))
    await db.delete(T).where(eq(T.externalRef, 'statement:test-unique:1'))

    // Two bank rows, one app order, two link runs at once: exactly one row is linked and nothing throws.
    await persist(user, { kind: 'transaction', account: { key: 'app:swiggy', kind: 'wallet', name: 'Swiggy orders' }, at: new Date(`${day}T08:00:00Z`), amount: -91, currency: 'INR', merchant: 'Swiggy', source: 'swiggy', externalRef: 'swiggy:TEST-UNIQUE', meta: { platform: 'swiggy', appOrder: true } })
    await bank(2, 'SWIGGY ORDER A'); await bank(3, 'SWIGGY ORDER B')
    const runs = await Promise.all([1, 2, 3].map(() => linkStatements(user, { from: day, to: day })))
    assert.ok(runs.reduce((a, b) => a + b, 0) <= 1, `at most one link was made: ${runs}`)
    const order = await row('swiggy:TEST-UNIQUE')
    const linked = await db.select().from(T).where(and(eq(T.userId, user.id), eq(T.linkedTo, order.id)))
    assert.equal(linked.length, 1)
    // The database refuses a second row for the same order, and the by-hand action says so in words.
    const other = linked[0].externalRef === 'statement:test-unique:2' ? await row('statement:test-unique:3') : await row('statement:test-unique:2')
    await assert.rejects(db.update(T).set({ linkedTo: order.id }).where(eq(T.id, other.id)), (e: unknown) => (e as { code?: string; cause?: { code?: string } }).code === '23505' || (e as { cause?: { code?: string } }).cause?.code === '23505')
    await assert.rejects(setTransactionLink(user, other.id, order.id), /Another bank row already matches/)
  } finally {
    await db.delete(T).where(and(eq(T.userId, user.id), sql`${T.externalRef} in (${inList(refs)})`))
    await db.delete(schema.accounts).where(and(eq(schema.accounts.userId, user.id), sql`${schema.accounts.key} in ('statement:test-unique', 'app:swiggy')`))
  }
})

test('upload chunks: another user gets 404, a wrong offset says where to resume, a big chunk and extra bytes are refused, two writers at one offset cannot both win', { skip: !enabled }, async () => {
  const { db, schema, user, imports } = await setup()
  const { CHUNK_BYTES } = await import('@/domain/imports')
  const [stranger] = await db.insert(schema.users).values({ name: 'Chunk stranger', timezone: 'Asia/Kolkata', baseCurrency: 'INR' }).returning()
  const csv = Buffer.from('Date,Narration,Debit\n2024-01-01,FAKE,1.00\n2024-01-02,FAKE,2.00\n')
  const { id } = await imports.createImport(user, { kind: 'statement', fileName: 'chunky-test.csv', size: csv.length })
  try {
    assert.deepEqual(await imports.appendChunk(stranger, id, 0, csv), { ok: false, status: 404, error: 'Import not found' })
    assert.deepEqual(await imports.appendChunk(user, id, 5, csv.subarray(0, 10)), { ok: false, status: 409, error: 'Out of order', expected: 0 })
    const big = await imports.appendChunk(user, id, 0, Buffer.alloc(CHUNK_BYTES + 1))
    assert.equal(!big.ok && big.status, 413)
    const more = await imports.appendChunk(user, id, 0, Buffer.concat([csv, Buffer.from('x')]))
    assert.equal(!more.ok && more.status, 400)
    // Two requests for the same offset: one writes, the other is told where the file stands.
    const both = await Promise.all([imports.appendChunk(user, id, 0, csv.subarray(0, 20)), imports.appendChunk(user, id, 0, csv.subarray(0, 20))])
    assert.equal(both.filter((r) => r.ok).length, 1)
    assert.deepEqual(both.find((r) => !r.ok), { ok: false, status: 409, error: 'Out of order', expected: 20 })
    // Resume from where the server says, and the finished file is exactly what was sent.
    assert.deepEqual(await imports.appendChunk(user, id, 20, csv.subarray(20)), { ok: true, received: csv.length })
    const preview = await imports.finishUpload(user, id)
    assert.equal(preview.ok, true, JSON.stringify(preview))
    assert.equal(preview.ok && 'rows' in preview ? preview.rows : -1, 2)
    assert.equal((await readFile(imports.uploadPath(id))).equals(csv), true)
    assert.equal((await imports.appendChunk(user, id, csv.length, Buffer.from('x'))).ok, false, 'a finished upload takes no more')
  } finally {
    await db.delete(schema.imports).where(eq(schema.imports.id, id))
    await db.delete(schema.users).where(eq(schema.users.id, stranger.id))
    await rm(imports.importDir(id), { recursive: true, force: true })
  }
})

test('Undo and Remove work on a failed import and on a stale running one; a fresh running one is refused', { skip: !enabled }, async () => {
  const { db, schema, user, imports } = await setup()
  const T = schema.transactions
  const csv = Buffer.from('Date,Narration,Debit,Credit,Undo test\n2024-02-01,UNDO FAKE A,10.00,,\n2024-02-02,UNDO FAKE B,20.00,,\n')
  const ids: string[] = []
  try {
    for (const how of ['failed', 'stale'] as const) {
      const { id } = await upload(imports, user, 'statement', `undo-${how}-test.csv`, csv)
      ids.push(id)
      assert.equal((await db.select().from(T).where(sql`${T.meta}->>'importId' = ${id}`)).length, 2)
      await db.update(schema.imports).set(how === 'failed' ? { status: 'failed', error: 'stopped half way' } : { status: 'running', updatedAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(schema.imports.id, id))
      const listed = (await imports.listImports(user, 50)).find((r) => r.id === id)!
      assert.equal(listed.status, 'failed', 'a stale run is listed as failed so it can be removed')
      await imports.cancelImport(user, id) // Remove: undoes what it wrote
      assert.equal((await db.select().from(T).where(sql`${T.meta}->>'importId' = ${id}`)).length, 0, `${how}: rows removed`)
      const [after] = await db.select().from(schema.imports).where(eq(schema.imports.id, id))
      assert.equal(after.status, 'undone')
    }
    const { id } = await upload(imports, user, 'statement', 'undo-fresh-test.csv', csv)
    ids.push(id)
    await db.update(schema.imports).set({ status: 'running' }).where(eq(schema.imports.id, id))
    await assert.rejects(imports.undoImport(user, id), /Only a finished or failed import/)
    await imports.cancelImport(user, id) // nothing to cancel while it runs
    assert.equal((await db.select().from(T).where(sql`${T.meta}->>'importId' = ${id}`)).length, 2)
  } finally {
    for (const id of ids) await db.delete(T).where(sql`${T.meta}->>'importId' = ${id}`)
    await db.delete(schema.rawEvents).where(and(eq(schema.rawEvents.userId, user.id), sql`${schema.rawEvents.body}->>'importId' in (${inList(ids)})`))
    await db.delete(schema.imports).where(and(eq(schema.imports.userId, user.id), sql`${schema.imports.fileName} like 'undo-%-test.csv'`))
    await db.delete(schema.accounts).where(and(eq(schema.accounts.userId, user.id), sql`${schema.accounts.key} like 'statement:undo-%-test'`))
  }
})

test('a Dr / Cr file imports with the right signs and the day\'s last balance, an ambiguous date waits for a choice, and the same file twice warns', { skip: !enabled }, async () => {
  const { db, schema, user, imports } = await setup()
  const T = schema.transactions
  const drcr = Buffer.from('Tran Date,Description,Amount,Dr / Cr,Balance\n2024-03-05,DRCR FAKE SHOP,120.00,Dr,880.00\n2024-03-05,DRCR FAKE EMPLOYER,30.00,Cr,910.00\n2024-03-05,DRCR FAKE CAFE,60.00,Dr,850.00\n')
  const ids: string[] = []
  try {
    const first = await upload(imports, user, 'statement', 'drcr-test.csv', drcr)
    ids.push(first.id)
    assert.equal(first.preview.ok && first.preview.kind === 'statement' ? first.preview.mapping.columns.sign : -1, 3)
    const rows = await db.select().from(T).where(sql`${T.meta}->>'importId' = ${first.id}`)
    assert.deepEqual(rows.map((r) => r.amount).sort((a, b) => a - b), [-120, -60, 30])
    const [account] = await db.select().from(schema.accounts).where(and(eq(schema.accounts.userId, user.id), eq(schema.accounts.key, 'statement:drcr-test')))
    assert.equal(account.latestBalance, 850, 'the last row of the day sets the balance')
    // The same file again: a warning on the preview (not a stop).
    const again = await upload(imports, user, 'statement', 'drcr-test-again.csv', drcr)
    ids.push(again.id)
    assert.equal(again.preview.ok && again.preview.repeat?.fileName, 'drcr-test.csv')
    // ...and it says which rows are already in, so the dialog counts none as new.
    assert.ok(again.preview.ok && again.preview.kind === 'statement')
    assert.equal(again.preview.duplicates, 3)
    assert.ok(again.preview.sample.length === 3 && again.preview.sample.every((r) => r.already))
    // A file that is half old, half new: only the new row counts.
    const more = Buffer.from(drcr.toString() + '2024-03-06,DRCR FAKE BOOKS,45.00,Dr,805.00\n')
    const half = await upload(imports, user, 'statement', 'drcr-test-more.csv', more)
    ids.push(half.id)
    assert.ok(half.preview.ok && half.preview.kind === 'statement')
    assert.deepEqual([half.preview.rows, half.preview.duplicates], [4, 3])
    assert.deepEqual(half.preview.sample.map((r) => !!r.already), [true, true, true, false])

    // 01/02, 02/02, 03/02 reads in order both as DD/MM and as MM/DD: nothing is ready until the user picks.
    const amb = Buffer.from('Posting Date,Narration,Debit,Credit,Amb Test\n01/02/2024,AMB FAKE,5.00,,\n02/02/2024,AMB FAKE,6.00,,\n03/02/2024,AMB FAKE,7.00,,\n')
    const { id } = await imports.createImport(user, { kind: 'statement', fileName: 'amb-test.csv', size: amb.length })
    ids.push(id)
    await imports.appendChunk(user, id, 0, amb)
    const p = await imports.finishUpload(user, id)
    assert.ok(p.ok && p.kind === 'statement')
    assert.equal(p.ready, false)
    assert.equal(p.dateChoices.length, 2)
    const chosen = await imports.previewImport(user, id, { ...p.mapping, dateFormat: 'DD/MM/YYYY' })
    assert.ok(chosen.ok && chosen.kind === 'statement' && chosen.ready && chosen.dateChoices.length === 0)
  } finally {
    for (const id of ids) await db.delete(T).where(sql`${T.meta}->>'importId' = ${id}`)
    await db.delete(schema.rawEvents).where(and(eq(schema.rawEvents.userId, user.id), sql`${schema.rawEvents.body}->>'importId' in (${inList(ids)})`))
    await db.delete(schema.imports).where(and(eq(schema.imports.userId, user.id), sql`${schema.imports.fileName} in ('drcr-test.csv', 'drcr-test-again.csv', 'drcr-test-more.csv', 'amb-test.csv')`))
    await db.delete(schema.accounts).where(and(eq(schema.accounts.userId, user.id), sql`${schema.accounts.key} in ('statement:drcr-test', 'statement:drcr-test-again', 'statement:amb-test')`))
  }
})

test('built-in rules: a card bill from the bank is a transfer, a shop that says card payment or autopay is still spending', { skip: !enabled }, async () => {
  const { categorize } = await import('./categorize')
  const id = '00000000-0000-4000-8000-000000000000'
  assert.equal((await categorize(id, 'CREDIT CARD PAYMENT BANK')).category, 'Transfers')
  assert.equal((await categorize(id, 'CREDIT CARD AUTOPAY HDFC')).category, 'Transfers')
  assert.equal((await categorize(id, 'CC BILL PAYMENT HDFC')).category, 'Transfers')
  assert.equal((await categorize(id, 'CARD PAYMENT TO TESCO')).category, 'Uncategorized')
  assert.equal((await categorize(id, 'ACH/NACH AUTOPAY NETFLIX')).category, 'Subscriptions')
})
