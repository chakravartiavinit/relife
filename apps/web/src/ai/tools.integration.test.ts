import assert from 'node:assert/strict'
import test from 'node:test'
import { eq } from 'drizzle-orm'

const enabled = process.env.RELIFE_TOOL_INTEGRATION === '1'

function assertLocalMockBase() {
  assert.equal(process.env.RELIFE_MOCK, '1', 'tool integration requires RELIFE_MOCK=1')
  const raw = process.env.DATABASE_URL
  assert.ok(raw, 'tool integration requires DATABASE_URL')
  const url = new URL(raw)
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'tool integration requires a loopback database host')
  assert.equal(url.port, '5442', 'tool integration requires local Docker PostgreSQL')
  assert.ok(url.pathname.length > 1 && !url.pathname.endsWith('_mock'), 'tool integration requires the local mock base URL')
}

test('AI tools scope reads to their user and create only safe pending proposals', { skip: !enabled }, async () => {
  assertLocalMockBase()
  const { db, databaseUrl, schema, sql } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'))
  const { dataTools } = await import('./tools')
  const run = `tool-integration:${crypto.randomUUID()}`
  const ids: string[] = []
  const cleanup = async () => {
    for (const userId of ids.reverse()) {
      await db.delete(schema.insights).where(eq(schema.insights.userId, userId))
      await db.delete(schema.systemQuests).where(eq(schema.systemQuests.userId, userId))
      await db.delete(schema.users).where(eq(schema.users.id, userId))
    }
  }
  try {
    const [user, foreign] = await db.insert(schema.users).values([
      { name: `Tool integration ${run}`, timezone: 'Asia/Kolkata', baseCurrency: 'INR', profile: { onboardedAt: new Date().toISOString() } },
      { name: `Tool foreign ${run}`, timezone: 'Asia/Kolkata', baseCurrency: 'INR', profile: { onboardedAt: new Date().toISOString() } },
    ]).returning()
    ids.push(user.id, foreign.id)
    await db.insert(schema.systemQuests).values([
      { userId: user.id, kind: 'daily', fromDate: '2026-11-10', toDate: '2026-11-10', statId: 'owned', statName: 'Owned', area: 'skills', unit: null, op: 'gte', agg: 'sum', target: 1, rank: 'E', xp: 20, title: `Owned ${run}`, reason: run, status: 'failed', progress: 0, ref: `${run}:owned` },
      { userId: foreign.id, kind: 'daily', fromDate: '2026-11-10', toDate: '2026-11-10', statId: 'foreign', statName: 'Foreign', area: 'skills', unit: null, op: 'gte', agg: 'sum', target: 1, rank: 'E', xp: 20, title: `Foreign ${run}`, reason: run, status: 'failed', progress: 0, ref: `${run}:foreign` },
    ])
    const tools = dataTools(user)
    const historyResult = await tools.quest_history.execute!({ from: '2026-11-01', to: '2026-11-11' }, { toolCallId: 'history', messages: [], abortSignal: undefined })
    assert.ok(Array.isArray(historyResult), 'quest history returns materialized user-scoped rows')
    const history = historyResult as { title: string }[]
    assert.equal(history.length, 1)
    assert.equal(history[0]?.title, `Owned ${run}`)
    const badRange = await tools.quest_history.execute!({ from: '2026-11-11', to: '2027-01-01' }, { toolCallId: 'bad-range', messages: [], abortSignal: undefined })
    assert.deepEqual(badRange, { error: 'Date ranges cannot include future dates.' })

    const unsafe = await tools.propose_schedule.execute!({
      title: 'Set dose reminder', why: 'Take 5 mg before sleep', schedule: { name: '5 mg capsule', kind: 'routine', category: 'health', rrule: 'FREQ=DAILY', unit: 'mg' },
    }, { toolCallId: 'unsafe', messages: [], abortSignal: undefined })
    assert.deepEqual(unsafe, { pending: false, reason: 'AI cannot create medicine or dosage reminders. Use the medicine form instead.' })
    const safeResult = await tools.propose_schedule.execute!({
      title: 'Wind down', why: 'A short evening routine may help consistency.', schedule: { name: 'Wind down', kind: 'routine', category: 'mind', rrule: 'FREQ=DAILY;BYHOUR=22' },
    }, { toolCallId: 'safe', messages: [], abortSignal: undefined })
    assert.ok(!(Symbol.asyncIterator in Object(safeResult)), 'schedule proposal is a materialized pending-result object')
    const safe = safeResult as { pending: boolean }
    assert.equal(safe.pending, true)
    const proposals = await db.select().from(schema.insights).where(eq(schema.insights.userId, user.id))
    assert.equal(proposals.length, 1)
    assert.equal(proposals[0]?.status, 'pending')
  } finally {
    try {
      await cleanup()
    } finally {
      await sql.end()
    }
  }
})
