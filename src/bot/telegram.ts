import { Bot, type Context } from 'grammy'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { emitRaw, processNew } from '@/core/ingest'
import { acceptInsight, dismissInsight } from '@/core/insights'
import { editMessage, esc } from '@/core/notify'
import { applyQuickLog, parseQuickLog } from '@/core/quicklog'
import { addGoalProgress, setCheck, type ScheduleMeta } from '@/core/schedules'
import { formatTime } from '@/core/time'
import { getUser } from '@/core/user'
import { aiEnabled } from '@/ai/models'
import { askData } from '@/ai/ask'
import { HELP, reminderMessage, todayText } from './messages'
import { env } from '@/core/env'

const SNOOZE_MIN = 30

/** Long-polling bot. Returns null when TELEGRAM_BOT_TOKEN is not set. */
export function startBot(): Bot | null {
  const token = env('TELEGRAM_BOT_TOKEN')
  if (!token) return null
  const bot = new Bot(token)

  // Only the owner's chat gets through. Until it is configured, /start reveals the chat id.
  bot.use(async (ctx, next) => {
    const chat = String(ctx.chat?.id ?? '')
    const allowed = env('TELEGRAM_ALLOWED_CHAT_ID') // read each time: it can be added on /connectors while running
    if (allowed && chat === allowed) return next()
    if (!allowed && ctx.message?.text?.startsWith('/start')) {
      await ctx.reply(
        `Your chat id is <code>${esc(chat)}</code>.\nPaste it into Telegram → Manage on the ReLife Connectors page.`,
        { parse_mode: 'HTML' },
      )
    }
  })

  const reply = (ctx: Context, text: string) => ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } })

  bot.command(['start', 'help'], (ctx) => reply(ctx, HELP))
  bot.command('today', async (ctx) => reply(ctx, await todayText(await getUser())))

  const log = async (ctx: Context, text: string) => {
    const q = parseQuickLog(text)
    if (!q) return reply(ctx, 'Try <code>water 250</code>, <code>mood 4</code> or <code>spent 120 chai</code>.')
    return reply(ctx, `✅ ${esc(await applyQuickLog(await getUser(), q))}`)
  }
  bot.command('log', (ctx) => log(ctx, ctx.match))
  bot.command('spent', (ctx) => log(ctx, `spent ${ctx.match}`))

  const sleepEvent = async (ctx: Context, event: 'start' | 'end') => {
    const user = await getUser()
    const at = new Date((ctx.message?.date ?? Date.now() / 1000) * 1000)
    await emitRaw(user.id, { source: 'sleep', externalId: `${event}:${at.toISOString()}`, at, body: { event, at: at.toISOString() } })
    await processNew()
    return reply(ctx, event === 'start' ? `🌙 Bedtime logged at ${formatTime(at, user.timezone)}. Sleep well.` : `☀️ Wake-up logged at ${formatTime(at, user.timezone)}.`)
  }
  bot.command('sleep', (ctx) => sleepEvent(ctx, 'start'))
  bot.command('wake', (ctx) => sleepEvent(ctx, 'end'))

  const ask = async (ctx: Context, q: string) => {
    await ctx.replyWithChatAction('typing')
    const r = await askData(q)
    return reply(ctx, esc(r.error ?? r.answer))
  }
  bot.command('ask', (ctx) => ask(ctx, ctx.match))

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text
    if (text.startsWith('/')) return reply(ctx, HELP)
    if (parseQuickLog(text)) return log(ctx, text)
    if (aiEnabled('chat')) return ask(ctx, text)
    return reply(ctx, HELP)
  })

  // Reminder buttons: r:<d|s|z|+>:<reminderId>
  bot.callbackQuery(/^r:([dsz+]):(.+)$/, async (ctx) => {
    const [, action, rid] = ctx.match
    const user = await getUser()
    const [row] = await db.select({ r: schema.reminders, s: schema.schedules })
      .from(schema.reminders)
      .innerJoin(schema.schedules, eq(schema.reminders.scheduleId, schema.schedules.id))
      .where(eq(schema.reminders.id, rid))
    if (!row) return ctx.answerCallbackQuery({ text: 'This reminder no longer exists.' })
    const { r, s } = row
    const mid = ctx.callbackQuery.message?.message_id

    if (action === '+') {
      const meta = s.meta as ScheduleMeta
      const step = meta.step ?? Math.max(1, Math.round((s.target ?? 8) / 8))
      await addGoalProgress(user, s.id, step)
      const fresh = await reminderMessage(user, s, r.occurrence, r.id)
      if (mid) await editMessage(mid, fresh.text, fresh.buttons)
      return ctx.answerCallbackQuery({ text: `+${step}${s.unit ? ` ${s.unit}` : ''}` })
    }
    if (action === 'z') {
      const until = new Date(Date.now() + SNOOZE_MIN * 60_000)
      await db.update(schema.reminders).set({ snoozedUntil: until }).where(eq(schema.reminders.id, r.id))
      if (mid) await editMessage(mid, `${ctx.callbackQuery.message?.text ? esc(ctx.callbackQuery.message.text) : esc(s.name)}\n<i>⏰ Snoozed until ${formatTime(until, user.timezone)}</i>`)
      return ctx.answerCallbackQuery({ text: 'Snoozed 30 min' })
    }
    const status = action === 'd' ? 'done' : 'skipped'
    await setCheck(user, s.id, r.occurrence, status)
    if (mid) await editMessage(mid, `${status === 'done' ? '✅' : '⏭'} <s>${esc(s.name)}</s> · ${formatTime(r.occurrence, user.timezone)}`)
    return ctx.answerCallbackQuery({ text: status === 'done' ? 'Done' : 'Skipped' })
  })

  // Insight buttons: i:<a|d>:<insightId>
  bot.callbackQuery(/^i:([ad]):(.+)$/, async (ctx) => {
    const [, action, id] = ctx.match
    const user = await getUser()
    if (action === 'a') await acceptInsight(user, id)
    else await dismissInsight(user, id)
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {})
    return ctx.answerCallbackQuery({ text: action === 'a' ? 'Added. See your routines.' : 'Dismissed' })
  })

  bot.catch((err) => console.error('[bot]', err.error instanceof Error ? err.error.message : err.error))

  void bot.api.setMyCommands([
    { command: 'today', description: 'Your day at a glance' },
    { command: 'log', description: 'Log a value, e.g. water 250' },
    { command: 'spent', description: 'Log an expense, e.g. 120 chai' },
    { command: 'sleep', description: 'Going to bed' },
    { command: 'wake', description: 'Just woke up' },
    { command: 'ask', description: 'Ask about your data' },
  ]).catch(() => {})

  void bot.start({ drop_pending_updates: false, onStart: (me) => console.log(`[bot] @${me.username} polling${env('TELEGRAM_ALLOWED_CHAT_ID') ? '' : ' (no chat ID yet: send /start to get it)'}`) })
  return bot
}
