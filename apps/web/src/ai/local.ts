import { env } from '@/core/env'
import { modelId } from './models'

// Is the local AI server (Ollama, in the Compose `ai` profile) there, and does it have the model? Phase 2 shows the answer
// in Setup and Coach; /api/health and the worker's boot log use it already.

export const DEFAULT_LOCAL_MODEL = 'qwen3:4b-instruct'
const DEFAULT_URL = 'http://localhost:11434/v1'

export type LocalAiStatus =
  | { ok: true; models: string[] }
  | { ok: false; reason: 'unreachable' | 'no-model'; message: string }

/** The model name the app is set to use locally: `LLM_DEFAULT=local:<model>`, else RELIFE_LOCAL_AI_MODEL, else the default. */
export function localModel(): string {
  const id = modelId('chat')
  if (id?.startsWith('local:')) return id.slice('local:'.length)
  return env('RELIFE_LOCAL_AI_MODEL')?.trim() || DEFAULT_LOCAL_MODEL
}

/** `GET <LOCAL_LLM_URL>/models` with a 2 s timeout. */
export async function localAiStatus(fetchImpl: typeof fetch = fetch, o: { url?: string; model?: string } = {}): Promise<LocalAiStatus> {
  const url = (o.url ?? env('LOCAL_LLM_URL') ?? DEFAULT_URL).replace(/\/+$/, '')
  const want = o.model ?? localModel()
  try {
    const res = await fetchImpl(`${url}/models`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { data?: { id?: string }[]; models?: { name?: string }[] }
    const models = [...(body.data ?? []).map((m) => m.id), ...(body.models ?? []).map((m) => m.name)].filter((m): m is string => !!m)
    // Ollama lists "qwen3:4b-instruct"; a name with no tag means ":latest".
    const has = models.some((m) => m === want || m === `${want}:latest`)
    if (!has) return { ok: false, reason: 'no-model', message: `The local AI server at ${url} is running but doesn't have ${want} yet. Pull it with \`docker compose --profile ai up -d\` (the model downloads once), or pick another provider in You → Connections.` }
    return { ok: true, models }
  } catch {
    return { ok: false, reason: 'unreachable', message: `The local AI server at ${url} isn't answering. Start it with \`docker compose --profile ai up -d\`, or pick another provider in You → Connections.` }
  }
}
