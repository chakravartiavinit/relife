import assert from 'node:assert/strict'
import test from 'node:test'
import { eq } from 'drizzle-orm'

/**
 * Opt-in (needs PostgreSQL): normal `npm test` never imports the DB client. Runs against the mock database, with the Telegram and
 * push senders replaced by stubs, so nothing reaches a real chat or push service:
 *
 *   RELIFE_MOCK=1 RELIFE_OUTBOX_INTEGRATION=1 npx tsx --env-file=../../.env --test src/core/outbox.integration.test.ts
 */
const enabled = process.env.RELIFE_OUTBOX_INTEGRATION === '1'

test('one message fans out to Telegram and push, with the rules applied once', { skip: !enabled }, async (t) => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'these tests need RELIFE_MOCK=1')
  const { db, databaseUrl, schema } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'the effective database must be a _mock one')
  const outbox = await import('./outbox')
  const { createDevice } = await import('./auth/devices')

  const [user] = await db.insert(schema.users).values({ name: `Outbox test ${crypto.randomUUID().slice(0, 8)}` }).returning()
  const { device } = await createDevice({ userId: user.id, kind: 'phone', name: 'Test phone', scopes: ['full'] })

  // Stubs: Telegram hands out message ids; push says yes or no. Both record what they were given.
  let nextId = 100
  const telegram = { sent: [] as string[], deleted: [] as number[], ok: true }
  const push = { sent: [] as { tag: string; title: string; renotify: boolean; actions: number }[], ok: true }
  const real = { ...outbox.senders }
  outbox.senders.sendMessage = async (text) => { if (!telegram.ok) return null; telegram.sent.push(text); return ++nextId }
  outbox.senders.deleteMessage = async (id) => { telegram.deleted.push(id) }
  outbox.senders.sendPush = async (_user, p) => { push.sent.push({ tag: p.tag, title: p.title, renotify: p.renotify, actions: p.actions.length }); return push.ok }
  const keys = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_CHAT_ID'] as const
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  const setTelegram = (on: boolean) => { for (const k of keys) { if (on) process.env[k] = 'test'; else delete process.env[k] } }
  const setPush = async (on: boolean) => {
    await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, user.id))
    if (on) await db.insert(schema.pushSubscriptions).values({ userId: user.id, deviceId: device.id, endpoint: `https://push.example/${crypto.randomUUID()}`, p256dh: 'p'.repeat(20), auth: 'a'.repeat(12) })
  }
  const reset = async () => {
    telegram.sent.length = 0; telegram.deleted.length = 0; telegram.ok = true; push.sent.length = 0; push.ok = true
    await db.delete(schema.notifications).where(eq(schema.notifications.userId, user.id))
    await setPrefs({})
  }
  // No quiet hours, so the tests do not depend on the time of day.
  const setPrefs = async (categories: NonNullable<typeof user.profile.notifications>['categories']) => {
    user.profile = { notifications: { quiet: null, categories } }
    await db.update(schema.users).set({ profile: user.profile }).where(eq(schema.users.id, user.id))
  }
  const rows = () => db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id))
  t.after(async () => {
    Object.assign(outbox.senders, real)
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
    await db.delete(schema.users).where(eq(schema.users.id, user.id)) // cascades devices, subscriptions, notifications
    await db.$client.end({ timeout: 2 })
  })
  const buttons = [[{ text: '✅ Done', data: `r:d:${crypto.randomUUID()}` }]]

  await t.test('Telegram only: as before push existed', async () => {
    await reset(); setTelegram(true); await setPush(false)
    await outbox.notify(user, 'events', { text: '⭐ <b>Level up</b>', ref: 'test:a' })
    assert.equal(telegram.sent.length, 1)
    assert.equal(push.sent.length, 0)
    const [r] = await rows()
    assert.deepEqual(r.channels, ['telegram'])
    assert.equal(r.status, 'done')
    assert.ok(r.messageId)
    assert.equal(await outbox.outcome(user.id, 'test:a'), 'sent')
    assert.deepEqual(await outbox.channelsFor(user.id, 'test:a'), ['telegram'])
  })

  await t.test('push only: notify() queues and sends with no Telegram at all', async () => {
    await reset(); setTelegram(false); await setPush(true)
    await outbox.notify(user, 'events', { text: '⭐ <b>Level up</b>\nLevel 8', ref: 'test:b' })
    assert.equal(telegram.sent.length, 0)
    assert.deepEqual(push.sent.map((p) => p.title), ['⭐ Level up'])
    const [r] = await rows()
    assert.deepEqual(r.channels, ['push'])
    assert.equal(r.messageId, null)
    assert.equal(await outbox.outcome(user.id, 'test:b'), 'sent', 'a push-only send counts as sent')
    assert.equal(await outbox.delivered(user.id, 'test:b'), true)
  })

  await t.test('no channel at all: nothing is queued', async () => {
    await reset(); setTelegram(false); await setPush(false)
    await outbox.notify(user, 'events', { text: 'hello', ref: 'test:c' })
    assert.equal((await rows()).length, 0)
  })

  await t.test('both channels take one row; the daily cap counts one message, not two', async () => {
    await reset(); setTelegram(true); await setPush(true)
    await outbox.notify(user, 'coach', { text: 'one' }) // coach: at most 1 a day
    assert.equal(telegram.sent.length, 1)
    assert.equal(push.sent.length, 1)
    const [r] = await rows()
    assert.deepEqual(r.channels, ['telegram', 'push'])
    await outbox.notify(user, 'coach', { text: 'two' })
    assert.equal(telegram.sent.length, 1, 'the cap held the second message on both channels')
    assert.equal(push.sent.length, 1)
    assert.equal((await rows()).filter((x) => x.status === 'skipped').length, 1)
  })

  await t.test('a category can send to one channel only', async () => {
    await reset(); setTelegram(true); await setPush(true)
    await setPrefs({ events: { channels: ['push'] } })
    await outbox.notify(user, 'events', { text: 'only push' })
    assert.equal(telegram.sent.length, 0)
    assert.equal(push.sent.length, 1)
  })

  await t.test('when the chosen channel is not set up it falls back to the one that is, so nothing goes silent', async () => {
    await reset(); setTelegram(false); await setPush(true)
    await setPrefs({ events: { channels: ['telegram'] } })
    await outbox.notify(user, 'events', { text: 'falls back' })
    assert.equal(push.sent.length, 1)
    assert.equal((await rows())[0].status, 'done')
  })

  await t.test('repeats: Telegram deletes and resends, push resends with the same tag and renotify; an answer on either stops both', async () => {
    await reset(); setTelegram(true); await setPush(true)
    await outbox.notify(user, 'reminders', { text: '⏰ <b>Vitamin D</b>', buttons, ref: 'other:1' })
    const [first] = await rows()
    assert.equal(first.status, 'sent', 'reminders repeat until answered')
    assert.equal(push.sent[0].actions, 1)
    // 31 minutes later, still unanswered.
    await outbox.flushOutbox(user, new Date(Date.now() + 31 * 60_000))
    assert.equal(telegram.sent.length, 2)
    assert.equal(telegram.deleted.length, 1, 'the older Telegram copy is removed')
    assert.equal(push.sent.length, 2)
    assert.equal(push.sent[1].tag, first.id, 'the same tag replaces the old notification')
    assert.equal(push.sent[1].renotify, true, 'and buzzes again')
    // An answer from the phone (push action) stops repeats on Telegram too.
    await outbox.markAnsweredById(user.id, first.id)
    await outbox.flushOutbox(user, new Date(Date.now() + 70 * 60_000))
    assert.equal(telegram.sent.length, 2)
    assert.equal(push.sent.length, 2)
    assert.equal((await rows())[0].status, 'answered')
  })

  await t.test('an answer from Telegram stops the push repeats', async () => {
    await reset(); setTelegram(true); await setPush(true)
    await outbox.notify(user, 'reminders', { text: '⏰ <b>Stretch</b>', buttons, ref: 'other:2' })
    const [row] = await rows()
    await outbox.markAnswered(user.id, row.messageId!)
    await outbox.flushOutbox(user, new Date(Date.now() + 31 * 60_000))
    assert.equal(push.sent.length, 1)
    assert.equal(telegram.sent.length, 1)
  })

  await t.test('every channel failing retries the row; one succeeding is enough', async () => {
    await reset(); setTelegram(true); await setPush(true)
    telegram.ok = false; push.ok = false
    await outbox.notify(user, 'events', { text: 'flaky', ref: 'other:3' })
    let [r] = await rows()
    assert.equal(r.status, 'queued')
    assert.equal(r.sends, -1)
    assert.deepEqual(r.channels, [])
    assert.equal(await outbox.outcome(user.id, 'other:3'), 'failed')
    push.ok = true // the push service is back; Telegram still is not
    await outbox.flushOutbox(user, new Date(Date.now() + 2 * 60_000))
    ;[r] = await rows()
    assert.equal(r.status, 'done')
    assert.deepEqual(r.channels, ['push'])
  })

  await t.test('sendPush: only the push service\'s own trouble (429, 5xx) counts toward giving up; offline counts for nothing; gone removes', async () => {
    const real = await import('./push')
    const was = real.pushTransport.send
    const err = console.error
    console.error = () => {}
    try {
      await reset(); await setPush(true)
      const row = () => db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, user.id))
      const payload = { id: 'x', tag: 'x', renotify: false, title: 't', body: 'b', actions: [], url: '/' } as never
      const opts = { ttl: 60, urgency: 'normal' as const }
      real.pushTransport.send = async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) }
      assert.equal(await real.sendPush(user.id, payload, opts), false)
      assert.equal((await row())[0].failures, 0, 'being offline is not the subscription\'s fault')
      real.pushTransport.send = async () => { throw Object.assign(new Error('busy'), { statusCode: 503 }) }
      await real.sendPush(user.id, payload, opts)
      assert.equal((await row())[0].failures, 1)
      real.pushTransport.send = async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }) }
      await real.sendPush(user.id, payload, opts)
      assert.equal((await row()).length, 0, 'the push service says it is gone')
    } finally { real.pushTransport.send = was; console.error = err }
  })

  await t.test('saveSubscription never moves another account\'s endpoint', async () => {
    const { saveSubscription } = await import('./push')
    await reset(); await setPush(true)
    const [mine] = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, user.id))
    const [other] = await db.insert(schema.users).values({ name: `Outbox other ${crypto.randomUUID().slice(0, 8)}` }).returning()
    try {
      const { device: theirs } = await createDevice({ userId: other.id, kind: 'phone', name: 'Their phone', scopes: ['full'] })
      const sub = { endpoint: mine.endpoint, keys: { p256dh: 'q'.repeat(20), auth: 'b'.repeat(12) } }
      assert.equal(await saveSubscription({ userId: other.id, deviceId: theirs.id, sub, via: null, userAgent: null }), false)
      const [after] = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, mine.endpoint))
      assert.equal(after.userId, user.id, 'still this account\'s')
      assert.equal(after.p256dh, mine.p256dh, 'and untouched')
      assert.equal(await saveSubscription({ userId: user.id, deviceId: device.id, sub, via: null, userAgent: null }), true, 'its own browser can renew it')
    } finally { await db.delete(schema.users).where(eq(schema.users.id, other.id)) }
  })
})
