import assert from 'node:assert/strict'
import test from 'node:test'
import { eq } from 'drizzle-orm'

/**
 * Opt-in: normal `npm test` never imports the DB client. Run against the local mock database:
 *
 * RELIFE_MOCK=1 RELIFE_SHARE_INTEGRATION=1 npx tsx --env-file=.env --test src/core/share-card.integration.test.ts
 */
const enabled = process.env.RELIFE_SHARE_INTEGRATION === '1'

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (b: Buffer) => ({ ok: b.subarray(1, 4).toString() === 'PNG', width: b.readUInt32BE(16), height: b.readUInt32BE(20) })

test('share cards: the server loads the numbers, refuses what is not earned, and draws a PNG of the right size', { skip: !enabled }, async () => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const { db, databaseUrl, schema, sql } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'effective database must be an isolated _mock database')
  const { loadShareData } = await import('./share-card')
  const { renderShareCard } = await import('@/ui/share/render')
  const { ACHIEVEMENTS } = await import('@/achievements')
  const { SHARE_FIELDS, SHARE_KINDS, SHARE_SIZES } = await import('@/domain/share-card')
  const { weekStart } = await import('@/domain/quests')

  const [user] = await db.insert(schema.users).values({ name: 'Share Integration', timezone: 'Asia/Kolkata', baseCurrency: 'INR' }).returning()
  const now = new Date('2026-11-13T06:00:00.000Z') // a Friday
  try {
    await db.insert(schema.xpEvents).values({ userId: user.id, localDate: '2026-11-12', area: 'health', kind: 'standard', source: 'seed', amount: 500, verified: true, reason: 'seed', ref: 'share:1' })
    await db.insert(schema.achievements).values({ userId: user.id, key: ACHIEVEMENTS[0].key })

    // Level: the signed-in user's own level; a later level is not earned (404); junk is a 400.
    const lv = await loadShareData(user, 'level', null, now)
    assert.ok(lv.ok && lv.data.kind === 'level')
    const own = lv.ok && lv.data.kind === 'level' ? lv.data.level : 0
    assert.equal(own, 3)
    assert.equal((await loadShareData(user, 'level', '2', now)).ok, true)
    assert.deepEqual(await loadShareData(user, 'level', String(own + 1), now), { ok: false, status: 404, error: 'That level is not reached yet.' })
    assert.equal((await loadShareData(user, 'level', 'abc', now) as { status: number }).status, 400)

    // Achievement: unlocked, locked (404), unknown (400).
    const locked = ACHIEVEMENTS.find((a) => a.key !== ACHIEVEMENTS[0].key)!
    const got = await loadShareData(user, 'achievement', ACHIEVEMENTS[0].key, now)
    assert.ok(got.ok && got.data.kind === 'achievement' && got.data.title === ACHIEVEMENTS[0].name)
    assert.equal((await loadShareData(user, 'achievement', locked.key, now) as { status: number }).status, 404)
    assert.equal((await loadShareData(user, 'achievement', 'nope', now) as { status: number }).status, 400)

    // Weekly: this Monday works; a future week is 404; a Tuesday is a 400. The 500 XP of Thursday shows.
    const monday = weekStart('2026-11-13')
    const wk = await loadShareData(user, 'weekly', monday, now)
    assert.ok(wk.ok && wk.data.kind === 'weekly' && wk.data.xp === 500 && wk.data.topArea === 'Health')
    assert.equal((await loadShareData(user, 'weekly', '2026-11-23', now) as { status: number }).status, 404)
    assert.equal((await loadShareData(user, 'weekly', '2026-11-10', now) as { status: number }).status, 400)

    // Streak never throws on an empty history.
    const st = await loadShareData(user, 'streak', null, now)
    assert.ok(st.ok && st.data.kind === 'streak' && st.data.days === 0)

    // Every kind renders as a PNG of the card's size, in both sizes, with every field on.
    for (const kind of SHARE_KINDS) {
      const r = await loadShareData(user, kind, kind === 'achievement' ? ACHIEVEMENTS[0].key : kind === 'weekly' ? monday : null, now)
      assert.ok(r.ok, kind)
      for (const size of ['square', 'story'] as const) {
        const res = await renderShareCard({ data: r.data, show: SHARE_FIELDS[kind].map((f) => f.id), theme: 'dark', size })
        assert.equal(res.headers.get('content-type'), 'image/png')
        assert.deepEqual(pngSize(Buffer.from(await res.arrayBuffer())), { ok: true, ...SHARE_SIZES[size] }, `${kind} ${size}`)
      }
    }
  } finally {
    try { await db.delete(schema.users).where(eq(schema.users.id, user.id)) } finally { await sql.end() }
  }
})
