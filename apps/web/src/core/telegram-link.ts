import { and, eq, gt, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { hashToken, isCode, newCode, normalizeCode } from './auth/tokens'
import { FAILED_REDEEMS_PER_IP, FAILED_REDEEM_WINDOW_MS } from './auth/mode'
import { clearFailures, hit } from './auth/ratelimit'
import { clearUserCache, type User } from './user'
import { chatIdOf } from './notify'
import { env } from './env'

// One Telegram bot per server (the owner's bot token); each person links their own chat to it. You › Notifications shows
// "Link Telegram", which opens https://t.me/<bot>?start=<code>; the bot's `/start <code>` saves the chat on that person.
// The code is a `pairings` row (method `telegram`) that lives 10 minutes and works once.

export const LINK_TTL_MS = 10 * 60_000

const live = (now: Date) => and(eq(schema.pairings.method, 'telegram'), eq(schema.pairings.status, 'pending'), gt(schema.pairings.expiresAt, now))

/** A fresh code for this person; older unused ones are retired so only the newest works. */
export async function createLinkCode(user: Pick<User, 'id'>, now = new Date()) {
  await db.update(schema.pairings).set({ status: 'expired' }).where(and(eq(schema.pairings.userId, user.id), live(now)))
  const code = newCode()
  const [row] = await db.insert(schema.pairings).values({
    userId: user.id, method: 'telegram', secretHash: hashToken(`telegram:${code}`), userCode: code, scopes: ['full'], expiresAt: new Date(now.getTime() + LINK_TTL_MS),
  }).returning()
  return { code, expiresAt: row.expiresAt }
}

export type LinkResult = { ok: true; user: User } | { ok: false; reason: 'bad_code' | 'rate_limited' }

/** The bot got `/start <code>` from `chatId`. One use; wrong tries count against the chat. */
export async function redeemLinkCode(raw: string, chatId: string, now = new Date()): Promise<LinkResult> {
  const key = `telegram-link:${chatId}`
  const { wait } = await hit(key, FAILED_REDEEMS_PER_IP, FAILED_REDEEM_WINDOW_MS)
  if (wait) return { ok: false, reason: 'rate_limited' }
  const code = normalizeCode(raw)
  if (!isCode(code)) return { ok: false, reason: 'bad_code' }
  const claimed = await db.update(schema.pairings).set({ status: 'redeemed' })
    .where(and(eq(schema.pairings.secretHash, hashToken(`telegram:${code}`)), live(now))).returning({ userId: schema.pairings.userId })
  const userId = claimed[0]?.userId
  if (!userId) return { ok: false, reason: 'bad_code' }
  // A chat belongs to one person: linking it to someone else lets go of the old link.
  const rows = await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ profile: sql`${schema.users.profile} - 'telegram'` }).where(sql`${schema.users.profile}->'telegram'->>'chatId' = ${chatId}`)
    return tx.update(schema.users).set({ profile: sql`coalesce(${schema.users.profile}, '{}'::jsonb) || ${JSON.stringify({ telegram: { chatId, linkedAt: now.toISOString() } })}::jsonb` })
      .where(eq(schema.users.id, userId)).returning()
  })
  await clearFailures(key)
  clearUserCache()
  return { ok: true, user: rows[0] }
}

/** Forget this person's chat (and, for the owner, the old typed-in chat id is ignored too: see `unlinked`). */
export async function unlinkTelegram(user: Pick<User, 'id'>) {
  await db.update(schema.users).set({ profile: sql`${schema.users.profile} - 'telegram'` }).where(eq(schema.users.id, user.id))
  clearUserCache()
}

/**
 * Who a Telegram chat belongs to, or null. A linked chat first; then the owner's legacy TELEGRAM_ALLOWED_CHAT_ID. A chat
 * that is no one's gets nothing from the bot.
 */
export async function userForChat(chatId: string): Promise<User | null> {
  const [linked] = await db.select().from(schema.users).where(sql`${schema.users.profile}->'telegram'->>'chatId' = ${chatId}`).limit(1)
  if (linked && !linked.disabledAt) return linked
  const { ownerUser } = await import('./multi-user')
  const owner = await ownerUser()
  return owner && !owner.disabledAt && chatIdOf(owner) === chatId ? owner : null
}

/** Whether anyone has a chat yet (to keep the first-run hint of the bot as it was). */
export async function anyoneLinked(): Promise<boolean> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(sql`${schema.users.profile}->'telegram'->>'chatId' is not null`)
  return (r?.n ?? 0) > 0 || !!env('TELEGRAM_ALLOWED_CHAT_ID')
}

/**
 * Copies the owner's typed-in chat id to their profile once (idempotent), so the chat belongs to a person from then on.
 * Called at worker start.
 */
export async function adoptLegacyChat(owner: User) {
  if (owner.profile.telegram?.chatId) return
  const chat = chatIdOf(owner)
  if (!chat) return
  await db.update(schema.users).set({ profile: sql`coalesce(${schema.users.profile}, '{}'::jsonb) || ${JSON.stringify({ telegram: { chatId: chat, linkedAt: new Date().toISOString() } })}::jsonb` })
    .where(and(eq(schema.users.id, owner.id), sql`${schema.users.profile}->'telegram' is null`))
  clearUserCache()
}
