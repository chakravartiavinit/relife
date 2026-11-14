import { and, eq, lt } from 'drizzle-orm'
import { db, schema } from '@/db'
import { connectors } from '@/connectors'
import { rules } from '@/rules'
import { emitEvent, requestJob, runJob, type Job } from '@/core/jobs'
import { getUser } from '@/core/user'
import { connectorUnavailable } from '@/core/platform'

// Every scheduled or event-driven job, in one list. To add one, append an entry: an id, a schedule
// ({ cron } in the user's time zone, or { everyMinutes }), and run(). Add `on: ['some.event']` to also
// run it the moment that event fires (emit('some.event')). A job tied to a connection (a connector,
// Telegram, an AI model) has `enabled`, so it only runs while that's connected. The engine is src/core/jobs.ts.
//
// Events today:
//   connector.connected:<id>  a connector was just connected → sync it now
//   raw.added                 a sync stored new raw events → parse them
//   data.changed              parsing produced new data → rescore XP and quests

/** Connected on /connectors (and, for keyed connectors, with every key present). Keys saved a moment ago count. */
async function connected(id: string, keys: string[] = []) {
  const user = await getUser()
  const [row] = await db.select({ enabled: schema.connections.enabled }).from(schema.connections)
    .where(and(eq(schema.connections.userId, user.id), eq(schema.connections.connectorId, id))).limit(1)
  if (!row?.enabled) return false
  if (!keys.length) return true
  await loadKeys()
  const { env } = await import('@/core/env')
  return keys.every((k) => !!env(k))
}

/** Keys saved on /connectors a moment ago count right away. */
const loadKeys = async () => (await import('@/core/secrets')).applySecrets((await getUser()).id)

/** Jobs that only talk to Telegram, and jobs that need an AI model, run only while those are connected. */
const telegram = async () => { await loadKeys(); return (await import('@/core/notify')).telegramConfigured() }
const ai = async () => { await loadKeys(); return (await import('@/ai/models')).aiEnabled('plan') }

const connectorJobs: Job[] = connectors.map((c) => ({
  id: `sync:${c.id}`,
  schedule: { everyMinutes: c.everyMinutes },
  backoff: true,
  timeoutMinutes: 60, // a first sync can be long (Binance checks every spot pair once)
  // OAuth connectors also wait until you've signed in.
  enabled: async () => !connectorUnavailable(c) && (await connected(c.id, c.env)) && (!c.oauth || (await import('@/core/oauth')).canAuthorize(await getUser(), c)),
  on: [`connector.connected:${c.id}`],
  run: async () => {
    const { runConnector } = await import('@/worker/sync')
    const r = await runConnector(c.id)
    if (!r.ok) throw new Error(r.error ?? 'sync failed')
    if (r.events) await emit('raw.added')
    return r.events ? `${r.events} new` : undefined
  },
}))

export const JOBS: Job[] = [
  { id: 'heartbeat', schedule: { everyMinutes: 1 }, run: async () => {
    await db.insert(schema.heartbeats).values({ name: 'worker', at: new Date() })
      .onConflictDoUpdate({ target: schema.heartbeats.name, set: { at: new Date() } })
  } },
  { id: 'reminders', schedule: { everyMinutes: 1 }, enabled: telegram, run: async () => {
    const { remindTick } = await import('@/worker/reminders')
    await remindTick(await getUser())
  } },
  { id: 'outbox', schedule: { everyMinutes: 1 }, enabled: telegram, run: async () => {
    const { flushOutbox } = await import('@/core/outbox')
    await flushOutbox(await getUser())
  } },

  ...connectorJobs,

  // Parse new raw events, 500 at a time until none are left. One run at a time, so an event is never parsed twice.
  { id: 'parse', schedule: { everyMinutes: 1 }, on: ['raw.added'], timeoutMinutes: 30, run: async () => {
    const { processNew } = await import('@/core/ingest')
    const total = { parsed: 0, ignored: 0, failed: 0 }
    for (let i = 0; i < 200; i++) {
      const c = await processNew(500)
      total.parsed += c.parsed; total.ignored += c.ignored; total.failed += c.failed
      if (c.parsed + c.ignored + c.failed < 500) break
    }
    if (total.parsed) await emit('data.changed')
    return total.parsed || total.failed ? `parsed ${total.parsed}, ignored ${total.ignored}, failed ${total.failed}` : undefined
  } },
  // Failed parses get one more chance a day (a parser may have improved).
  { id: 'retry-failed', schedule: { cron: '30 3 * * *' }, catchUpMinutes: 12 * 60, run: async () => {
    await db.update(schema.rawEvents).set({ status: 'new' }).where(eq(schema.rawEvents.status, 'failed'))
    await emit('raw.added')
  } },

  // Sync history is only shown as each connector's last few runs; the iCloud inbox alone adds 1,440 rows a day.
  { id: 'prune-sync-runs', schedule: { cron: '45 3 * * *' }, catchUpMinutes: 12 * 60, run: async () => {
    const { count } = await db.delete(schema.syncRuns).where(lt(schema.syncRuns.startedAt, new Date(Date.now() - 30 * 86_400_000)))
    return count ? `removed ${count} sync runs older than 30 days` : undefined
  } },

  // The outbox, reminder history and model logs are kept 90 days, handled raw events a year.
  { id: 'prune-old-data', schedule: { cron: '55 3 * * *' }, catchUpMinutes: 12 * 60, run: async () => {
    const { pruneOldData } = await import('@/core/prune')
    const r = await pruneOldData()
    const total = r.notifications + r.reminders + r.llmRuns + r.rawEvents
    return total ? `removed ${r.notifications} notifications, ${r.reminders} reminders, ${r.llmRuns} model runs, ${r.rawEvents} raw events` : undefined
  } },

  // Devices: ended pairings, old idempotency keys, long-revoked devices and rate-limit windows.
  { id: 'prune-devices', schedule: { cron: '50 3 * * *' }, catchUpMinutes: 12 * 60, run: async () => {
    await (await import('@/core/auth/pairing')).cleanup()
  } },

  // The Ask conversation (app and Telegram share one) is kept 180 days.
  { id: 'coach-messages-prune', schedule: { cron: '50 3 * * *' }, catchUpMinutes: 12 * 60, run: async () => {
    const { pruneCoachMessages } = await import('@/core/coach-messages')
    const n = await pruneCoachMessages(await getUser())
    return n ? `removed ${n} messages older than 180 days` : undefined
  } },

  // XP and quests: from fresh data, at least every 5 minutes.
  { id: 'xp', schedule: { everyMinutes: 5 }, on: ['data.changed'], run: async () => {
    const [{ refreshXp }, { celebrate }] = await Promise.all([import('@/core/xp'), import('@/bot/ui')])
    const user = await getUser()
    const news = await refreshXp(user)
    await celebrate(user, news) // progress from syncs (steps, commits) is celebrated in Telegram too
    return news.levelUp ? `level ${news.levelUp.level}` : undefined
  } },
  { id: 'system', schedule: { everyMinutes: 5 }, on: ['data.changed'], run: async () => {
    const { systemTick } = await import('@/core/system')
    await systemTick(await getUser())
  } },
  { id: 'system:warn', schedule: { cron: '0 21 * * *' }, catchUpMinutes: 30, enabled: telegram, run: async () => {
    const { systemWarning } = await import('@/core/system')
    await systemWarning(await getUser())
  } },

  ...rules.map((rule): Job => ({ id: `rule:${rule.id}`, schedule: { cron: rule.every }, on: rule.on, run: async () => {
    const { runRule } = await import('@/rules/run')
    await runRule(rule, await getUser())
  } })),

  { id: 'net-worth', schedule: { cron: '7 * * * *' }, run: async () => {
    const { snapshotNetWorth } = await import('@/core/net-worth')
    await snapshotNetWorth(await getUser())
  } },
  { id: 'ai:daily-nudge', schedule: { cron: '0 8 * * *' }, catchUpMinutes: 3 * 60, enabled: ai, run: async () => {
    const { dailyNudge } = await import('@/ai/jobs/daily-nudge')
    await dailyNudge(await getUser())
  } },
  // New websites and Mac apps the built-in list doesn't know: the AI sorts each once (learning, deep work, …).
  { id: 'activity:classify', schedule: { everyMinutes: 60 }, catchUpMinutes: 60, enabled: async () => { await loadKeys(); return (await import('@/ai/models')).aiEnabled('parse') }, run: async () => {
    const { classifySites } = await import('@/ai/jobs/classify-sites')
    return (await classifySites(await getUser())) ?? undefined
  } },
  // The one-liner under every area title and Life tile. Rules write it, so it runs without a model; a model (parse) rewords it when set.
  { id: 'ai:area-briefs', schedule: { cron: '30 6 * * *' }, catchUpMinutes: 6 * 60, on: ['data.changed'], run: async () => {
    await loadKeys()
    const { areaBriefs } = await import('@/ai/jobs/area-briefs')
    return await areaBriefs(await getUser())
  } },
  // Runs without a model too: outcome goal reviews use a rule-based template (src/domain/goals.ts).
  { id: 'ai:weekly-review', schedule: { cron: '0 21 * * 0' }, catchUpMinutes: 12 * 60, run: async () => {
    await loadKeys()
    const { weeklyReview } = await import('@/ai/jobs/weekly-review')
    await weeklyReview(await getUser())
  } },
]

/** Something happened: run every job listening for it, as soon as possible. */
export const emit = (event: string) => emitEvent(event, JOBS)

/** Run a job here and now (the web's "Sync now"). Null when it's already running somewhere. */
export async function runNow(id: string) {
  const job = JOBS.find((j) => j.id === id)
  if (!job) throw new Error(`Unknown job ${id}`)
  return runJob(job, (await getUser()).timezone)
}

/** Parse new raw events now (iPhone inbox, Telegram), or leave them to the parse already running. */
export async function parseNow() {
  const r = await runNow('parse')
  if (!r) await requestJob('parse')
  return r?.result ?? 'queued'
}
