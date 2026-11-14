import { connectors } from '@/connectors'
import { setManagedNames } from './env'
import type { Connector, OAuthSpec, SetupField } from './types'

// Everything the Connections page can connect: data sources (src/connectors), Telegram and AI providers.
// Only the `fields` listed here can be saved from the Connect dialog, so it can never set other env vars.

export type Integration = { id: string; fields: SetupField[]; required: string[]; oauth?: OAuthSpec; hostLocal?: boolean; check?: Connector['check'] }

const model = (id: string, example: string): SetupField => ({
  env: 'LLM_DEFAULT', label: 'Default model', optional: true, placeholder: `${id}:${example}`,
  hint: 'Used for every AI task unless LLM_PARSE, LLM_PLAN or LLM_CHAT says otherwise.',
})

export const EXTRA: Integration[] = [
  {
    id: 'telegram', required: ['TELEGRAM_BOT_TOKEN'],
    fields: [
      { env: 'TELEGRAM_BOT_TOKEN', label: 'Bot token', secret: true, placeholder: '123456:ABC…', hint: 'Message @BotFather, send /newbot and paste the token it gives you.' },
      { env: 'TELEGRAM_ALLOWED_CHAT_ID', label: 'Your chat ID', optional: true, placeholder: '123456789', hint: 'Send /start to your bot and it replies with this number. Only this chat is answered.' },
    ],
  },
  { id: 'anthropic', required: ['ANTHROPIC_API_KEY'], fields: [{ env: 'ANTHROPIC_API_KEY', label: 'API key', secret: true, placeholder: 'sk-ant-…' }, model('anthropic', 'claude-sonnet-5-5')] },
  { id: 'openai', required: ['OPENAI_API_KEY'], fields: [{ env: 'OPENAI_API_KEY', label: 'API key', secret: true, placeholder: 'sk-…' }, model('openai', '<model>')] },
  { id: 'google', required: ['GOOGLE_GENERATIVE_AI_API_KEY'], fields: [{ env: 'GOOGLE_GENERATIVE_AI_API_KEY', label: 'API key', secret: true, hint: 'From Google AI Studio.' }, model('google', '<model>')] },
  { id: 'openrouter', required: ['OPENROUTER_API_KEY'], fields: [{ env: 'OPENROUTER_API_KEY', label: 'API key', secret: true, placeholder: 'sk-or-…' }, model('openrouter', '<lab>/<model>')] },
  {
    id: 'local', required: [],
    fields: [
      { env: 'LOCAL_LLM_URL', label: 'Server URL', optional: true, placeholder: 'http://localhost:11434/v1', hint: 'Any OpenAI-compatible server. Leave blank for Ollama on this machine.' },
      model('local', 'llama3.1'),
    ],
  },
]

export function integration(id: string): Integration | undefined {
  const c = connectors.find((x) => x.id === id)
  return c ? { id: c.id, fields: c.fields, required: c.env, oauth: c.oauth, hostLocal: c.hostLocal, check: c.check?.bind(c) } : EXTRA.find((x) => x.id === id)
}

/** Every env var any integration owns. Only these are switched on and off by connect/disconnect. */
export const MANAGED_ENV = [...new Set([...connectors.flatMap((c) => [...c.env, ...c.fields.map((f) => f.env)]), ...EXTRA.flatMap((x) => x.fields.map((f) => f.env))])]

// ── Scope: who a key belongs to ─────────────────────────────────────────────────────────────────
// An instance key is the server's (the owner sets it, everyone uses it): AI provider keys, LLM_*, LOCAL_LLM_URL, the
// Telegram bot token and OAuth app credentials. Every other key is a person's own (a connector key or token) and is
// read only while code runs as that person (core/env.ts, core/context.ts).

const AI_KEYS = new Set(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENROUTER_API_KEY', 'LOCAL_LLM_URL', 'TELEGRAM_BOT_TOKEN'])
const OAUTH_APP_KEYS = new Set(connectors.flatMap((c) => (c.oauth ? [c.oauth.clientIdEnv, c.oauth.clientSecretEnv] : [])))

export const isInstanceKey = (key: string) => key.startsWith('LLM_') || AI_KEYS.has(key) || OAUTH_APP_KEYS.has(key) || /_CLIENT_(ID|SECRET)$/.test(key)

/** Every managed key that belongs to the whole server. */
export const INSTANCE_ENV = MANAGED_ENV.filter(isInstanceKey)

// env() reads these as nothing for a member until their own keys are loaded (core/env.ts).
setManagedNames(MANAGED_ENV.filter((k) => !isInstanceKey(k)))

/**
 * `instance` when the owner sets all of an integration up for everyone (an AI provider, the Telegram bot), else `user`: each
 * person connects their own, even when a part of it (an OAuth app's client ID) is the server's.
 */
export function integrationScope(id: string): 'instance' | 'user' {
  const spec = integration(id)
  if (!spec || spec.oauth) return 'user' // each person signs in with their own account
  const keys = [...new Set([...spec.required, ...spec.fields.map((f) => f.env)])].filter((k) => k !== 'TELEGRAM_ALLOWED_CHAT_ID')
  return keys.length && keys.every(isInstanceKey) ? 'instance' : 'user'
}
