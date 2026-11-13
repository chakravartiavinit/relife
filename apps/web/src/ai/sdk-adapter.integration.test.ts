import assert from 'node:assert/strict'
import test from 'node:test'
import { generateText, Output } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'
import { prepareRuntime, RUNTIME_BUDGETS } from './runtime-policy'

test('MockLanguageModelV3 receives the bounded plan runtime and returns candidate-only output', async () => {
  const calls: unknown[] = []
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      calls.push(options)
      return {
        content: [{ type: 'text', text: '{"statIds":["tracker:github.commits"]}' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: { inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 4, text: 4, reasoning: undefined } },
        warnings: [],
      }
    },
  })
  const runtime = prepareRuntime('plan', 'integration.candidate-only', {
    model,
    prompt: JSON.stringify({ candidates: [{ statId: 'tracker:github.commits' }], task: 'Return candidate IDs only.' }),
    output: Output.object({ schema: z.object({ statIds: z.array(z.string()) }) }),
    maxRetries: 99,
    maxOutputTokens: 99_999,
    timeout: { totalMs: 999_999, stepMs: 999_999 },
  })
  const result = await generateText(runtime.args)
  assert.deepEqual(result.output, { statIds: ['tracker:github.commits'] })
  assert.equal(calls.length, 1)
  assert.equal(runtime.args.maxRetries, 1)
  assert.equal(runtime.args.maxOutputTokens, RUNTIME_BUDGETS.plan.maxOutputTokens)
  assert.deepEqual(runtime.args.timeout, { totalMs: RUNTIME_BUDGETS.plan.totalMs, stepMs: RUNTIME_BUDGETS.plan.stepMs })
})
