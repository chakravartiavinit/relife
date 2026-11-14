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
    await assert.rejects(() => addGoalProgress(bUser, aSchedules[0], 5))
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

  await t.test('a job reads its person’s keys, never the server’s .env, even before anyone loaded them', async () => {
    const { expandJobs } = await import('./jobs')
    process.env.BINANCE_API_KEY = 'owner-env-secret'
    try {
      resetKeys()
      const { setManagedNames } = await import('./env')
      setManagedNames(['BINANCE_API_KEY'])
      setMulti(true)
      assert.equal(await runAs(bUser, async () => env('BINANCE_API_KEY')), undefined, 'a member with nothing loaded reads nothing')
      const job = { id: 'sync:binance', schedule: { everyMinutes: 60 }, run: async () => String(env('BINANCE_API_KEY')) } as never as Parameters<typeof expandJobs>[0][number]
      const [, forB] = expandJobs([job], [A, bUser])
      assert.equal(await forB.run(), 'undefined', 'B’s job does not see the owner’s key')
    } finally { delete process.env.BINANCE_API_KEY; resetKeys() }
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

  await t.test('an invite runs out, works once, and two people opening it together make one member', async () => {
    const { createInvite, redeemInvite } = await import('./auth/pairing')
    const open = (secret: string, name: string, now?: Date) => redeemInvite({ secret, name, ip: '203.0.113.20', userAgent: 'test', via: 'test', now })
    // Expiry: a week and a bit later it is gone.
    const old = await createInvite({ ownerId: A.id, deviceId: null, baseUrl: 'http://localhost:3030' })
    await assert.rejects(() => open(old.secret, 'Late', new Date(Date.now() + 8 * 86_400_000)), /expired|already used/)
    // Together: exactly one of two simultaneous opens wins.
    const inv = await createInvite({ ownerId: A.id, deviceId: null, baseUrl: 'http://localhost:3030' })
    const results = await Promise.allSettled([open(inv.secret, 'Fay'), open(inv.secret, 'Gus')])
    const won = results.filter((r) => r.status === 'fulfilled')
    assert.equal(won.length, 1, 'one winner')
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1)
    for (const r of won) await sql`delete from users where id = ${r.value.user.id}`
    clearUsersCache()
  })

  await t.test('the owner’s AI model: off refuses a member and never the owner', async () => {
    const { aiAllowed } = await import('./multi-user')
    const { aiEnabledFor } = await import('@/ai')
    const { mergeProfile } = await import('./user')
    assert.equal(await aiAllowed(bUser), true, 'on by default')
    await mergeProfile(A.id, { instance: { ...A.profile.instance, shareAi: false } })
    clearUserCache(); clearUsersCache()
    try {
      assert.equal(await aiAllowed(bUser), false)
      assert.equal(await aiEnabledFor(bUser, 'chat'), false)
      assert.equal(await aiAllowed(A), true)
    } finally {
      await mergeProfile(A.id, { instance: { ...A.profile.instance, shareAi: true } })
      clearUserCache(); clearUsersCache()
    }
    assert.equal(await aiAllowed(bUser), true)
  })

  await t.test('owner-only actions refuse a member', async () => {
    const { requireOwner, NotOwnerError } = await import('./people')
    assert.throws(() => requireOwner(bUser), NotOwnerError)
    assert.doesNotThrow(() => requireOwner(A))
    asToken(b.token)
    const { backupNowAction } = await import('@/app/actions')
    await assert.rejects(() => backupNowAction(), NotOwnerError)
    asToken(undefined)
  })

  await t.test('connectors that read the server’s own computer are closed to a member', async () => {
    const { connect } = await import('./secrets')
    const { HOST_LOCAL } = await import('./platform')
    for (const id of ['anki', 'icloud-inbox']) {
      const r = await connect(B.id, id, {})
      assert.deepEqual(r, { ok: false, error: HOST_LOCAL }, `${id} refused for B`)
    }
    const { connectorStatus } = await import('@/worker/sync')
    const status = await runAs(bUser, () => connectorStatus())
    for (const id of ['anki', 'icloud-inbox', 'shop']) assert.equal(status.find((c) => c.id === id)?.unavailable ?? HOST_LOCAL, HOST_LOCAL, `${id} shows as unavailable to B`)
    assert.equal(status.find((c) => c.id === 'anki')?.unavailable, HOST_LOCAL)
  })

  await t.test('a member sees device requests only by their own code, and the owner’s stream hears every request', async () => {
    const { startRequest, requestById } = await import('./auth/pairing')
    const { mayAnswerRequest, visibleRequests } = await import('./people')
    const { subscribe, publish } = await import('./auth/events')
    const req = await startRequest({ kind: 'mac', name: 'Cleo’s Mac', ip: '203.0.113.31', userAgent: 'MacApp/1', baseUrl: 'http://127.0.0.1:3030', via: 'test' })
    try {
      const pairing = (await requestById(req.id))!
      assert.deepEqual(await visibleRequests(bUser), [], 'a member lists none')
      assert.ok((await visibleRequests(A)).some((r) => r.id === req.id))
      assert.equal(await mayAnswerRequest(bUser, pairing), false, 'no code, no answer')
      assert.equal(await mayAnswerRequest(bUser, pairing, 'WRONG123'), false)
      assert.equal(await mayAnswerRequest(bUser, pairing, req.userCode), true, 'their own device shows the code')
      assert.equal(await mayAnswerRequest(A, pairing), true)
      // Events: a request nobody has claimed reaches the owner’s streams only.
      const heard: Record<string, string[]> = { a: [], b: [] }
      const stops = await Promise.all([
        subscribe({ userId: A.id, deviceId: a.device.id, send: (e) => heard.a.push(e.type) }),
        subscribe({ userId: B.id, deviceId: b.device.id, send: (e) => heard.b.push(e.type) }),
      ])
      try {
        await publish({ userId: null, event: { type: 'pairing', id: req.id, status: 'pending' } as never })
        await new Promise((r) => setTimeout(r, 400))
        assert.deepEqual(heard.a, ['pairing'])
        assert.deepEqual(heard.b, [])
      } finally { for (const stop of stops) stop() }
    } finally { await sql`delete from pairings where id = ${req.id}` }
  })

  await t.test('Telegram: a typed chat id is the owner’s; unlinking does not hand the .env chat back; a member never inherits it', async () => {
    const { chatIdOf } = await import('./notify')
    const { redeemLinkCode, createLinkCode, unlinkTelegram, setTypedChat, userForChat } = await import('./telegram-link')
    process.env.TELEGRAM_ALLOWED_CHAT_ID = '555000'
    try {
      clearUserCache(); clearUsersCache()
      const owner = (await ownerUser())!
      assert.equal(chatIdOf(bUser), undefined, 'a member without a link has no chat, whatever .env says')
      // The owner typed one: it is theirs, and only theirs.
      await setTypedChat(B.id, '555111')
      clearUserCache(); clearUsersCache()
      assert.equal(await userForChat('555111') !== null, true)
      // A chat linked by one person is released from the other.
      const { code } = await createLinkCode(owner)
      const linked = await redeemLinkCode(code, '555111')
      assert.ok(linked.ok && linked.user.id === A.id)
      assert.equal((await userForChat('555111'))?.id, A.id, 'the chat moved to the person who proved they hold it')
      const { user: stale } = { user: (await sql`select profile from users where id = ${B.id}`)[0] }
      assert.equal(stale.profile.telegram?.chatId, undefined, 'B no longer holds it')
      assert.ok(stale.profile.telegram?.unlinkedAt, 'and the release is recorded')
      await unlinkTelegram(owner)
      clearUserCache(); clearUsersCache()
      const after = (await ownerUser())!
      assert.equal(chatIdOf(after), undefined, 'unlinked on purpose: the .env chat does not come back')
    } finally {
      delete process.env.TELEGRAM_ALLOWED_CHAT_ID
      await sql`update users set profile = profile - 'telegram' where id in (${A.id}, ${B.id})`
      clearUserCache(); clearUsersCache()
    }
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
  await t.test('party limits hold under racing writes, and the chest is one a week however many parties', async () => {
    const { db, schema } = await import('@/db')
    const { addDays, localDate } = await import('./time')
    const { weekStart } = await import('@/domain/quests')
    const { answerInvite, awardPartyChests, cheer, createParty, inviteToParty, leaveParty, partyView } = await import('./party')
    const { PARTY_MAX_MEMBERS, PARTY_MAX_PER_PERSON } = await import('@relife/contract')
    const made: string[] = []
    const mk = async (name: string) => {
      const [u] = await db.insert(schema.users).values({ name, role: 'member', timezone: A.timezone, baseCurrency: A.baseCurrency, profile: {} }).returning()
      made.push(u.id)
      return u
    }
    const shows = async (userId: string, days: string[]) => {
      const [sch] = await db.insert(schema.schedules).values({ userId, name: 'Walk', kind: 'routine', category: 'health', rrule: 'DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY' }).returning()
      for (const d of days) await db.insert(schema.checks).values({ scheduleId: sch.id, occurrence: new Date(`${d}T03:30:00Z`), localDate: d, status: 'done' })
    }
    const backdate = (partyId: string) => sql`update party_members set joined_at = now() - interval '14 days' where party_id = ${partyId} and status = 'active'`
    try {
      clearUsersCache()
      const [c, d, e] = [await mk('Cy'), await mk('Di'), await mk('Ed')]
      const crowd = await Promise.all(Array.from({ length: PARTY_MAX_MEMBERS }, (_, i) => mk(`Crowd ${i}`)))
      clearUsersCache()

      // A party holds 8: with one place left, two asks at once fill it once.
      const full = await createParty(c, { name: 'Full house', invite: crowd.slice(0, PARTY_MAX_MEMBERS - 2).map((u) => u.id) })
      parties.push(full)
      const asks = await Promise.allSettled([inviteToParty(c, full, crowd[PARTY_MAX_MEMBERS - 2].id), inviteToParty(c, full, crowd[PARTY_MAX_MEMBERS - 1].id)])
      assert.equal(asks.filter((r) => r.status === 'fulfilled').length, 1, 'one place, one ask')
      await assert.rejects(() => inviteToParty(c, full, d.id), /holds up to/)
      await assert.rejects(() => createParty(c, { name: 'Too many', invite: crowd.map((u) => u.id) }), /holds up to/)

      // Three parties each: with two taken, two starts at once make one.
      const mine = [await createParty(d, { name: 'D1', invite: [] }), await createParty(d, { name: 'D2', invite: [] })]
      parties.push(...mine)
      const starts = await Promise.allSettled([createParty(d, { name: 'D3', invite: [] }), createParty(d, { name: 'D3 again', invite: [] })])
      assert.equal(starts.filter((r) => r.status === 'fulfilled').length, PARTY_MAX_PER_PERSON - 2)
      for (const r of starts) if (r.status === 'fulfilled') parties.push(r.value)
      await assert.rejects(() => createParty(d, { name: 'D4', invite: [] }), /already/)

      // An invitation to a party everyone has left is gone, not a way back in.
      const brief = await createParty(e, { name: 'Brief', invite: [c.id] })
      await leaveParty(e, brief)
      await assert.rejects(() => answerInvite(c, brief, true), /gone|ended/)

      // Cheers: once a day to the same person, and the card hears whether it can reach them.
      const duo = await createParty(c, { name: 'Duo', invite: [e.id] })
      parties.push(duo)
      await answerInvite(e, duo, true)
      const view = (await partyView(c, duo))!
      const eMember = view.members.find((m) => !m.you)!
      assert.deepEqual(await cheer(c, eMember.id), { queued: false }, 'no phone or Telegram: nothing was queued')
      const phone = await createDevice({ userId: e.id, kind: 'browser', name: 'Ed phone', scopes: ['full'] })
      await db.insert(schema.pushSubscriptions).values({ userId: e.id, deviceId: phone.device.id, endpoint: `https://push.example/${randomBytes(6).toString('hex')}`, p256dh: 'p'.repeat(20), auth: 'a'.repeat(12) })
      assert.deepEqual(await cheer(c, eMember.id), { queued: true })
      await assert.rejects(() => cheer(c, eMember.id), /already cheered/)

      // The chest. Two people who both showed up 5 days last week, joined two weeks ago.
      const monday = weekStart(localDate(new Date(), A.timezone))
      const lastWeek = [0, 1, 2, 3, 4].map((i) => addDays(monday, -7 + i))
      await shows(c.id, lastWeek)
      await shows(e.id, lastWeek.slice(0, 4))
      // A streak freeze on the fifth day is not showing up.
      await db.insert(schema.streakFreezes).values({ userId: e.id, localDate: lastWeek[4] })
      await sql`delete from parties where id = ${full}` // c is in 3 parties at most: keep the count low
      await backdate(duo)
      assert.equal(await awardPartyChests(c), 0, 'a day a freeze covered does not count')
      await sql`delete from streak_freezes where user_id = ${e.id}`
      await shows(e.id, [lastWeek[4]])
      assert.equal(await awardPartyChests(c), 1, 'cleared: one chest')
      assert.equal(await awardPartyChests(c), 0, 'and not again')
      // A second party with the same two people pays nothing more for the same week.
      const again = await createParty(c, { name: 'Duo 2', invite: [e.id] })
      parties.push(again)
      await answerInvite(e, again, true)
      await backdate(again)
      assert.equal(await awardPartyChests(c), 0, 'one chest a week, whatever the number of parties')
      assert.equal(await awardPartyChests(e), 1, 'each person has their own')
      const refs = (await sql`select ref from chests where user_id = ${c.id} and ref like 'party:%'`).map((r) => r.ref)
      assert.deepEqual(refs, [`party:${(await import('@/domain/party')).isoWeek(addDays(monday, -7))}`])
      // Together: the same chest cannot be paid twice by two runs at once.
      await sql`delete from chests where user_id = ${e.id}`
      const both = await Promise.all([awardPartyChests(e), awardPartyChests(e)])
      assert.equal(both[0] + both[1], 1)
    } finally {
      for (const id of made) await sql`delete from users where id = ${id}`
      clearUsersCache()
    }
  })
})
