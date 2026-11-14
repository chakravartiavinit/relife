import type { Connector } from '@/core/types'

// What the "Data & privacy" page shows, as plain JSON, and the small rules that word it. No DB, no React.

export type Reach = 'local' | 'lan' | 'public' | 'service'

export type PrivacySource = {
  id: string
  name: string
  provides: string[]
  /** `service` (a third-party service) when the connector does not say otherwise: the cautious claim. */
  reach: Reach
  how: string
  connected: boolean
  /** ISO time, or null when it never synced. */
  lastSyncAt: string | null
}

export type AiWhere = 'local' | 'cloud' | 'off'
export type AiTaskView = { task: 'chat' | 'plan' | 'parse'; label: string; model: string | null; where: AiWhere }
export type AiUseView = { title: string; task: 'chat' | 'plan' | 'parse'; sends: string; runs30: number }

export type PrivacyView = {
  sources: PrivacySource[]
  ai: { tasks: AiTaskView[]; masking: boolean; uses: AiUseView[]; runs30: number }
  channels: { id: string; name: string; connected: boolean; note: string }[]
  /** Fetched from the internet, sending nothing about you. */
  outbound: { name: string; what: string }[]
  /** What never leaves this machine. */
  never: string[]
}

export const REACH_LABEL: Record<Reach, string> = {
  local: 'This machine',
  lan: 'Your network',
  public: 'Public data',
  service: 'Online service',
}

export const REACH_NOTE: Record<Reach, string> = {
  local: 'Stays on this machine.',
  lan: 'A service on your own network.',
  public: 'Open data. Nothing about you is sent.',
  service: 'Asks the service, with your key or sign-in.',
}

/** How a source connects, from what its Connect dialog asks for. */
export function howItConnects(c: Pick<Connector, 'name' | 'fields' | 'oauth' | 'login' | 'reach'>): string {
  if (c.reach === 'local') return 'Runs on this machine, nothing to sign in to'
  if (c.reach === 'lan') return 'Talks to a service on your network'
  if (c.reach === 'public') return 'No sign-in'
  if (c.oauth) return `Sign-in with ${c.name}`
  if (c.login) return 'Browser sign-in, cookies kept in data/browser'
  if (c.fields.some((f) => f.secret)) return `API key, sent only to ${c.name}`
  if (c.fields.length) return 'Public username'
  return 'Nothing to connect'
}

/** A local model stays on the machine or network; any other provider is a cloud service. */
export function aiWhere(modelId: string | undefined, enabled: boolean): AiWhere {
  if (!modelId || !enabled) return 'off'
  return modelId.startsWith('local:') ? 'local' : 'cloud'
}

export const AI_WHERE_NOTE: Record<AiWhere, string> = {
  local: 'Stays on your machine or network (LOCAL_LLM_URL).',
  cloud: 'Sent to the provider.',
  off: 'Not set: nothing is sent.',
}

/** The masking line, honest about what masking does not cover. */
export function maskingLine(masked: boolean): string {
  return masked
    ? 'Masking is on: long digit runs (account and phone numbers) and UPI handles are hidden before a prompt leaves. Merchant names, amounts and routine names still go to a cloud model.'
    : 'Masking is off: prompts include account numbers and UPI handles, as well as merchant names, amounts and routine names.'
}

export const NEVER_LEAVES = [
  'Your database and everything in it',
  'The key that protects your saved keys (data/secret.key)',
  'Each saved key goes only to its own service, never to an AI model',
  'Browser profiles for shopping apps (data/browser)',
  'Exports and backups, until you move them yourself',
  'Window contents: only the app’s name and time are recorded',
]

export const OUTBOUND_PUBLIC = [
  { name: 'Exchange rates', what: 'open.er-api.com is asked for USD rates. Nothing about you is sent.' },
  { name: 'Coin logos', what: 'CoinGecko is asked for logos by symbol, for the coins you hold.' },
  { name: 'Library covers', what: 'Cover pictures are fetched from the page of a course or show you added, public addresses only.' },
]

/** "just now", "5 min ago", "3 h ago", "12 days ago", or "never". */
export function agoText(iso: string | null, now: number): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86_400)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}
