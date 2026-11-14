import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

/**
 * Opt-in (RELIFE_MULTI_INTEGRATION=1, RELIFE_MOCK=1): two people on one server. The mock user is A (the owner, with a year of
 * data); the test adds B (a member with a little data of their own) and checks that B can neither read nor change anything of
 * A's through the loaders, the peeks, the mutators, the device and export code, the jobs, the keys and the Telegram link, and
 * that party mode shows B only what A ticked. B is removed again at the end, so the mock data is as it was.
 *
 * set -a; . ./.env; set +a
 * RELIFE_MOCK=1 RELIFE_MULTI_INTEGRATION=1 tsx --test src/core/multi-user.integration.test.ts
 */
const enabled = process.env.RELIFE_MULTI_INTEGRATION === '1'

test('one person cannot read or change another on the same server', { skip: !enabled }, async (t) => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  process.env.RELIFE_DATA_DIR = mkdtempSync(join(tmpdir(), 'relife-multi-'))
  process.env.RELIFE_SECRET_KEY = randomBytes(32).toString('base64')
  delete process.env.RELIFE_DEMO

  const { sql, databaseUrl } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'must run on the _mock database')
  const { clearUserCache, getUser, setRequestTokenSource, userForToken } = await import('./user')
  const { clearUsersCache, ownerUser } = await import('./multi-user')
  const { runAs } = await import('./context')
  const { createDevice, listDevices, revokeDevice, renameDevice } = await import('./auth/devices')
  const { authenticate } = await import('./auth/request')
  const { env, resetKeys, setMulti, setUserKeys } = await import('./env')

  clearUserCache(); clearUsersCache()
  const A = await ownerUser()
  assert.ok(A, 'seed the mock database first: npm run mock:seed')
  assert.equal(A.role, 'owner')

  // ── B and what is B's ──────────────────────────────────────────────────────────────────────────
  const [B] = await sql`insert into users (name, role, timezone, base_currency, profile) values ('Bea', 'member', ${A.timezone}, ${A.baseCurrency}, '{}'::jsonb) returning *`
  const [bRoutine] = await sql`insert into schedules (user_id, name, kind, category, rrule) values (${B.id}, 'Bea stretches', 'routine', 'health', 'DTSTART:20260101T000000Z
RRULE:FREQ=DAILY') returning id`
  const [bInsight] = await sql`insert into insights (user_id, kind, title, body) values (${B.id}, 'nudge', 'Bea nudge', 'only for Bea') returning id`
  const aIdsOf = async (table: string) => (await sql.unsafe(`select id from "${table}" where user_id = $1`, [A.id])).map((r) => r.id as string)
  const aSchedules = await aIdsOf('schedules')
  const aInsights = await aIdsOf('insights')
  const aTransactions = await aIdsOf('transactions')
  const aGoals = await aIdsOf('goals')
  const aAll = [...aSchedules, ...aInsights, ...aTransactions, ...aGoals, A.id]
  assert.ok(aSchedules.length && aInsights.length && aTransactions.length, 'A needs mock data')

  const a = await createDevice({ userId: A.id, kind: 'browser', name: 'A browser', scopes: ['full'] })
  const b = await createDevice({ userId: B.id, kind: 'browser', name: 'B browser', scopes: ['full'] })
  const parties: string[] = []
  t.after(async () => {
    for (const id of parties) await sql`delete from parties where id = ${id}`
    await sql`delete from users where id = ${B.id}`
    await sql`delete from devices where id = ${a.device.id}`
    await sql`delete from pairings where meta->>'invitedBy' = ${A.id}`
    resetKeys(); setRequestTokenSource(undefined); clearUserCache(); clearUsersCache()
    await sql.end()
  })
  clearUserCache(); clearUsersCache()
  const bUser = (await userForToken(b.token))!
  const asToken = (token: string | undefined) => setRequestTokenSource(async () => token)
  const leaks = (value: unknown) => {
    const text = JSON.stringify(value)
    return aAll.filter((id) => text.includes(id))
  }

  await t.test('getUser follows the request token, and fails closed without one', async () => {
    asToken(b.token)
    assert.equal((await getUser()).id, B.id)
    asToken(a.token)
    assert.equal((await getUser()).id, A.id)
    asToken(undefined)
    await assert.rejects(() => getUser(), /No signed-in user/)
    asToken('rlf_b_not-a-token')
    await assert.rejects(() => getUser(), /No signed-in user/)
    // Inside runAs the scope wins over everything.
    assert.equal(await runAs(bUser, async () => (await getUser()).id), B.id)
  })

  await t.test('the bearer token names the person on every API route', async () => {
    const req = (token: string) => new Request('http://localhost/api/peek', { headers: { authorization: `Bearer ${token}` } })
    const ra = await authenticate(req(a.token), 'full')
    const rb = await authenticate(req(b.token), 'full')
    assert.ok(ra.ok && rb.ok)
    assert.equal(ra.ok && ra.user.id, A.id)
    assert.equal(rb.ok && rb.user.id, B.id)
  })

  await t.test('loaders for B hold none of A’s rows', async () => {
    const { loadShellStatus } = await import('./shell')
    const { buildDayPlan } = await import('./day-plan')
    const { xpSummary } = await import('./xp')
    const { loadNeedsYou } = await import('./needs-you')
    const { loadGoalsPage } = await import('./goals')
    const { loadCapture } = await import('./capture')
    const { loadConnectorItems } = await import('./connector-items')
    const { loadPrivacy } = await import('./privacy')
    const shell = await loadShellStatus(bUser)
    assert.equal(shell.needsYou.total, 1, 'only B’s own nudge')
    assert.equal(shell.level.level, 1)
    const plan = await buildDayPlan(bUser)
    assert.deepEqual(plan.rows.map((r) => r.scheduleId).filter((id) => aSchedules.includes(id)), [])
    for (const [name, value] of Object.entries({
      plan, xp: await xpSummary(bUser), needs: await loadNeedsYou(bUser), goals: await loadGoalsPage(bUser), capture: await loadCapture(bUser),
      connectors: await loadConnectorItems(bUser, 'http://localhost'), privacy: await loadPrivacy(bUser),
    })) assert.deepEqual(leaks(value), [], `${name} leaked A’s ids`)
    assert.equal((await loadNeedsYou(bUser)).items.length, 1)
  })

  await t.test('peeks of A’s ids are gone for B, and open for A', async () => {
    const { loadPeek } = await import('./peek')
    const opts = { origin: 'http://localhost' }
    const refs = [
      { type: 'routine', id: aSchedules[0] }, { type: 'insight', id: aInsights[0] },
      ...(aGoals[0] ? [{ type: 'goal', id: aGoals[0] }] : []), { type: 'quest', id: A.id },
    ] as never[]
    for (const ref of refs) assert.equal(await loadPeek(bUser, ref, opts), null, `${JSON.stringify(ref)} must be gone for B`)
    assert.ok(await loadPeek(A, { type: 'routine', id: aSchedules[0] } as never, opts), 'and open for A')
    // B's own routine opens for B and is gone for A.
    assert.ok(await loadPeek(bUser, { type: 'routine', id: bRoutine.id } as never, opts))
    assert.equal(await loadPeek(A, { type: 'routine', id: bRoutine.id } as never, opts), null)
    // A merchant that only A has.
    const [m] = await sql`select merchant from transactions where user_id = ${A.id} and merchant is not null limit 1`
    const merchant = await loadPeek(bUser, { type: 'merchant', id: m.merchant } as never, opts)
    assert.deepEqual(leaks(merchant), [])
  })

  await t.test('mutators run as B with A’s ids change nothing', async () => {
    const { setCheck, addGoalProgress } = await import('./schedules')
    const { acceptInsight, dismissInsight } = await import('./insights')
    const { recategorizeTxns } = await import('./recategorize')
    const count = async (q: string, id: string) => Number((await sql.unsafe(q, [id]))[0].n)
    const checksBefore = await count('select count(*)::int n from checks where schedule_id = $1', aSchedules[0])
    await assert.rejects(() => setCheck(bUser, aSchedules[0], new Date(), 'done'))
    await assert.rejects(() => addGoalProgress(bUser, aSchedules[0], 5)).catch(() => {})
    assert.equal(await count('select count(*)::int n from checks where schedule_id = $1', aSchedules[0]), checksBefore)

    const [before] = await sql`select status from insights where id = ${aInsights[0]}`
    await acceptInsight(bUser, aInsights[0]).catch(() => {})
    await dismissInsight(bUser, aInsights[0]).catch(() => {})
    assert.equal((await sql`select status from insights where id = ${aInsights[0]}`)[0].status, before.status)

    const [txn] = await sql`select id, category from transactions where id = ${aTransactions[0]}`
    await recategorizeTxns(bUser, txn.id, 'Gifts', false).catch(() => {})
    assert.equal((await sql`select category from transactions where id = ${txn.id}`)[0].category, txn.category)

    assert.equal(await revokeDevice(B.id, a.device.id), false)
    assert.equal(await renameDevice(B.id, a.device.id, 'mine now'), false)
    assert.equal((await listDevices(A.id)).find((d) => d.id === a.device.id)?.name, 'A browser')
    assert.deepEqual((await listDevices(B.id)).map((d) => d.id), [b.device.id])
  })

  await t.test('only the owner removes people, and a member’s wipe touches only the member', async () => {
    const { removePerson, NotOwnerError } = await import('./people')
    const { wipeUserData } = await import('./data/wipe')
    await assert.rejects(() => removePerson(bUser, A.id), NotOwnerError)
    await assert.rejects(() => removePerson(A, A.id), /yourself/)
    const rows = async (uid: string) => Number((await sql`select (select count(*) from schedules where user_id = ${uid}) + (select count(*) from entries where user_id = ${uid}) + (select count(*) from transactions where user_id = ${uid}) as n`)[0].n)
    const aBefore = await rows(A.id)
    await assert.rejects(() => wipeUserData(A), /Remove the other people/)
    assert.equal(await rows(A.id), aBefore, 'the owner’s wipe is refused while others are here')
  })

  await t.test('export holds one person’s rows only', async () => {
    const { exportZip } = await import('./data/export')
    const parts: Uint8Array[] = []
    for await (const c of exportZip(bUser)) parts.push(c)
    const files = unzipSync(new Uint8Array(Buffer.concat(parts)))
    const body = Object.values(files).map((f) => strFromU8(f)).join('\n')
    for (const id of aAll) assert.ok(!body.includes(id), `B’s export holds ${id}`)
    assert.ok(body.includes(B.id) && body.includes('Bea stretches'))
  })

  await t.test('keys are per person: no one inherits another’s', async () => {
    resetKeys()
    setUserKeys(A.id, new Map([['BINANCE_API_KEY', 'a-secret']]))
    setUserKeys(B.id, new Map())
    setMulti(true)
    assert.equal(env('BINANCE_API_KEY'), undefined, 'two people and no scope: nobody’s key')
    assert.equal(await runAs(A, async () => env('BINANCE_API_KEY')), 'a-secret')
    assert.equal(await runAs(bUser, async () => env('BINANCE_API_KEY')), undefined)
    resetKeys()
  })

  await t.test('every per-person job runs once for each person, under their own scope', async () => {
    const { expandJobs } = await import('./jobs')
    const job = { id: 'sync:github', schedule: { everyMinutes: 60 }, run: async () => (await getUser()).id } as never as Parameters<typeof expandJobs>[0][number]
    const instance = { id: 'backup', scope: 'instance', schedule: { everyMinutes: 60 }, run: async () => 'ok' } as never as Parameters<typeof expandJobs>[0][number]
    const out = expandJobs([job, instance], [A, bUser])
    assert.deepEqual(out.map((j) => j.id), [`sync:github@${A.id}`, `sync:github@${B.id}`, 'backup'])
    asToken(undefined)
    assert.deepEqual(await Promise.all(out.slice(0, 2).map((j) => j.run())), [A.id, B.id])
  })

  await t.test('a Telegram chat belongs to the one person who linked it', async () => {
    const { createLinkCode, redeemLinkCode, userForChat, unlinkTelegram } = await import('./telegram-link')
    assert.equal(await userForChat('777001'), null, 'an unlinked chat is no one’s')
    const { code } = await createLinkCode(bUser)
    assert.equal((await redeemLinkCode('NOTACODE', '777001')).ok, false)
    const linked = await redeemLinkCode(code, '777001')
    assert.ok(linked.ok && linked.user.id === B.id)
    assert.equal((await redeemLinkCode(code, '777002')).ok, false, 'a code works once')
    assert.equal((await userForChat('777001'))?.id, B.id)
    assert.equal((await userForChat('777001'))?.id !== A.id, true)
    await unlinkTelegram(bUser)
    assert.equal(await userForChat('777001'), null)
  })

  await t.test('an invite works once and makes a member', async () => {
    const { createInvite, redeemInvite } = await import('./auth/pairing')
    const inv = await createInvite({ ownerId: A.id, deviceId: null, baseUrl: 'http://localhost:3030' })
    const join = (name: string) => redeemInvite({ secret: inv.secret, name, ip: '203.0.113.9', userAgent: 'test', via: 'test' })
    const made = await join('Cleo')
    assert.equal(made.user.role, 'member')
    assert.equal(made.user.name, 'Cleo')
    await assert.rejects(() => join('Dan'))
    await sql`delete from users where id = ${made.user.id}`
    clearUsersCache()
  })

  await t.test('party: a non-member gets nothing, and members see only what was ticked', async () => {
    const { answerInvite, awardPartyChests, createParty, leaveParty, partyView, setShare } = await import('./party')
    clearUsersCache()
    const id = await createParty(A, { name: 'Test crew', invite: [B.id], share: { name: true, level: true, streak: false, today: false, quests: false, achievements: false } })
    parties.push(id)
    assert.equal(await partyView(bUser, id), null, 'an invited person sees nothing yet')
    const [outsider] = await sql`insert into users (name, role) values ('Eve', 'member') returning *`
    try {
      assert.equal(await partyView(outsider as never, id), null, 'a stranger sees nothing')
      await assert.rejects(() => answerInvite(outsider as never, id, true), /gone/)
      await assert.rejects(() => leaveParty(outsider as never, id))
      await assert.rejects(() => setShare(outsider as never, id, {}))
    } finally { await sql`delete from users where id = ${outsider.id}` }
    await answerInvite(bUser, id, true, { name: false, level: false, streak: false, today: false, quests: false, achievements: false })
    const view = await partyView(bUser, id)
    assert.ok(view)
    const seenA = view.members.find((m) => !m.you)!
    assert.equal(seenA.name, A.name)
    assert.ok(seenA.level)
    assert.deepEqual([seenA.streak, seenA.today, seenA.quests, seenA.achievements], [null, null, null, null], 'A ticked only name and level')
    const seenB = view.members.find((m) => m.you)!
    assert.equal(seenB.name, null, 'B shares nothing, and the party shows no name')
    // What leaves is the contract's shape, and none of A's ids or private text.
    const text = JSON.stringify(view)
    for (const secret of [...aAll.filter((x) => x !== A.id), A.timezone, String(A.profile.goals ?? '∅∅'), A.id]) assert.ok(!text.includes(secret), `the party view leaks ${secret}`)
    // A ticks everything, and the extra fields appear only then.
    await setShare(A, id, { name: true, level: true, streak: true, today: true, quests: true, achievements: true })
    const wide = (await partyView(bUser, id))!.members.find((m) => !m.you)!
    assert.ok(wide.streak !== null && wide.today !== null && wide.quests !== null && wide.achievements !== null)
    assert.equal(Object.keys(wide).length, 10)
    // The chest is paid once however often it is checked.
    const first = await awardPartyChests(A)
    const again = await awardPartyChests(A)
    assert.equal(again, 0)
    assert.ok(first >= 0)
    const refs = (await sql`select ref from chests where user_id = ${A.id} and ref like ${'party:' + id + ':%'}`).map((r) => r.ref)
    assert.equal(new Set(refs).size, refs.length)
    // Cheers: B cannot cheer someone outside their parties.
    const { cheer } = await import('./party')
    await assert.rejects(() => cheer(bUser, '00000000-0000-4000-8000-000000000000'), /own parties/)
    // Leaving takes B out of the view and the party survives for A.
    await leaveParty(bUser, id)
    assert.equal(await partyView(bUser, id), null)
    assert.ok(await partyView(A, id))
  })
})
