import assert from 'node:assert/strict'
import test from 'node:test'
import { eq } from 'drizzle-orm'

const enabled = process.env.RELIFE_RUN_INTEGRATION === '1'

function assertLocalMockBase() {
  assert.equal(process.env.RELIFE_MOCK, '1', 'run integration requires RELIFE_MOCK=1')
  const raw = process.env.DATABASE_URL
  assert.ok(raw, 'run integration requires DATABASE_URL')
  const url = new URL(raw)
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'run integration requires a loopback database host')
  assert.equal(url.port, '5442', 'run integration requires local Docker PostgreSQL')
  assert.ok(url.pathname.length > 1 && !url.pathname.endsWith('_mock'), 'run integration requires the local mock base URL')
}

test('generate wrapper logs safe metadata only with MockLanguageModelV3', { skip: !enabled }, async () => {
  assertLocalMockBase()
  const { db, databaseUrl, schema, sql } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'))
  const { generate } = await import('./run')
  const { MockLanguageModelV3 } = await import('ai/test')
  const label = `integration.run.${crypto.randomUUID()}`
  const promptSecret = 'DO-NOT-PERSIST-THIS-PROMPT'
  const errorSecret = 'DO-NOT-PERSIST-THIS-ERROR'
  try {
    const successModel = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'DO-NOT-PERSIST-THIS-RESPONSE' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: { inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 4, text: 4, reasoning: undefined } },
        warnings: [],
      }),
    })
    await generate('chat', label, { model: successModel, prompt: promptSecret, maxRetries: 0 })

    const errorModel = new MockLanguageModelV3({
      doGenerate: async () => { throw new Error(errorSecret) },
    })
    await assert.rejects(() => generate('chat', label, { model: errorModel, prompt: promptSecret, maxRetries: 0 }))

    const rows = await db.select().from(schema.llmRuns).where(eq(schema.llmRuns.task, label))
    assert.equal(rows.length, 2)
    const ok = rows.find((row) => row.ok)
    const failed = rows.find((row) => !row.ok)
    assert.ok(ok && failed)
    assert.equal(ok.inputTokens, 3)
    assert.equal(ok.outputTokens, 4)
    assert.deepEqual(ok.response, { finishReason: 'stop' })
    assert.equal(ok.request, null)
    assert.equal(ok.error, null)
    assert.equal(failed.request, null)
    assert.equal(failed.error, 'unknown')
    assert.equal(failed.response, null)
    const persisted = JSON.stringify(rows)
    assert.ok(!persisted.includes(promptSecret))
    assert.ok(!persisted.includes(errorSecret))
    assert.ok(!persisted.includes('DO-NOT-PERSIST-THIS-RESPONSE'))
  } finally {
    try {
      await db.delete(schema.llmRuns).where(eq(schema.llmRuns.task, label))
    } finally {
      await sql.end()
    }
  }
})
