import { eq, like, or } from 'drizzle-orm'
import { isDemo } from '@/core/demo'
import { db, isMock, schema } from '@/db'
import type { User } from '@/core/user'
import { runAs } from '@/core/context'
import { formatDay, formatTime, localDate } from '@/core/time'
import { connectorStatus, recentSyncRuns } from '@/worker/sync'
import { KEY_ENV, modelId, type Task } from '@/ai/models'
import type { ConnectorItem, FieldView } from '@/ui/components/connector-market'
import { envDefault, savedFields, signedIn } from '@/core/secrets'
import { requestOrigin } from '@/core/auth/trust'
import { callbackPath } from '@/core/oauth'
import { integration } from '@/core/integrations'
import type { SetupField } from '@/core/types'
import { env } from '@/core/env'
import { connectorUnavailable } from '@/core/platform'
import { localAiDown, localAiStatus } from '@/ai/local'

// Every connector as the Connections page and the connector Peek show it: status, last syncs, the fields the
// connect form needs (secret values are never sent), and how the worker is doing.

function ago(d: Date | null | undefined) {
  if (!d) return 'never'
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 90) return `${s}s ago`
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  if (s < 172_800) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)} days ago`
}

/** "in 42 min", "in 3h", or "soon" once it's due. */
function inTime(d: Date | null | undefined) {
  if (!d) return 'soon'
  const s = Math.round((d.getTime() - Date.now()) / 1000)
  if (s < 60) return 'soon'
  if (s < 5400) return `in ${Math.round(s / 60)} min`
  return `in ${Math.round(s / 3600)}h`
}

const every = (m: number) => (m === 1 ? 'Every minute' : m < 60 ? `Every ${m} min` : m === 60 ? 'Every hour' : `Every ${Math.round(m / 60)}h`)
const missing = (vars: string[]) => (isMock ? [] : vars.filter((v) => !env(v)))

const AI: { id: string; name: string; description: string; provides: string[] }[] = [
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models for plans, weekly reviews, nudges and /ask.', provides: ['Claude', 'Plans', 'Chat'] },
  { id: 'openai', name: 'OpenAI', description: 'GPT models for parsing odd bank messages, plans and chat.', provides: ['GPT', 'Parsing', 'Chat'] },
  { id: 'google', name: 'Google Gemini', description: 'Gemini models, with a free tier that covers parsing.', provides: ['Gemini', 'Parsing', 'Chat'] },
  { id: 'openrouter', name: 'OpenRouter', description: 'One key for hundreds of models from every lab.', provides: ['Any model', 'One bill'] },
  { id: 'local', name: 'Ollama or LM Studio', description: 'Runs on your machine, so nothing leaves your laptop. Any OpenAI-compatible server works.', provides: ['Private', 'Free', 'Offline'] },
]

/** `origin` is the address the page was opened on (OAuth sends you back to it). `getUser()` has already applied connected keys. */
export function loadConnectorItems(user: User, origin: string, o: { probeLocal?: boolean } = {}) {
  // Keys are per person: read them as this person (core/context.ts).
  return runAs(user, () => connectorItems(user, origin, o))
}

async function connectorItems(user: User, origin: string, o: { probeLocal?: boolean } = {}) {
  const [sources, [heartbeat], runs, saved, rows, jobs] = await Promise.all([
    connectorStatus(),
    db.select().from(schema.heartbeats).where(eq(schema.heartbeats.name, 'worker')),
    recentSyncRuns(4, user.id),
    savedFields(user.id),
    db.select().from(schema.connections).where(eq(schema.connections.userId, user.id)),
    db.select().from(schema.jobs).where(or(like(schema.jobs.id, `%@${user.id}`), eq(schema.jobs.id, 'sync:fx'))),
  ])
  const workerAlive = heartbeat && Date.now() - heartbeat.at.getTime() < 3 * 60_000
  const isConnected = (id: string) => !!rows.find((r) => r.connectorId === id)?.enabled
  const view = (id: string, fields: SetupField[]): FieldView[] => fields.map((f) => {
    const v = saved.get(id)?.[f.env]
    return { ...f, saved: !!v, fromEnv: !!envDefault(f.env), envSource: process.env.RELIFE_SECRETS === 'dotsafe' ? 'dotsafe' as const : '.env' as const, value: f.secret ? undefined : v }
  })

  const items: ConnectorItem[] = sources.map((c) => {
    const conn = c.connection
    const connected = isConnected(c.id)
    // The worker's sync job for this connector (src/jobs): running right now, or when it runs next.
    const job = jobs.find((j) => j.id === `sync:${c.id}@${user.id}` || j.id === `sync:${c.id}`)
    const syncing = !!job?.lockedUntil && job.lockedUntil > new Date()
    // Signed in, or a pasted refresh token (Strava) stands in until you do.
    const authed = !c.oauth || isMock || signedIn(saved, c.id) || !!(c.oauth.refreshTokenEnv && env(c.oauth.refreshTokenEnv))
    const signIn = connected && !c.missingEnv.length && !authed
    return {
      id: c.id, name: c.name, category: c.category, description: c.description, provides: c.provides,
      section: c.login ? 'shopping' : c.env.length ? 'keys' : 'built-in', login: !!c.login, unavailable: c.unavailable ?? undefined, connected, sync: true, fields: view(c.id, c.fields),
      missingEnv: connected ? c.missingEnv : [],
      oauth: c.oauth ? { signedIn: authed, redirectUri: `${origin}${callbackPath(c.id)}`, setupUrl: c.oauth.setupUrl, httpsOnly: c.oauth.httpsOnly } : undefined,
      status: !connected ? 'off' : c.missingEnv.length ? 'setup' : signIn ? 'waiting' : conn?.status === 'error' ? 'error' : conn?.lastSyncAt ? 'ok' : 'waiting',
      statusLabel: signIn ? `Sign in with ${c.name} to finish` : connected && !c.missingEnv.length && !conn?.lastSyncAt && conn?.status !== 'error' ? (syncing ? 'First sync running…' : 'First sync starting…') : undefined,
      detail: syncing ? `${every(c.everyMinutes)} · syncing now…` : `${every(c.everyMinutes)} · synced ${ago(conn?.lastSyncAt)} · next ${inTime(job?.requestedAt ? new Date() : job?.nextRunAt)}`,
      error: conn?.lastError,
      lastSync: conn?.lastSyncAt ? ago(conn.lastSyncAt) : null, cadence: every(c.everyMinutes),
    }
  })

  const tg = integration('telegram')!
  const tgConnected = isConnected('telegram')
  const tgMissing = tgConnected ? missing(tg.required) : []
  items.push({
    id: 'telegram', name: 'Telegram', section: 'messaging', connected: tgConnected, fields: view('telegram', tg.fields),
    description: 'Reminders with one-tap Done and Snooze, quick logging like “water 250”, and /ask. Only your chat is answered.',
    provides: ['Reminders', 'Quick log', '/ask'],
    missingEnv: tgMissing,
    status: !tgConnected ? 'off' : tgMissing.length ? 'setup' : env('TELEGRAM_ALLOWED_CHAT_ID') ? 'ok' : 'waiting',
    statusLabel: tgConnected && !tgMissing.length && !env('TELEGRAM_ALLOWED_CHAT_ID') ? 'Add your chat ID' : undefined,
    detail: env('TELEGRAM_ALLOWED_CHAT_ID') ? 'Bot runs with the worker' : 'Send /start to your bot to get your chat ID',
  })

  const tasks: Task[] = ['parse', 'plan', 'chat']
  // The local server is probed only when it is connected and in use (cached 30 s; never throws), and only for pages that
  // show its row: area pages and most peeks pass `probeLocal: false`.
  const local = isConnected('local') && o.probeLocal !== false ? await localAiStatus('chat') : null
  for (const p of AI) {
    const spec = integration(p.id)!
    const connected = isConnected(p.id)
    const usedBy = tasks.filter((t) => modelId(t)?.startsWith(`${p.id}:`))
    const miss = connected ? missing(spec.required) : []
    // A local model that is not answering is an error to fix, with the fix as the detail.
    const down = p.id === 'local' && local && localAiDown(local) ? local : null
    items.push({
      ...p, section: 'ai', connected, fields: view(p.id, spec.fields), missingEnv: miss,
      badge: KEY_ENV[p.id] ? undefined : 'Runs locally',
      status: !connected ? 'off' : miss.length ? 'setup' : down ? 'error' : usedBy.length ? 'ok' : 'ready',
      detail: down?.message ?? (usedBy.length ? `Used for ${usedBy.join(', ')}` : 'Set a default model to use it'),
      ...(down ? { error: 'Local AI not running' } : {}),
    })
  }

  // Each dialog shows its own last few syncs.
  for (const i of items) {
    i.syncs = runs.filter((r) => r.connectorId === i.id).map((r) => ({
      at: `${formatDay(localDate(r.startedAt, user.timezone))}, ${formatTime(r.startedAt, user.timezone)}`, ok: r.ok, events: r.eventsCount,
    }))
  }
  return { items, worker: { alive: !!workerAlive, ago: ago(heartbeat?.at), demo: isDemo() } }
}

