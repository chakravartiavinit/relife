import { Cron } from 'croner'
import { eq } from 'drizzle-orm'
import { db, schema, sql } from '@/db'
import { processNew } from '@/core/ingest'
import { getUser } from '@/core/user'
import { telegramConfigured } from '@/core/notify'
import { connectors } from '@/connectors'
import { rules } from '@/rules'
import { runRule } from '@/rules/run'
import { aiEnabled } from '@/ai/models'
import { dailyNudge } from '@/ai/jobs/daily-nudge'
import { weeklyReview } from '@/ai/jobs/weekly-review'
import { startBot } from '@/bot/telegram'
import { applySecrets } from '@/core/secrets'
import { remindTick } from './reminders'
import { dueConnectors, missingEnv, runConnector } from './sync'
import { env } from '@/core/env'

// The worker owns everything time-based: bot, reminders, syncs, parsing, rules, AI jobs.

async function main() {
  const user = await getUser()
  const tz = user.timezone
  console.log(`[worker] starting for ${user.name} (${tz})`)

  // Say once what is off, so a missing connection never looks like a bug. Connect things on /connectors.
  if (!env('TELEGRAM_BOT_TOKEN')) console.log('[worker] Telegram not connected')
  else if (!telegramConfigured()) console.log('[worker] Telegram reminders off until your chat ID is added (send /start to the bot)')
  for (const c of connectors) {
    const m = missingEnv(c)
    if (m.length) console.log(`[worker] ${c.id} not connected`)
  }
  if (!aiEnabled('plan')) console.log('[worker] AI jobs off: connect an AI provider with a default model')

  // ponytail: the bot starts once a token is connected; changing or removing the token needs a worker restart.
  let bot = startBot()
  const jobs: Cron[] = []
  const every = (name: string, pattern: string, fn: () => Promise<unknown>) => {
    jobs.push(new Cron(pattern, { timezone: tz, protect: true, name, catch: (e) => console.error(`[${name}]`, e instanceof Error ? e.message : e) }, async () => { await fn() }))
  }

  every('heartbeat', '* * * * *', () =>
    db.insert(schema.heartbeats).values({ name: 'worker', at: new Date() })
      .onConflictDoUpdate({ target: schema.heartbeats.name, set: { at: new Date() } }))

  every('reminders', '* * * * *', () => remindTick(user))

  every('connectors', '* * * * *', async () => {
    await applySecrets(user.id) // pick up what was connected or disconnected on the web
    if (!bot && env('TELEGRAM_BOT_TOKEN')) bot = startBot()
    for (const c of await dueConnectors()) {
      const r = await runConnector(c.id)
      console.log(`[sync] ${c.id}: ${r.ok ? `${r.events} new` : `failed: ${r.error}`}`)
    }
  })

  every('parse', '* * * * *', async () => {
    const n = await processNew()
    if (n.parsed || n.failed) console.log(`[parse] parsed ${n.parsed}, ignored ${n.ignored}, failed ${n.failed}`)
  })

  // Failed parses get one more chance a day (a parser may have improved, or the matching bank debit arrived).
  every('retry-failed', '30 3 * * *', async () => {
    await db.update(schema.rawEvents).set({ status: 'new' }).where(eq(schema.rawEvents.status, 'failed'))
    await processNew()
  })

  for (const rule of rules) every(`rule:${rule.id}`, rule.every, () => runRule(rule, user))

  every('ai:daily-nudge', '0 8 * * *', () => dailyNudge(user))
  every('ai:weekly-review', '0 21 * * 0', () => weeklyReview(user))

  // Run reminders and parsing once right away instead of waiting for the first minute.
  await remindTick(user).catch((e) => console.error('[reminders]', e))
  await processNew().catch((e) => console.error('[parse]', e))
  console.log(`[worker] ready: ${jobs.length} jobs`)

  const stop = async (signal: string) => {
    console.log(`[worker] ${signal}, stopping`)
    jobs.forEach((j) => j.stop())
    await bot?.stop().catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
    process.exit(0)
  }
  process.once('SIGINT', () => void stop('SIGINT'))
  process.once('SIGTERM', () => void stop('SIGTERM'))
}

main().catch((err) => {
  console.error('[worker] fatal:', err)
  process.exit(1)
})
