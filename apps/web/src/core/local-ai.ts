import { modelId, type Task } from '@/ai/models'
import { env } from './env'

// Free local AI (Ollama or LM Studio, anything OpenAI-compatible). `localAiStatus` says whether the server is there and
// has the model, so setup, Coach and Connections can say "Local AI not running" instead of a failed call. `aiEnabled()`
// stays a plain config check; AI calls fail soft on their own.

/** The model setup offers. RELIFE_LOCAL_AI_MODEL overrides it (docker-compose.yml pulls the same one). */
export const DEFAULT_LOCAL_MODEL = 'qwen3:4b-instruct'
export const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1'
const TIMEOUT_MS = 2500
const CACHE_MS = 30_000

export const defaultLocalModel = () => env('RELIFE_LOCAL_AI_MODEL')?.trim() || DEFAULT_LOCAL_MODEL
export const localUrl = () => (env('LOCAL_LLM_URL')?.trim() || DEFAULT_LOCAL_URL).replace(/\/+$/, '')

export type Probe = { state: 'ok' | 'down'; models: string[]; ms: number }
type Answer = { url: string; model: string; models: string[]; ms: number }
export type LocalAiBad = Answer & { state: 'down' | 'no-model'; message: string }
export type LocalAi = { state: 'not-local' } | (Answer & { state: 'ok'; message?: undefined }) | LocalAiBad

/** `llama3.1` and `llama3.1:latest` are the same model. */
export const hasModel = (models: string[], want: string) => models.some((m) => m === want || m === `${want}:latest` || `${m}:latest` === want)

/** `GET {url}/models`, which Ollama and LM Studio both answer. Never throws. */
async function probeOnce(url: string, fetchImpl: typeof fetch): Promise<Probe> {
  const t0 = Date.now()
  try {
    // A redirect is never followed: a configured URL that answers with one is not the server we were told to ask.
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/models`, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { data?: { id?: string }[]; models?: { name?: string }[] }
    const models = [...(body.data ?? []).map((m) => m.id), ...(body.models ?? []).map((m) => m.name)].filter((m): m is string => !!m)
    return { state: 'ok', models, ms: Date.now() - t0 }
  } catch {
    return { state: 'down', models: [], ms: Date.now() - t0 }
  }
}

const inflight = new Map<string, Promise<Probe>>()

/** One probe at a time per URL: a page that asks twice (or two pages at once) shares the answer already on its way. */
export function probeLocalAi(url: string, fetchImpl?: typeof fetch): Promise<Probe> {
  if (fetchImpl) return probeOnce(url, fetchImpl)
  const key = url.replace(/\/+$/, '')
  let p = inflight.get(key)
  if (!p) { p = probeOnce(key, fetch).finally(() => inflight.delete(key)); inflight.set(key, p) }
  return p
}

/** The fix to show, in words. A server that is not on this machine is a Compose service; otherwise Ollama is installed by hand. */
export function localAiMessage(state: 'down' | 'no-model', url: string, model: string): string {
  const here = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(url)
  if (state === 'no-model') return `Local AI is running but doesn’t have ${model} yet. Run \`ollama pull ${model}\`${here ? '' : ' (or wait for the download started by `docker compose --profile ai up -d`)'}.`
  return here
    ? `Nothing answered at ${url.replace(/^https?:\/\//, '').replace(/\/v1$/, '')}. Install Ollama from ollama.com, then run \`ollama pull ${model}\`.`
    : `Nothing answered at ${url.replace(/^https?:\/\//, '').replace(/\/v1$/, '')}. Start it with \`docker compose --profile ai up -d\`, or pick another provider in You › Connections.`
}

/**
 * What "use free local AI" would use right now: the configured URL, and RELIFE_LOCAL_AI_MODEL if the server has it (else
 * the first model it lists), with the server's answer. Nothing is saved.
 */
export async function planLocalAi(fetchImpl?: typeof fetch) {
  const url = localUrl()
  const probe = await probeLocalAi(url, fetchImpl)
  const want = defaultLocalModel()
  const model = hasModel(probe.models, want) || !probe.models.length ? want : probe.models[0]
  const state: 'ok' | 'down' | 'no-model' = probe.state === 'down' ? 'down' : hasModel(probe.models, model) ? 'ok' : 'no-model'
  return { url, model, ms: probe.ms, state, models: probe.models, ...(state === 'ok' ? {} : { message: localAiMessage(state, url, model) }) }
}

const cache = new Map<string, { at: number; value: LocalAi }>()

/**
 * The local server's state for a task, cached for 30 s (`fresh` skips the cache). `not-local` when the task's model is
 * not a `local:` one. Never throws.
 */
export async function localAiStatus(task: Task = 'chat', o: { fresh?: boolean; fetchImpl?: typeof fetch } = {}): Promise<LocalAi> {
  const id = modelId(task)
  if (!id?.startsWith('local:')) return { state: 'not-local' }
  const url = localUrl()
  const model = id.slice('local:'.length)
  const key = `${url}|${model}`
  const hit = cache.get(key)
  if (!o.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const p = await probeLocalAi(url, o.fetchImpl)
  const state = p.state === 'down' ? 'down' : hasModel(p.models, model) ? 'ok' : 'no-model'
  const value: LocalAi = state === 'ok' ? { state, url, model, models: p.models, ms: p.ms } : { state, url, model, models: p.models, ms: p.ms, message: localAiMessage(state, url, model) }
  cache.set(key, { at: Date.now(), value })
  return value
}

/** True when the task's model is local and the check says it is not usable right now. */
export const localAiDown = (s: LocalAi): s is LocalAiBad => s.state === 'down' || s.state === 'no-model'

/** What `ai/ask.ts` shows when a call to a local model failed the way a missing server does. */
export function localErrorMessage(err: unknown): string | null {
  const text = String(err instanceof Error ? `${err.message} ${(err as { cause?: { code?: string } }).cause?.code ?? ''}` : err)
  if (!/ECONNREFUSED|fetch failed|ENOTFOUND|model .*not found|Cannot connect/i.test(text)) return null
  if (!modelId('chat')?.startsWith('local:')) return null
  return 'Local AI is not running. Start it (Ollama) or pick another provider in You › Connections.'
}
