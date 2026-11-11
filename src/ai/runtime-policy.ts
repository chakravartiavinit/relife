import type { CallSettings, TimeoutConfiguration } from 'ai'
import type { Task } from './models'

export type RuntimeBudget = {
  totalMs: number
  stepMs: number
  maxRetries: number
  defaultOutputTokens: number
  maxOutputTokens: number
}

export const RUNTIME_BUDGETS: Record<Task | 'classify', RuntimeBudget> = {
  chat: { totalMs: 120_000, stepMs: 30_000, maxRetries: 1, defaultOutputTokens: 4_096, maxOutputTokens: 8_192 },
  parse: { totalMs: 180_000, stepMs: 90_000, maxRetries: 1, defaultOutputTokens: 8_192, maxOutputTokens: 16_384 },
  plan: { totalMs: 120_000, stepMs: 60_000, maxRetries: 1, defaultOutputTokens: 6_144, maxOutputTokens: 12_288 },
  classify: { totalMs: 45_000, stepMs: 45_000, maxRetries: 1, defaultOutputTokens: 2_048, maxOutputTokens: 4_096 },
}

type RuntimeSettings = Pick<CallSettings, 'abortSignal' | 'maxRetries' | 'maxOutputTokens' | 'timeout'>

const limit = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(Math.floor(value!), min), max) : fallback

const timeoutPart = (timeout: TimeoutConfiguration | undefined, key: 'totalMs' | 'stepMs') =>
  typeof timeout === 'number' ? key === 'totalMs' ? timeout : undefined : timeout?.[key]

export function runtimeBudget(task: Task, label: string) {
  return task === 'parse' && label === 'job.classify-sites' ? RUNTIME_BUDGETS.classify : RUNTIME_BUDGETS[task]
}

/** Applies task limits while retaining caller-provided lower limits and cancellation. */
export function prepareRuntime<T extends RuntimeSettings>(task: Task, label: string, args: T, budget = runtimeBudget(task, label)) {
  const totalMs = limit(timeoutPart(args.timeout, 'totalMs'), budget.totalMs, 1, budget.totalMs)
  const stepMs = limit(timeoutPart(args.timeout, 'stepMs'), budget.stepMs, 1, Math.min(budget.stepMs, totalMs))
  const timeoutSignal = AbortSignal.timeout(totalMs)
  const abortSignal = args.abortSignal ? AbortSignal.any([args.abortSignal, timeoutSignal]) : timeoutSignal

  return {
    args: {
      ...args,
      abortSignal,
      maxRetries: limit(args.maxRetries, budget.maxRetries, 0, budget.maxRetries),
      maxOutputTokens: limit(args.maxOutputTokens, budget.defaultOutputTokens, 1, budget.maxOutputTokens),
      timeout: { totalMs, stepMs },
    },
    timeoutSignal,
  }
}

type Usage = { inputTokens?: number | null; outputTokens?: number | null }
type ProviderError = { statusCode?: number; retryable?: boolean }

const FINISH_REASONS = new Set(['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other'])

/** The llm_runs payload intentionally contains no prompt, response, or exception text. */
export function successfulRun(task: string, model: string, ms: number, usage: Usage, finishReason: string) {
  return {
    task,
    model,
    ok: true,
    ms,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    response: { finishReason: FINISH_REASONS.has(finishReason) ? finishReason : 'other' },
  }
}

export function failedRun(task: string, model: string, ms: number, error: unknown, timeoutSignal: AbortSignal, callerSignal?: AbortSignal) {
  const providerError = providerErrorMetadata(error)
  return {
    task,
    model,
    ok: false,
    ms,
    error: errorCategory(error, timeoutSignal, callerSignal),
    ...(providerError ? { response: providerError } : {}),
  }
}

function errorCategory(error: unknown, timeoutSignal: AbortSignal, callerSignal?: AbortSignal) {
  if (timeoutSignal.aborted) return 'timeout'
  if (callerSignal?.aborted || error instanceof DOMException && error.name === 'AbortError') return 'cancelled'

  const name = (error instanceof Error ? error.name : '').replace(/^AI_/, '')
  if (/^(InvalidArgument|InvalidDataContent|InvalidMessageRole|MessageConversion|ToolChoiceViolation)Error$/.test(name)) return 'invalid_request'
  if (/^(InvalidToolInput|NoSuchTool|ToolCallRepair)Error$/.test(name)) return 'tool'
  if (/^(No(?:Output|Object|Content)Generated|JSONParse|TypeValidation|InvalidResponseData)Error$/.test(name)) return 'invalid_output'
  if (/^(Retry|APICall|Download|LoadAPIKey|NoSuch(?:Model|Provider))Error$/.test(name)) return 'provider'
  return 'unknown'
}

function providerErrorMetadata(error: unknown): ProviderError | undefined {
  const values = [error, asRecord(error)?.lastError, asRecord(error)?.cause]
  for (const value of values) {
    const record = asRecord(value)
    if (!record) continue
    const statusCode = typeof record.statusCode === 'number' && Number.isInteger(record.statusCode) && record.statusCode >= 100 && record.statusCode <= 599 ? record.statusCode : undefined
    const retryable = typeof record.isRetryable === 'boolean' ? record.isRetryable : undefined
    if (statusCode !== undefined || retryable !== undefined) return { ...(statusCode !== undefined ? { statusCode } : {}), ...(retryable !== undefined ? { retryable } : {}) }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}
