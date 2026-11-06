import { connectors } from '@/connectors'
import type { SetupField } from './types'

// Everything the Connectors page can connect: data sources (src/connectors), Telegram and AI providers.
// Only the `fields` listed here can be saved from the Connect dialog, so it can never set other env vars.

export type Integration = { id: string; fields: SetupField[]; required: string[] }

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
  return c ? { id: c.id, fields: c.fields, required: c.env } : EXTRA.find((x) => x.id === id)
}

/** Every env var any integration owns. Only these are switched on and off by connect/disconnect. */
export const MANAGED_ENV = [...new Set([...connectors.flatMap((c) => [...c.env, ...c.fields.map((f) => f.env)]), ...EXTRA.flatMap((x) => x.fields.map((f) => f.env))])]
