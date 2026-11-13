import { sql } from '@/db'
import { clearUserCache, getUser } from '@/core/user'
import { telegramConfigured } from '@/core/notify'
import { connectors } from '@/connectors'
import { startMacActivity } from './mac-activity'
import { aiEnabled } from '@/ai/models'
import { startBot } from '@/bot/telegram'
import { backfillXp } from '@/core/xp'
import { missingEnv } from './sync'
import { startScheduler } from '@/core/jobs'
import { JOBS } from '@/jobs'
import { env } from '@/core/env'
import { isDemo } from '@/core/demo'
import { localAiStatus } from '@/ai/local'
import { modelId } from '@/ai/models'

// The worker runs the bot, laptop activity and the job scheduler (src/jobs): syncs, parsing, reminders, rules, AI.

// A stray rejected promise must not take the worker (and the web app, which runs beside it) down.
process.on('unhandledRejection', (reason) => console.error('[worker] unhandled rejection:', reason))

async function main() {
  // The read-only demo has no worker: nothing syncs, nothing is sent.
  if (isDemo()) { console.log('[worker] demo mode: not starting'); process.exit(0) }
  // Re-read every minute: Settings saves (time zone, notifications, the System's focus) happen in the web app,
  // whose cache clear never reaches this process.
  let user = await getUser()
  console.log(`[worker] starting for ${user.name} (${user.timezone})`)

  // Say once what is off, so a missing connection never looks like a bug. Connect things on /connectors.
  if (!env('TELEGRAM_BOT_TOKEN')) console.log('[worker] Telegram not connected')
  else if (!telegramConfigured()) console.log('[worker] Telegram reminders off until your chat ID is added (send /start to the bot)')
  for (const c of connectors) {
    const m = missingEnv(c)
    if (m.length) console.log(`[worker] ${c.id} not connected`)
  }
  if (!aiEnabled('plan')) console.log('[worker] AI jobs off: connect an AI provider with a default model')
  else if (modelId('plan')?.startsWith('local:')) { const s = await localAiStatus(); if (!s.ok) console.log(`[worker] ${s.message}`) }

  // ponytail: the bot starts once a token is connected; changing or removing the token needs a worker restart.
  let bot = startBot()
  // Keys typed on /connectors since the last minute; start the bot once its token arrives.
  const secrets = setInterval(() => {
    clearUserCache() // getUser() reloads the user and the saved keys
    void getUser().then((u) => { user = u; if (!bot && env('TELEGRAM_BOT_TOKEN')) bot = startBot() }).catch((e) => console.error('[secrets]', e))
  }, 60_000)

  // XP: back-fill history once; the xp job keeps today and yesterday current.
  if (await backfillXp(user)) console.log('[xp] scored the last 90 days')

  // Everything time-based or event-driven is a job (src/jobs): syncs, parsing, rules, XP, AI.
  const scheduler = startScheduler(JOBS, () => user.timezone)
  // Laptop activity: the app in front, every 15s (macOS only, when connected).
  const stopMac = startMacActivity(user)
  console.log(`[worker] ready: ${JOBS.length} jobs`)

  const stop = async (signal: string) => {
    console.log(`[worker] ${signal}, stopping`)
    clearInterval(secrets)
    await scheduler.stop()
    stopMac?.()
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
