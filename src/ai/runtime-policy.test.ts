import assert from 'node:assert/strict'
import test from 'node:test'
import { AI_RUNTIME, failedRun, prepareRuntime, successfulRun } from './runtime-policy'

test('runtime policy caps retries and output tokens', () => {
  const { args } = prepareRuntime({ maxRetries: 9, maxOutputTokens: 9_999 })
  assert.equal(args.maxRetries, AI_RUNTIME.maxRetries)
  assert.equal(args.maxOutputTokens, AI_RUNTIME.maxOutputTokens)
  assert.equal(prepareRuntime({}).args.maxOutputTokens, AI_RUNTIME.defaultOutputTokens)
})

test('runtime policy preserves caller cancellation', () => {
  const controller = new AbortController()
  const { args } = prepareRuntime({ abortSignal: controller.signal })
  controller.abort()
  assert.equal(args.abortSignal.aborted, true)
})

test('runtime policy times out through its abort signal', async () => {
  const { args } = prepareRuntime({}, 5)
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(args.abortSignal.aborted, true)
})

test('telemetry records operational metadata only', () => {
  const success = successfulRun('plan.secret', 'provider:model', 42, { inputTokens: 3, outputTokens: 5 })
  const timeout = AbortSignal.abort()
  const failure = failedRun('plan.secret', 'provider:model', 42, new Error('private prompt text'), timeout)

  assert.deepEqual(success, { task: 'plan.secret', model: 'provider:model', ok: true, ms: 42, inputTokens: 3, outputTokens: 5 })
  assert.deepEqual(failure, { task: 'plan.secret', model: 'provider:model', ok: false, ms: 42, error: 'timeout' })
})

test('telemetry recognizes AI SDK-prefixed error names', () => {
  const timeout = new AbortController().signal
  const error = (name: string) => Object.assign(new Error('private provider detail'), { name })

  assert.equal(failedRun('task', 'model', 1, error('AI_APICallError'), timeout).error, 'provider')
  assert.equal(failedRun('task', 'model', 1, error('AI_NoOutputGeneratedError'), timeout).error, 'invalid_output')
})
