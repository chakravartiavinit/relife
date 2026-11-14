import { and, asc, eq, gte, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { CHANNELS as CHANNEL_ORDER, delivery, minutesLeftInQuiet, quietHours, repeatStep, targets, type Channel, type NotifyCategory } from '@/domain/notify'
import { toPush } from '@/domain/push'
import { chatIdOf, deleteMessage, sendMessage, telegramConfigured, type Button } from './notify'
import { optionsFor, pushDeviceCount, sendPush, type PushPayload } from './push'
import { localDate, localDayRange, utcToWall } from './time'
import type { User } from './user'

// Every message the app sends on its own goes through this outbox. Each category's delivery choice
// (Settings → Notifications) decides whether it's sent, held for quiet hours, capped for the day,
// or sent again until a button is tapped. Direct replies to your own messages skip it. One message is one row, sent to every
// channel the category allows and that is set up (Telegram, web push), so the rules above apply once however many take it.

type Row = typeof schema.notifications.$inferSelect

const MAX_SEND_ATTEMPTS = 5

/** The senders, in one object so a test can swap them. */
export const senders = { sendMessage, deleteMessage, sendPush }

/** The channels that are set up: Telegram connected, and push when at least one device has it on. */
async function availableChannels(user: User): Promise<Channel[]> {
  return [...(telegramConfigured(user) ? ['telegram' as const] : []), ...((await pushDeviceCount(user.id)) > 0 ? ['push' as const] : [])]
}

const pushPayload = (row: Row, text: string, buttons: Button[][] | undefined, renotify: boolean): PushPayload =>
  ({ ...toPush({ text, ref: row.ref }, buttons), id: row.id, tag: row.id, renotify })

/** Queue a message and try to send it right away. `once` turns repeats off for this one (summaries). */
export async function notify(user: User, category: NotifyCategory, msg: { text: string; buttons?: Button[][]; ref?: string; once?: boolean }) {
  // With no channel at all there's nowhere to send it; queuing would only flood the chat once one is connected.
  if (!(await availableChannels(user)).length) return
  await db.insert(schema.notifications).values({
    userId: user.id, category, text: msg.text, buttons: msg.buttons ?? null,
    ref: msg.once ? `once:${msg.ref ?? ''}` : msg.ref ?? null,
  })
  await flushOutbox(user)
}

/** The last 7 days of the outbox for You › Notifications: reached a channel, still waiting (quiet hours, daily cap), dropped (category off or the cap). */
export async function weeklyNotifications(user: User, now = new Date()) {
  const N = schema.notifications
  const since = new Date(now.getTime() - 7 * 86_400_000)
  const rows = await db.select({ status: N.status, sent: sql<boolean>`${N.sends} >= 1`, failed: sql<boolean>`${N.sends} < 0`, n: sql<number>`count(*)::int` }).from(N)
    .where(and(eq(N.userId, user.id), gte(N.createdAt, since))).groupBy(N.status, sql`${N.sends} >= 1`, sql`${N.sends} < 0`)
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((a, r) => a + r.n, 0)
  // A send that failed (sends < 0) is not "held for quiet hours": it counts as dropped.
  return { sent: sum((r) => r.sent), held: sum((r) => !r.sent && !r.failed && r.status === 'queued'), skipped: sum((r) => !r.sent && (r.failed || r.status === 'skipped')) }
}

/** What happened to the message about `ref`: reached a channel, still waiting (quiet hours), or dropped (category off or the cap). */
export async function outcome(userId: string, ref: string): Promise<'sent' | 'held' | 'dropped' | 'failed'> {
  const N = schema.notifications
  const [row] = await db.select({ status: N.status, messageId: N.messageId, channels: N.channels, sends: N.sends }).from(N).where(and(eq(N.userId, userId), eq(N.ref, ref))).limit(1)
  if (row?.messageId || row?.channels.length) return 'sent'
  if (row && row.sends < 0) return 'failed' // every channel refused or was unreachable
  return row?.status === 'queued' ? 'held' : 'dropped'
}

/** The channels that took the message about `ref`. */
export async function channelsFor(userId: string, ref: string): Promise<Channel[]> {
  const N = schema.notifications
  const [row] = await db.select({ messageId: N.messageId, channels: N.channels }).from(N).where(and(eq(N.userId, userId), eq(N.ref, ref))).limit(1)
  return row ? CHANNEL_ORDER.filter((c) => row.channels.includes(c) || (c === 'telegram' && row.messageId != null)) : []
}

/** Did a message about `ref` reach a channel? Only a successful send stores a message id or a channel; dropped rows have neither. */
export async function delivered(userId: string, ref: string) {
  const N = schema.notifications
  const [row] = await db.select({ id: N.id }).from(N).where(and(eq(N.userId, userId), eq(N.ref, ref), or(isNotNull(N.messageId), sql`cardinality(${N.channels}) > 0`))).limit(1)
  return !!row
}

/** A button on this message was tapped: stop repeating it. */
export async function markAnswered(userId: string, messageId: number) {
  // Telegram numbers messages per chat, so two people's messages can share an id: only this person's row is theirs.
  await db.update(schema.notifications).set({ status: 'answered' })
    .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.messageId, messageId), eq(schema.notifications.status, 'sent')))
}

/** A button on this message was tapped on another channel (a push action): stop repeating it, on every channel. */
export async function markAnsweredById(userId: string, id: string) {
  await db.update(schema.notifications).set({ status: 'answered' })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId), eq(schema.notifications.status, 'sent')))
}

/** Still worth sending? A reminder already checked off or snoozed, or an insight already handled, is not. */
async function stillOpen(ref: string | null) {
  if (!ref) return true
  const [kind, id] = ref.split(':')
  if (kind === 'reminder') {
    const [r] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, id))
    if (!r || r.snoozedUntil) return false
    const [c] = await db.select({ id: schema.checks.id }).from(schema.checks)
      .where(and(eq(schema.checks.scheduleId, r.scheduleId), eq(schema.checks.occurrence, r.occurrence)))
    return !c
  }
  if (kind === 'insight') {
    const [i] = await db.select({ status: schema.insights.status }).from(schema.insights).where(eq(schema.insights.id, id))
    return i?.status === 'pending'
  }
  return true
}

/** Fresh text for a repeat: reminders re-render so a water goal shows its latest progress. */
async function render(user: User, row: Row): Promise<{ text: string; buttons: Button[][] | undefined }> {
  const [kind, id] = (row.ref ?? '').split(':')
  if (kind === 'reminder') {
    const [r] = await db.select({ r: schema.reminders, s: schema.schedules }).from(schema.reminders)
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.reminders.scheduleId)).where(eq(schema.reminders.id, id))
    if (r) return (await import('@/bot/messages')).reminderMessage(user, r.s, r.r.occurrence, r.r.id)
  }
  return { text: row.text, buttons: row.buttons ?? undefined }
}

/** Send what's due and repeat what's unanswered. Runs every minute in the worker and after each notify(). */
export async function flushOutbox(user: User, now = new Date()) {
  const [u] = await db.select({ profile: schema.users.profile }).from(schema.users).where(eq(schema.users.id, user.id))
  const prefs = u?.profile.notifications
  const wall = utcToWall(now, user.timezone)
  const quietLeft = minutesLeftInQuiet(wall.getUTCHours() * 60 + wall.getUTCMinutes(), quietHours(prefs))
  const [dayStart] = localDayRange(localDate(now, user.timezone), user.timezone)
  const N = schema.notifications
  const available = await availableChannels(user)

  // Messages sent today per category. Repeats don't count, so a repeating reminder doesn't use up the allowance,
  // and neither do test messages from You › Notifications.
  const sentToday = new Map<NotifyCategory, number>()
  for (const r of await db.select({ c: N.category, n: sql<number>`count(*)::int` }).from(N)
    .where(and(eq(N.userId, user.id), gte(N.createdAt, dayStart), gte(N.sends, 1), sql`coalesce(${N.ref}, '') not like 'test:%'`)).groupBy(N.category)) sentToday.set(r.c, r.n)
  const setStatus = (id: string, status: Row['status'], extra: Partial<Row> = {}) => db.update(N).set({ status, ...extra }).where(eq(N.id, id))

  const queued = await db.select().from(N)
    .where(and(eq(N.userId, user.id), eq(N.status, 'queued'), lte(N.sendAfter, now))).orderBy(asc(N.createdAt))
  for (const row of queued) {
    const d = delivery(prefs, row.category)
    if (d.mode === 'off') { await setStatus(row.id, 'skipped'); continue }
    const t = targets(d, available)
    if (!t.length) { await setStatus(row.id, 'skipped'); continue } // nowhere to send
    if (d.quiet && quietLeft) { await db.update(N).set({ sendAfter: new Date(now.getTime() + quietLeft * 60_000) }).where(eq(N.id, row.id)); continue }
    if (d.maxPerDay != null && (sentToday.get(row.category) ?? 0) >= d.maxPerDay) { await setStatus(row.id, 'skipped'); continue }
    if (!(await stillOpen(row.ref))) { await setStatus(row.id, 'done'); continue }
    // Claim it first, so the minute tick and an immediate flush never both send it. `sends` is 0 for a fresh row
    // and -n after n failed attempts (it only counts as sent at 1 or more).
    const [claimed] = await db.update(N).set({ sends: 1, lastSentAt: now }).where(and(eq(N.id, row.id), eq(N.sends, row.sends), lte(N.sends, 0))).returning()
    if (!claimed) continue
    const { text, buttons } = await render(user, row)
    const mid = t.includes('telegram') ? await senders.sendMessage(text, { buttons, chatId: chatIdOf(user) }) : null
    const pushed = t.includes('push') ? await senders.sendPush(user.id, pushPayload(row, text, buttons, false), optionsFor(row.category)) : false
    const took: Channel[] = [...(mid != null ? ['telegram' as const] : []), ...(pushed ? ['push' as const] : [])]
    if (!took.length) {
      // Not sent anywhere (Telegram down, bad token, offline, push service refused): try again in a minute, a few times, then give up.
      const attempts = 1 - row.sends
      // A test message says so at once instead of arriving minutes later; others give up after a few tries.
      if (attempts >= MAX_SEND_ATTEMPTS || row.ref?.startsWith('test:')) await setStatus(row.id, 'skipped', { sends: -attempts })
      else await setStatus(row.id, 'queued', { sends: -attempts, sendAfter: new Date(now.getTime() + 60_000) })
      continue
    }
    sentToday.set(row.category, (sentToday.get(row.category) ?? 0) + 1)
    const repeats = d.mode === 'repeat' && !!buttons?.length && !row.ref?.startsWith('once:')
    await setStatus(row.id, repeats ? 'sent' : 'done', { messageId: mid, channels: took })
  }

  const waiting = await db.select().from(N).where(and(eq(N.userId, user.id), eq(N.status, 'sent'), inArray(N.category, ['reminders', 'alerts', 'analysis'])))
  for (const row of waiting) {
    const d = delivery(prefs, row.category)
    const step = repeatStep(d, row.sends, (now.getTime() - (row.lastSentAt?.getTime() ?? 0)) / 60_000)
    if (step === 'expire') { await setStatus(row.id, 'done'); continue }
    if (step === 'wait' || (d.quiet && quietLeft)) continue
    const t = targets(d, available)
    if (!t.length) { await setStatus(row.id, 'done'); continue }
    if (!(await stillOpen(row.ref))) { await setStatus(row.id, 'done'); continue }
    const [claimed] = await db.update(N).set({ sends: row.sends + 1, lastSentAt: now }).where(and(eq(N.id, row.id), eq(N.sends, row.sends))).returning()
    if (!claimed) continue
    // Send a fresh copy so the phone buzzes, and remove the old one so the chat stays tidy. Push sends again with the same
    // tag and `renotify`, so the notification is replaced and buzzes again instead of piling up.
    const { text, buttons } = await render(user, row)
    if (t.includes('telegram')) {
      if (row.messageId) await senders.deleteMessage(row.messageId, chatIdOf(user))
      const mid = await senders.sendMessage(`${text}\n\n<i>🔁 Still waiting · nudge ${row.sends + 1} of ${d.times + 1}</i>`, { buttons, chatId: chatIdOf(user) })
      await db.update(N).set({ messageId: mid, ...(mid != null && !row.channels.includes('telegram') ? { channels: [...row.channels, 'telegram' as const] } : {}) }).where(eq(N.id, row.id))
    }
    if (t.includes('push') && await senders.sendPush(user.id, pushPayload(row, text, buttons, true), optionsFor(row.category)) && !row.channels.includes('push')) {
      await db.update(N).set({ channels: sql`array_append(${N.channels}, 'push')` }).where(and(eq(N.id, row.id), sql`not ('push' = any(${N.channels}))`))
    }
  }
}
