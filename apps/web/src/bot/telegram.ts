import { Bot, type Context } from 'grammy'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { emitRaw } from '@/core/ingest'
import { acceptInsight, dismissInsight } from '@/core/insights'
import { esc, keyboard, type Button } from '@/core/notify'
import { markAnswered } from '@/core/outbox'
import { openChest } from '@/core/quests'
import { applyQuickLog, parseQuickLog } from '@/core/quicklog'
import { addGoalProgress, setCheck } from '@/core/schedules'
import { formatTime } from '@/core/time'
import { getUser } from '@/core/user'
import { aiEnabled } from '@/ai/models'
import { askData } from '@/ai/ask'
import { goalStep, helpView, questsView, reminderAnswered, reminderMessage, statusView, todayView, unpackOcc } from './messages'
import { MOOD, chestOpenedText, head, openInReLife, status, withXp } from './ui'
import { env } from '@/core/env'

const SNOOZE = [{ min: 15, label: '15 min' }, { min: 60, label: '1 hour' }, { min: 180, label: '3 hours' }]

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
        `Your chat id is <code>${esc(chat)}</code>.\nPaste it into Telegram → Manage in ReLife, under You › Connections.`,
        { parse_mode: 'HTML' },
      )
    }
  })

  const reply = (ctx: Context, text: string, buttons?: Button[][], replyTo?: number) => ctx.reply(text, {
    parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: keyboard(buttons),
    reply_parameters: replyTo ? { message_id: replyTo, allow_sending_without_reply: true } : undefined,
  })
  // Edits fail harmlessly when nothing changed or the message is too old.
  const edit = (ctx: Context, text: string, buttons?: Button[][]) =>
    ctx.editMessageText(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: keyboard(buttons) }).catch(() => {})
  const setButtons = (ctx: Context, buttons?: Button[][]) => ctx.editMessageReplyMarkup({ reply_markup: keyboard(buttons) }).catch(() => {})

  const moodPicker = (ctx: Context) => reply(ctx, head('🙂', 'How are you feeling?', 'From 😣 awful to 😄 great. You can change it later today.'),
    [MOOD.map((m) => ({ text: m.face, data: `m:${m.v}` }))])

  bot.command(['start', 'help'], async (ctx) => { const v = await helpView(await getUser()); return reply(ctx, v.text, v.buttons) })
  bot.command('today', async (ctx) => { const v = await todayView(await getUser()); return reply(ctx, v.text, v.buttons) })
  bot.command('quests', async (ctx) => { const v = await questsView(await getUser()); return reply(ctx, v.text, v.buttons) })
  bot.command('status', async (ctx) => { const v = await statusView(await getUser()); return reply(ctx, v.text, v.buttons) })
  bot.command('mood', (ctx) => {
    const n = Number(ctx.match)
    return n >= 1 && n <= 5 ? log(ctx, `mood ${n}`) : moodPicker(ctx)
  })

  const log = async (ctx: Context, text: string) => {
    const q = parseQuickLog(text)
    if (!q) return reply(ctx, 'Try <code>water 250</code>, <code>mood 4</code> or <code>spent 120 chai</code>.')
    const user = await getUser()
    let done = ''
    const xp = await withXp(user, async () => { done = await applyQuickLog(user, q) })
    return reply(ctx, `✅ <b>${esc(done)}</b>${xp.line ? `\n<i>${esc(xp.line)}</i>` : ''}`)
  }
  bot.command('log', (ctx) => log(ctx, ctx.match))
  bot.command('spent', (ctx) => log(ctx, `spent ${ctx.match}`))

  const sleepEvent = async (ctx: Context, event: 'start' | 'end') => {
    const user = await getUser()
    const at = new Date((ctx.message?.date ?? Date.now() / 1000) * 1000)
    await emitRaw(user.id, { source: 'sleep', externalId: `${event}:${at.toISOString()}`, at, body: { event, at: at.toISOString() } })
    await (await import('@/jobs')).parseNow()
    return reply(ctx, event === 'start'
      ? head('🌙', `Bedtime logged at ${formatTime(at, user.timezone)}`, 'Sleep well. Send /wake when you are up.')
      : head('☀️', `Wake-up logged at ${formatTime(at, user.timezone)}`, 'Good morning.'), event === 'end' ? [[{ text: '📋 Today', data: 't:o' }]] : undefined)
  }
  bot.command('sleep', (ctx) => sleepEvent(ctx, 'start'))
  bot.command('wake', (ctx) => sleepEvent(ctx, 'end'))

  const ask = async (ctx: Context, q: string, replyTo?: number) => {
    await ctx.replyWithChatAction('typing')
    // The question and the answer land in the same thread the app's Coach page shows.
    const r = await askData(q, { channel: 'telegram' })
    return reply(ctx, r.error ? `⚠️ ${esc(r.error)}` : `💬 ${esc(r.answer)}`, openInReLife('/coach', 'See the conversation'), replyTo)
  }
  bot.command('ask', (ctx) => ask(ctx, ctx.match, ctx.message?.message_id))

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text
    if (text.startsWith('/')) { const v = await helpView(await getUser()); return reply(ctx, v.text, v.buttons) }
    if (parseQuickLog(text)) return log(ctx, text)
    if (aiEnabled('chat')) return ask(ctx, text, ctx.message.message_id)
    const v = await helpView(await getUser())
    return reply(ctx, v.text, v.buttons)
  })

  // Any tap on a notification counts as a response, so it stops repeating.
  bot.on('callback_query', async (ctx, next) => {
    const mid = ctx.callbackQuery.message?.message_id
    if (mid && ctx.callbackQuery.data !== 'noop') await markAnswered(mid)
    return next()
  })

  // Status-only buttons ("✓ Noted").
  bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery())

  // Reminders: r:<action>:<reminderId>
  //   d done · s skip · u undo · p1/p2 add one or two goal steps · z open snooze choices · z<min> snooze · b back
  bot.callbackQuery(/^r:(d|s|u|p1|p2|\+|z|z\d+|b):(.+)$/, async (ctx) => {
    const [, tapped, rid] = ctx.match
    const action = tapped === '+' ? 'p1' : tapped // '+' is from reminders sent before p1/p2 existed
    const user = await getUser()
    const [row] = await db.select({ r: schema.reminders, s: schema.schedules })
      .from(schema.reminders)
      .innerJoin(schema.schedules, eq(schema.reminders.scheduleId, schema.schedules.id))
      .where(and(eq(schema.reminders.id, rid), eq(schema.schedules.userId, user.id)))
    if (!row) return ctx.answerCallbackQuery({ text: 'This reminder no longer exists.' })
    const { r, s } = row
    const fresh = () => reminderMessage(user, s, r.occurrence, r.id)

    if (action === 'z') {
      await setButtons(ctx, [SNOOZE.map((o) => ({ text: o.label, data: `r:z${o.min}:${rid}` })), [{ text: '‹ Back', data: `r:b:${rid}` }]])
      return ctx.answerCallbackQuery({ text: 'Remind me again in…' })
    }
    if (action.startsWith('z')) {
      const until = new Date(Date.now() + Number(action.slice(1)) * 60_000)
      await db.update(schema.reminders).set({ snoozedUntil: until }).where(eq(schema.reminders.id, r.id))
      const m = await fresh()
      await edit(ctx, `${m.text}\n\n<i>⏰ Snoozed until ${formatTime(until, user.timezone)}</i>`, [[{ text: '↩️ Undo snooze', data: `r:b:${rid}` }]])
      return ctx.answerCallbackQuery({ text: `I'll remind you at ${formatTime(until, user.timezone)}` })
    }
    if (action === 'b') {
      await db.update(schema.reminders).set({ snoozedUntil: null }).where(eq(schema.reminders.id, r.id))
      const m = await fresh()
      await edit(ctx, m.text, m.buttons)
      return ctx.answerCallbackQuery()
    }
    if (action === 'p1' || action === 'p2') {
      const amount = goalStep(s) * (action === 'p2' ? 2 : 1)
      const xp = await withXp(user, () => addGoalProgress(user, s.id, amount))
      const m = await fresh()
      await edit(ctx, xp.line ? `${m.text}\n<i>${esc(xp.line)}</i>` : m.text, m.buttons)
      return ctx.answerCallbackQuery({ text: `+${amount}${s.unit ? ` ${s.unit}` : ''}` })
    }
    if (action === 'u') {
      await withXp(user, () => setCheck(user, s.id, r.occurrence, null))
      const m = await fresh()
      await edit(ctx, m.text, m.buttons)
      return ctx.answerCallbackQuery({ text: 'Undone' })
    }
    const st = action === 'd' ? 'done' : 'skipped'
    const xp = await withXp(user, () => setCheck(user, s.id, r.occurrence, st))
    await edit(ctx, reminderAnswered(user, s, st, xp.line), [[{ text: '↩️ Undo', data: `r:u:${rid}` }]])
    return ctx.answerCallbackQuery({ text: st === 'done' ? (xp.gained > 0 ? `Nice! +${xp.gained} XP` : 'Done') : 'Skipped' })
  })

  // Today checklist: t:o open · t:r refresh · t:d:<scheduleId>:<occurrence> check off · t:p:<scheduleId> add to a goal
  bot.callbackQuery(/^t:(o|r)$/, async (ctx) => {
    const v = await todayView(await getUser())
    if (ctx.match[1] === 'o') await reply(ctx, v.text, v.buttons)
    else await edit(ctx, v.text, v.buttons)
    return ctx.answerCallbackQuery({ text: ctx.match[1] === 'r' ? 'Up to date' : undefined })
  })
  bot.callbackQuery(/^t:([dp]):([0-9a-f-]{36})(?::([0-9a-z]+))?$/, async (ctx) => {
    const [, action, sid, occ] = ctx.match
    const user = await getUser()
    const [s] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.id, sid), eq(schema.schedules.userId, user.id)))
    if (!s) return ctx.answerCallbackQuery({ text: 'That routine no longer exists.' })
    const xp = await withXp(user, () => action === 'd' && occ ? setCheck(user, sid, unpackOcc(occ), 'done') : addGoalProgress(user, sid, goalStep(s)))
    const v = await todayView(user)
    await edit(ctx, v.text, v.buttons)
    return ctx.answerCallbackQuery({ text: [action === 'd' ? `✅ ${s.name}` : `+${goalStep(s)}${s.unit ? ` ${s.unit}` : ''}`, xp.gained > 0 ? `+${xp.gained} XP` : null].filter(Boolean).join(' · ') })
  })

  // The System: q:o opens the quest log · q:r refreshes it in place · s:o opens the status window
  bot.callbackQuery(/^(q:o|q:r|s:o)$/, async (ctx) => {
    const user = await getUser()
    const v = ctx.match[1] === 's:o' ? await statusView(user) : await questsView(user)
    if (ctx.match[1] === 'q:r') await edit(ctx, v.text, v.buttons)
    else await reply(ctx, v.text, v.buttons)
    return ctx.answerCallbackQuery({ text: ctx.match[1] === 'q:r' ? 'Up to date' : undefined })
  })

  // Mood: m:o opens the picker · m:<1-5> logs it
  bot.callbackQuery(/^m:(o|[1-5])$/, async (ctx) => {
    if (ctx.match[1] === 'o') { await moodPicker(ctx); return ctx.answerCallbackQuery() }
    const m = MOOD[Number(ctx.match[1]) - 1]
    const user = await getUser()
    const xp = await withXp(user, () => applyQuickLog(user, { type: 'entry', slug: 'mood', value: m.v }))
    await edit(ctx, head(m.face, `Mood: ${m.label}`, [`Logged at ${formatTime(new Date(), user.timezone)}`, xp.line].filter(Boolean).join(' · ')),
      [MOOD.map((x) => ({ text: x.v === m.v ? `${x.face} ✓` : x.face, data: `m:${x.v}` }))])
    return ctx.answerCallbackQuery({ text: `${m.face} ${m.label}` })
  })

  // Coach proposals (weekly review): i:<a|d>:<insightId>. The buttons turn into the outcome.
  bot.callbackQuery(/^i:([ad]):(.+)$/, async (ctx) => {
    const [, action, id] = ctx.match
    const user = await getUser()
    if (action === 'a') {
      const row = await acceptInsight(user, id)
      const n = row?.payload.actions?.length ?? 0
      await setButtons(ctx, [[status(`✅ Added ${n} ${n === 1 ? 'item' : 'items'}`)]])
      return ctx.answerCallbackQuery({ text: 'Added. Find them in /today.' })
    }
    await dismissInsight(user, id)
    await setButtons(ctx, [[status('Not now')]])
    return ctx.answerCallbackQuery({ text: 'Okay, skipped' })
  })

  // Alerts: a:w:<insightId> asks the coach why · a:k:<insightId> marks it noted
  bot.callbackQuery(/^a:([wk]):(.+)$/, async (ctx) => {
    const [, action, id] = ctx.match
    const user = await getUser()
    const [ins] = await db.select().from(schema.insights).where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id)))
    if (!ins) return ctx.answerCallbackQuery({ text: 'This alert no longer exists.' })
    if (action === 'k') {
      await dismissInsight(user, id)
      await setButtons(ctx, [[status('✓ Noted')]])
      return ctx.answerCallbackQuery()
    }
    await ctx.answerCallbackQuery({ text: 'Asking your coach…' })
    await setButtons(ctx, [[{ text: '✓ Got it', data: `a:k:${id}` }]])
    return ask(ctx, `Explain this alert using my data in 2–3 sentences, then suggest one small step for today.\nAlert: ${ins.title}\n${ins.body}`, ctx.callbackQuery.message?.message_id)
  })

  // Chests: c:o:<chestId>
  bot.callbackQuery(/^c:o:(.+)$/, async (ctx) => {
    const user = await getUser()
    const r = await openChest(user, ctx.match[1])
    if (!r) { await setButtons(ctx, [[status('Already opened')]]); return ctx.answerCallbackQuery({ text: 'Already opened' }) }
    await edit(ctx, chestOpenedText(r.opened, r.level))
    return ctx.answerCallbackQuery({ text: `+${r.opened.xp} XP` })
  })

  bot.catch((err) => console.error('[bot]', err.error instanceof Error ? err.error.message : err.error))

  void registerProfile(bot)

  // A wrong token (401) or a second poller (409) rejects here. Log it instead of crashing the worker,
  // which would take the scheduler (and, under `npm run dev`, the web app) down with it.
  bot.start({ drop_pending_updates: false, onStart: (me) => console.log(`[bot] @${me.username} polling${env('TELEGRAM_ALLOWED_CHAT_ID') ? '' : ' (no chat ID yet: send /start to get it)'}`) })
    .catch((e) => console.error('[bot] stopped:', e instanceof Error ? e.message : e))
  return bot
}

// What Telegram shows about the bot: the commands menu, the "What can this bot do?" text in an empty
// chat (description, max 512 characters) and the bio on its profile (short description, max 120).
// Set on every start, so editing these lines is enough to update them.
const COMMANDS = [
  { command: 'quests', description: 'The System’s quests and your progress' },
  { command: 'status', description: 'Your level, XP and area stats' },
  { command: 'today', description: 'Your checklist for today' },
  { command: 'mood', description: 'Log how you feel' },
  { command: 'log', description: 'Log a value, e.g. water 250' },
  { command: 'spent', description: 'Log an expense, e.g. 120 chai' },
  { command: 'sleep', description: 'Going to bed' },
  { command: 'wake', description: 'Just woke up' },
  { command: 'ask', description: 'Ask about your data' },
]
const DESCRIPTION = [
  'ReLife turns your real life into a game. The System reads your own data (spending, sleep, steps, commits, mood) and sets daily quests to make you stronger.',
  '',
  'Clear quests for XP, levels and reward boxes. Missed daily quests pause new quests and offer recovery choices, not penalties. Reminders, a /today checklist and nudges arrive here too.',
  '',
  'Start with /quests or /status, or just type: "water 500", "mood 4", "spent 120 chai".',
].join('\n')
const ABOUT = 'Your life as a game. The System sets daily quests from your own data. Clear them, level up.'

async function registerProfile(bot: Bot) {
  const results = await Promise.allSettled([
    bot.api.setMyCommands(COMMANDS),
    bot.api.setMyDescription(DESCRIPTION),
    bot.api.setMyShortDescription(ABOUT),
  ])
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed.length) console.error('[bot] profile update failed:', failed.map((f) => (f.reason instanceof Error ? f.reason.message : f.reason)).join('; '))
}
