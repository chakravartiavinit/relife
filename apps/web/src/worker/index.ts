import { sql } from '@/db'
import { clearUserCache, ensureOwner, warmInstance } from '@/core/user'
import { activeUsers, ownerUser } from '@/core/multi-user'
import { runAs } from '@/core/context'
import { adoptLegacyChat } from '@/core/telegram-link'
import { telegramConfigured } from '@/core/notify'
import { connectors } from '@/connectors'
import { startMacActivity } from './mac-activity'
import { aiEnabled } from '@/ai/models'
import { startBot } from '@/bot/telegram'
import { backfillXp } from '@/core/xp'
import { missingEnv } from './sync'
import { adoptJobIds, startScheduler } from '@/core/jobs'
import { JOBS, jobsForUsers } from '@/jobs'
import { env } from '@/core/env'
import { isDemo } from '@/core/demo'
import { localAiStatus } from '@/ai/local'

// The worker runs the bot, laptop activity and the job scheduler (src/jobs): syncs, parsing, reminders, rules, AI.
// Several people can share one server: each person's jobs run as them (`runAs`), the bot answers each linked chat as its
// person, and the server's own jobs (heartbeat, exchange rates, pruning, backup) run once. The laptop's activity is the
// owner's: the Mac the worker runs on is theirs.

// A stray rejected promise must not take the worker (and the web app, which runs beside it) down.
process.on('unhandledRejection', (reason) => console.error('[worker] unhandled rejection:', reason))

async function main() {
  // The read-only demo has no worker: nothing syncs, nothing is sent.
  if (isDemo()) { console.log('[worker] demo mode: not starting'); process.exit(0) }
  // Re-read every minute: Settings saves (time zone, notifications, the System's focus) happen in the web app,
  // whose cache clear never reaches this process.
  let owner = await ensureOwner()
  await warmInstance()
  const people = await activeUsers()
  console.log(`[worker] starting for ${people.length === 1 ? `${owner.name} (${owner.timezone})` : `${people.length} people on this server`}`)
  // Jobs were once one set for the one person: they become the owner's (`<id>@<owner>`), keeping when each last ran.
  await adoptJobIds(owner.id, JOBS.filter((j) => j.scope === 'instance').map((j) => j.id))
  await adoptLegacyChat(owner) // the typed-in Telegram chat id becomes the owner's linked chat, once

  // Say once what is off, so a missing connection never looks like a bug. Connect things on /connectors.
  if (!env('TELEGRAM_BOT_TOKEN')) console.log('[worker] Telegram not connected')
  else if (!telegramConfigured(owner)) console.log('[worker] Telegram reminders off until a chat is linked (You › Notifications › Link Telegram)')
  // Per-person connectors: say it for the owner's keys (a member's are theirs to see in their own Connections page).
  await runAs(owner, async () => {
    for (const c of connectors) {
      const m = missingEnv(c)
      if (m.length) console.log(`[worker] ${c.id} not connected`)
    }
  })
  if (!aiEnabled('plan')) console.log('[worker] AI jobs off: connect an AI provider with a default model')
  else {
    // Said when the probe answers (up to a few seconds); the bot and the jobs don't wait for it.
    void localAiStatus('plan').then((local) => {
      if (local.state === 'ok') console.log(`[worker] local AI ready (${local.model})`)
      else if (local.state !== 'not-local') console.log(`[worker] local AI not running: ${local.message}`)
    })
  }

  // The bot starts once a token is connected and stops when it is removed; changing the token needs a worker restart.
  let bot = startBot()
  // Keys typed on /connectors since the last minute; start the bot once its token arrives.
  const secrets = setInterval(() => {
    clearUserCache() // reloads the people and everyone's saved keys
    void (async () => {
      owner = (await ownerUser()) ?? owner
      await warmInstance()
      for (const u of await activeUsers()) await runAs(u, async () => { await (await import('@/core/secrets')).applySecrets(u.id) })
      if (!bot && env('TELEGRAM_BOT_TOKEN')) bot = startBot()
      // The token was removed (Settings, or a wipe): stop answering on it.
      else if (bot && !env('TELEGRAM_BOT_TOKEN')) { void bot.stop().catch(() => {}); bot = null }
    })().catch((e) => console.error('[secrets]', e))
  }, 60_000)

  // XP: back-fill history once for each person; the xp job keeps today and yesterday current.
  for (const u of people) {
    if (await runAs(u, () => backfillXp(u))) console.log(`[xp] scored the last 90 days for ${u.name}`)
  }

  // Everything time-based or event-driven is a job (src/jobs): syncs, parsing, rules, XP, AI. People are listed on every
  // tick, so someone added in the web app has their jobs within a minute.
  const scheduler = startScheduler(async () => jobsForUsers(await activeUsers()), () => owner.timezone)
  // Laptop activity: the app in front, every 15s (macOS only, when connected).
  const stopMac = runAs(owner, () => startMacActivity(owner)) // its timers keep the owner's keys
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
