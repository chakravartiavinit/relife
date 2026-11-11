import assert from 'node:assert/strict'
import test from 'node:test'
import { RUNTIME_BUDGETS, failedRun, prepareRuntime, successfulRun } from './runtime-policy'

test('runtime policy gives long structured tasks bounded, reasoning-friendly budgets', () => {
  const parse = prepareRuntime('parse', 'parse.orders.amazon', {})
  const plan = prepareRuntime('plan', 'job.weekly-review', {})
  const chat = prepareRuntime('chat', 'chat.ask', {})
  const classify = prepareRuntime('parse', 'job.classify-sites', {})

  assert.equal(parse.args.timeout.totalMs, RUNTIME_BUDGETS.parse.totalMs)
  assert.equal(parse.args.maxOutputTokens, RUNTIME_BUDGETS.parse.defaultOutputTokens)
  assert.equal(plan.args.maxOutputTokens, RUNTIME_BUDGETS.plan.defaultOutputTokens)
  assert.equal(chat.args.timeout.totalMs, RUNTIME_BUDGETS.chat.totalMs)
  assert.equal(classify.args.timeout.totalMs, RUNTIME_BUDGETS.classify.totalMs)
})

test('runtime policy keeps caller limits only when they are stricter', () => {
  const capped = prepareRuntime('plan', 'job.weekly-review', {
    maxRetries: 9,
    maxOutputTokens: 99_999,
    timeout: { totalMs: 999_999, stepMs: 999_999 },
  })
  const strict = prepareRuntime('plan', 'job.weekly-review', {
    maxRetries: 0,
    maxOutputTokens: 512,
    timeout: { totalMs: 10_000, stepMs: 5_000 },
  })
  assert.equal(capped.args.maxRetries, RUNTIME_BUDGETS.plan.maxRetries)
  assert.equal(capped.args.maxOutputTokens, RUNTIME_BUDGETS.plan.maxOutputTokens)
  assert.deepEqual(capped.args.timeout, { totalMs: RUNTIME_BUDGETS.plan.totalMs, stepMs: RUNTIME_BUDGETS.plan.stepMs })
  assert.equal(strict.args.maxRetries, 0)
  assert.equal(strict.args.maxOutputTokens, 512)
  assert.deepEqual(strict.args.timeout, { totalMs: 10_000, stepMs: 5_000 })
})

test('runtime policy preserves caller cancellation', () => {
  const controller = new AbortController()
  const { args } = prepareRuntime('chat', 'chat.ask', { abortSignal: controller.signal })
  controller.abort()
  assert.equal(args.abortSignal.aborted, true)
})

test('runtime policy times out through its abort signal', async () => {
  const { args } = prepareRuntime('chat', 'chat.ask', {}, { ...RUNTIME_BUDGETS.chat, totalMs: 5, stepMs: 5 })
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(args.abortSignal.aborted, true)
})

test('telemetry records operational metadata only', () => {
  const success = successfulRun('plan.secret', 'provider:model', 42, { inputTokens: 3, outputTokens: 5 }, 'stop')
  const timeout = AbortSignal.abort()
  const failure = failedRun('plan.secret', 'provider:model', 42, new Error('private prompt text'), timeout)

  assert.deepEqual(success, { task: 'plan.secret', model: 'provider:model', ok: true, ms: 42, inputTokens: 3, outputTokens: 5, response: { finishReason: 'stop' } })
  assert.deepEqual(failure, { task: 'plan.secret', model: 'provider:model', ok: false, ms: 42, error: 'timeout' })
})

test('telemetry recognizes AI SDK-prefixed error names and safe provider metadata', () => {
  const timeout = new AbortController().signal
  const error = (name: string, metadata = {}) => Object.assign(new Error('private provider detail'), { name, ...metadata })

  assert.deepEqual(failedRun('task', 'model', 1, error('AI_APICallError', { statusCode: 429, isRetryable: true }), timeout), { task: 'task', model: 'model', ok: false, ms: 1, error: 'provider', response: { statusCode: 429, retryable: true } })
  assert.equal(failedRun('task', 'model', 1, error('AI_NoOutputGeneratedError'), timeout).error, 'invalid_output')
  assert.equal(failedRun('task', 'model', 1, error('AI_JSONParseError'), timeout).error, 'invalid_output')
  assert.equal(failedRun('task', 'model', 1, error('AI_TypeValidationError'), timeout).error, 'invalid_output')
  assert.equal(failedRun('task', 'model', 1, error('AI_NoSuchModelError'), timeout).error, 'provider')
})
