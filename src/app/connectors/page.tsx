import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { desc, eq } from 'drizzle-orm'
import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react'
import { db, isMock, schema } from '@/db'
import { getUser } from '@/core/user'
import { formatDay, formatTime, localDate } from '@/core/time'
import { connectorStatus } from '@/worker/sync'
import { KEY_ENV, modelId, type Task } from '@/ai/models'
import { Card, CardHeader, PageHeader, Skeleton } from '@/ui/components/card'
import { ConnectorMarket, type ConnectorItem, type FieldView } from '@/ui/components/connector-market'
import { envDefault, savedFields } from '@/core/secrets'
import { integration } from '@/core/integrations'
import type { SetupField } from '@/core/types'
import { env } from '@/core/env'

export const metadata: Metadata = { title: 'Connectors' }

export default function ConnectorsPage() {
  return (
    <>
      <PageHeader eyebrow="System" title="Connectors" description="Everything ReLife reads from or talks to: data sources, Telegram and AI models." />
      <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-[76px] rounded-lg" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[300px] rounded-lg" />)}</div></div>}>
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
  const [sources, [heartbeat], runs, saved, rows] = await Promise.all([
    connectorStatus(),
    db.select().from(schema.heartbeats).where(eq(schema.heartbeats.name, 'worker')),
    db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.startedAt)).limit(8),
    savedFields(user.id),
    db.select().from(schema.connections).where(eq(schema.connections.userId, user.id)),
  ])
  const workerAlive = heartbeat && Date.now() - heartbeat.at.getTime() < 3 * 60_000
  const isConnected = (id: string) => !!rows.find((r) => r.connectorId === id)?.enabled
  const view = (id: string, fields: SetupField[]): FieldView[] => fields.map((f) => {
    const v = saved.get(id)?.[f.env]
    return { ...f, saved: !!v, fromEnv: !!envDefault(f.env), value: f.secret ? undefined : v }
  })

  const items: ConnectorItem[] = sources.map((c) => {
    const conn = c.connection
    const connected = isConnected(c.id)
    return {
      id: c.id, name: c.name, category: c.category, description: c.description, provides: c.provides,
      section: c.env.length ? 'keys' : 'built-in', connected, sync: true, fields: view(c.id, c.fields),
      missingEnv: connected ? c.missingEnv : [],
      status: !connected ? 'off' : c.missingEnv.length ? 'setup' : conn?.status === 'error' ? 'error' : conn?.lastSyncAt ? 'ok' : 'waiting',
      statusLabel: connected && !c.missingEnv.length && !conn?.lastSyncAt && conn?.status !== 'error' ? 'Waiting for first sync' : undefined,
      detail: `${every(c.everyMinutes)} · synced ${ago(conn?.lastSyncAt)}`,
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

  return (
    <div className="flex flex-col gap-8">
      {!workerAlive ? (
        <div role="status" className="flex items-start gap-3 rounded-lg bg-surface p-4 shadow-1">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn" strokeWidth={1.5} />
          <div className="text-sm">
            <div className="font-medium text-ink">The worker isn’t running</div>
            <p className="mt-0.5 text-ink-2">Syncing, reminders and the Telegram bot need it. Start everything with <code className="rounded-xs bg-surface-2 px-1 py-0.5 text-[12px]">npm run dev</code>. Last heartbeat: {ago(heartbeat?.at)}.</p>
          </div>
        </div>
      ) : null}

      <ConnectorMarket items={items} />

      <Card>
        <CardHeader title="Recent syncs" />
        {runs.length ? (
          <ul className="flex flex-col gap-2 text-[13px]">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                {r.ok ? <CircleCheck className="size-4 text-good" strokeWidth={1.5} aria-label="OK" /> : r.ok === false ? <CircleAlert className="size-4 text-bad" strokeWidth={1.5} aria-label="Failed" /> : <CircleDashed className="size-4 text-ink-3" strokeWidth={1.5} aria-label="Running" />}
                <span className="w-28 text-ink">{r.connectorId}</span>
                <span className="text-ink-3 tabular-nums">{formatDay(localDate(r.startedAt, user.timezone))} {formatTime(r.startedAt, user.timezone)}</span>
                <span className="ml-auto text-ink-2 tabular-nums">{r.eventsCount} new</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3">No syncs yet.</p>
        )}
      </Card>
    </div>
  )
}
