import type { CallSettings } from 'ai'

export const AI_RUNTIME = {
  timeoutMs: 45_000,
  maxRetries: 1,
  defaultOutputTokens: 4_096,
  maxOutputTokens: 8_192,
} as const

type RuntimeSettings = Pick<CallSettings, 'abortSignal' | 'maxRetries' | 'maxOutputTokens'>

const limit = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(Math.floor(value!), min), max) : fallback

/** Applies fixed safety limits without replacing a caller's cancellation signal. */
export function prepareRuntime<T extends RuntimeSettings>(args: T, timeoutMs: number = AI_RUNTIME.timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const abortSignal = args.abortSignal ? AbortSignal.any([args.abortSignal, timeoutSignal]) : timeoutSignal

  return {
    args: {
      ...args,
      abortSignal,
      maxRetries: limit(args.maxRetries, AI_RUNTIME.maxRetries, 0, AI_RUNTIME.maxRetries),
      maxOutputTokens: limit(args.maxOutputTokens, AI_RUNTIME.defaultOutputTokens, 1, AI_RUNTIME.maxOutputTokens),
    },
    timeoutSignal,
  }
}

type Usage = { inputTokens?: number | null; outputTokens?: number | null }

/** The llm_runs payload intentionally contains no prompt, response, or exception text. */
export function successfulRun(task: string, model: string, ms: number, usage: Usage) {
  return {
    task,
    model,
    ok: true,
    ms,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
  }
}

export function failedRun(task: string, model: string, ms: number, error: unknown, timeoutSignal: AbortSignal, callerSignal?: AbortSignal) {
  return { task, model, ok: false, ms, error: errorCategory(error, timeoutSignal, callerSignal) }
}

function errorCategory(error: unknown, timeoutSignal: AbortSignal, callerSignal?: AbortSignal) {
  if (timeoutSignal.aborted) return 'timeout'
  if (callerSignal?.aborted || error instanceof DOMException && error.name === 'AbortError') return 'cancelled'

  const name = (error instanceof Error ? error.name : '').replace(/^AI_/, '')
  if (/^(InvalidArgument|InvalidDataContent|InvalidMessageRole|MessageConversion|ToolChoiceViolation)Error$/.test(name)) return 'invalid_request'
  if (/^(InvalidToolInput|NoSuchTool|ToolCallRepair)Error$/.test(name)) return 'tool'
  if (/^No(?:Output|Object)GeneratedError$/.test(name)) return 'invalid_output'
  if (/^(Retry|APICall|Download|LoadAPIKey|NoSuchProvider)Error$/.test(name)) return 'provider'
  return 'unknown'
}
