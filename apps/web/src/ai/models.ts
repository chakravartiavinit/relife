import { createProviderRegistry, type LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { env } from '@/core/env'

// Bring your own key: pick any model per task with env vars like
//   LLM_DEFAULT=anthropic:claude-sonnet-5-5
//   LLM_PARSE=local:llama3.1     (Ollama / LM Studio, OpenAI-compatible)
// Provider keys come from env() (Connections page, then .env).

export type Task = 'parse' | 'plan' | 'chat'

/** Provider → env var holding its key (null = no key needed). */
export const KEY_ENV: Record<string, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  local: null, // no key needed
}

// Built per call with explicit keys: keys come from the Connections page and can change while running.
function makeRegistry() {
  return createProviderRegistry({
    anthropic: createAnthropic({ apiKey: env('ANTHROPIC_API_KEY') }),
    openai: createOpenAI({ apiKey: env('OPENAI_API_KEY') }),
    google: createGoogleGenerativeAI({ apiKey: env('GOOGLE_GENERATIVE_AI_API_KEY') }),
    local: createOpenAICompatible({ name: 'local', baseURL: env('LOCAL_LLM_URL') ?? 'http://localhost:11434/v1' }),
    openrouter: createOpenAICompatible({ name: 'openrouter', baseURL: 'https://openrouter.ai/api/v1', apiKey: env('OPENROUTER_API_KEY') }),
  })
}

/** "provider:model-id" for a task, or undefined when nothing is configured. */
export function modelId(task: Task): string | undefined {
  const id = env(`LLM_${task.toUpperCase()}`) || env('LLM_DEFAULT')
  return id?.trim() || undefined
}

export function aiEnabled(task: Task = 'chat'): boolean {
  const id = modelId(task)
  if (!id || !id.includes(':')) return false
  const provider = id.slice(0, id.indexOf(':'))
  if (!(provider in KEY_ENV)) return false
  const keyEnv = KEY_ENV[provider]
  return keyEnv === null || !!env(keyEnv)
}

export function model(task: Task): LanguageModel {
  const id = modelId(task)
  if (!id || !aiEnabled(task)) throw new Error(`No LLM configured for "${task}". Set LLM_DEFAULT=provider:model and the provider key.`)
  return makeRegistry().languageModel(id as `anthropic:${string}`)
}
