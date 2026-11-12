import type { Metadata } from 'next'
import { connection } from 'next/server'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { eq } from 'drizzle-orm'
import { db, isMock, schema } from '@/db'
import { getUser } from '@/core/user'
import { formatDay, formatTime, localDate } from '@/core/time'
import { connectorStatus, recentSyncRuns } from '@/worker/sync'
import { KEY_ENV, modelId, type Task } from '@/ai/models'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { ConnectorMarket, type ConnectorItem, type FieldView } from '@/ui/components/connector-market'
import { envDefault, savedFields, signedIn } from '@/core/secrets'
import { requestOrigin } from '@/core/auth/trust'
import { callbackPath } from '@/core/oauth'
import { integration } from '@/core/integrations'
import type { SetupField } from '@/core/types'
import { env } from '@/core/env'

export const metadata: Metadata = { title: 'Connectors' }

export default function ConnectorsPage() {
  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Connectors"
        description="Apps and devices that feed ReLife, sorted by what they track, plus Telegram and AI models. You bring the keys: they’re encrypted in your local database, and nothing syncs until you connect it."
      />
      <Suspense fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-72 rounded-full" />
          <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-10">
            <div className="hidden flex-col gap-1 lg:flex">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
            <div className="flex flex-col gap-8">
              <Skeleton className="h-10 w-full max-w-sm" />
              <div className="@container"><div className="grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[150px] rounded-[18px]" />)}</div></div>
            </div>
          </div>
        </div>
      }>
        <Connectors />
      </Suspense>
    </>
  )
}

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

async function Connectors() {
  await connection()
  const user = await getUser() // also applies connected keys to process.env
  const [sources, [heartbeat], runs, saved, rows, jobs] = await Promise.all([
    connectorStatus(),
    db.select().from(schema.heartbeats).where(eq(schema.heartbeats.name, 'worker')),
    recentSyncRuns(),
    savedFields(user.id),
    db.select().from(schema.connections).where(eq(schema.connections.userId, user.id)),
    db.select().from(schema.jobs),
  ])
  // The address the service sends you back to: the one this page was opened on (127.0.0.1:3030 by default).
  const h = await headers()
  const origin = requestOrigin(h)
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
    const job = jobs.find((j) => j.id === `sync:${c.id}`)
    const syncing = !!job?.lockedUntil && job.lockedUntil > new Date()
    // Signed in, or a pasted refresh token (Strava) stands in until you do.
    const authed = !c.oauth || isMock || signedIn(saved, c.id) || !!(c.oauth.refreshTokenEnv && env(c.oauth.refreshTokenEnv))
    const signIn = connected && !c.missingEnv.length && !authed
    return {
      id: c.id, name: c.name, category: c.category, description: c.description, provides: c.provides,
      section: c.login ? 'shopping' : c.env.length ? 'keys' : 'built-in', login: !!c.login, connected, sync: true, fields: view(c.id, c.fields),
      missingEnv: connected ? c.missingEnv : [],
      oauth: c.oauth ? { signedIn: authed, redirectUri: `${origin}${callbackPath(c.id)}`, setupUrl: c.oauth.setupUrl, httpsOnly: c.oauth.httpsOnly } : undefined,
      status: !connected ? 'off' : c.missingEnv.length ? 'setup' : signIn ? 'waiting' : conn?.status === 'error' ? 'error' : conn?.lastSyncAt ? 'ok' : 'waiting',
      statusLabel: signIn ? `Sign in with ${c.name} to finish` : connected && !c.missingEnv.length && !conn?.lastSyncAt && conn?.status !== 'error' ? (syncing ? 'First sync running…' : 'First sync starting…') : undefined,
      detail: syncing ? `${every(c.everyMinutes)} · syncing now…` : `${every(c.everyMinutes)} · synced ${ago(conn?.lastSyncAt)} · next ${inTime(job?.requestedAt ? new Date() : job?.nextRunAt)}`,
      error: conn?.lastError,
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
  for (const p of AI) {
    const spec = integration(p.id)!
    const connected = isConnected(p.id)
    const usedBy = tasks.filter((t) => modelId(t)?.startsWith(`${p.id}:`))
    const miss = connected ? missing(spec.required) : []
    items.push({
      ...p, section: 'ai', connected, fields: view(p.id, spec.fields), missingEnv: miss,
      badge: KEY_ENV[p.id] ? undefined : 'Runs locally',
      status: !connected ? 'off' : miss.length ? 'setup' : usedBy.length ? 'ok' : 'ready',
      detail: usedBy.length ? `Used for ${usedBy.join(', ')}` : 'Set a default model to use it',
    })
  }

  // Each dialog shows its own last few syncs.
  for (const i of items) {
    i.syncs = runs.filter((r) => r.connectorId === i.id).map((r) => ({
      at: `${formatDay(localDate(r.startedAt, user.timezone))}, ${formatTime(r.startedAt, user.timezone)}`, ok: r.ok, events: r.eventsCount,
    }))
  }
  return <ConnectorMarket items={items} worker={{ alive: !!workerAlive, ago: ago(heartbeat?.at) }} />
}

