import { Api, InlineKeyboard } from 'grammy'
import { env, envFor } from './env'
import type { User } from './user'

// Outbound Telegram messages. Used by the worker, rules, AI jobs and the web app. One bot for the server (the owner's
// TELEGRAM_BOT_TOKEN); each person's own chat is saved on them (`users.profile.telegram`, core/telegram-link.ts).
// Without the bot token and a chat it logs instead of sending.

/** A callback button, or (only when RELIFE_PUBLIC_URL is set, see `openInReLife`) one that opens the app in the browser. */
export type Button = { text: string; data: string } | { text: string; url: string }

let api: { token: string; client: Api } | undefined
function client() {
  const token = env('TELEGRAM_BOT_TOKEN')
  if (!token) return null
  // Cached per token value, so a token changed in Settings is used without a restart.
  if (api?.token !== token) api = { token, client: new Api(token) }
  return api.client
}

/**
 * A person's Telegram chat: the one they linked, else (the owner only) the TELEGRAM_ALLOWED_CHAT_ID typed into the
 * Connections page before people could link their own. The .env value is the server's: a member never inherits it.
 */
export function chatIdOf(user: Pick<User, 'id' | 'role' | 'profile'>): string | undefined {
  const linked = user.profile?.telegram?.chatId
  if (linked) return linked
  return user.role === 'owner' ? envFor(user.id, 'TELEGRAM_ALLOWED_CHAT_ID') || undefined : undefined
}

/** The bot is set up and this person (default: the one in scope, as before several people shared a server) has a chat. */
export function telegramConfigured(user?: Pick<User, 'id' | 'role' | 'profile'>) {
  return !!env('TELEGRAM_BOT_TOKEN') && !!(user ? chatIdOf(user) : env('TELEGRAM_ALLOWED_CHAT_ID'))
}

export function keyboard(rows?: Button[][]) {
  if (!rows?.length) return undefined
  const kb = new InlineKeyboard()
  rows.forEach((row, i) => {
    for (const b of row) { if ('url' in b) kb.url(b.text, b.url); else kb.text(b.text, b.data) }
    if (i < rows.length - 1) kb.row()
  })
  return kb
}

/** Send an HTML message to `opts.chatId` (a person's own chat). Returns the Telegram message id, or null when not sent. */
export async function sendMessage(text: string, opts: { buttons?: Button[][]; chatId?: string } = {}): Promise<number | null> {
  const c = client()
  const chat = opts.chatId ?? env('TELEGRAM_ALLOWED_CHAT_ID')
  if (!c || !chat) {
    console.log(`[notify] (telegram not configured) ${text.replace(/<[^>]+>/g, '')}`)
    return null
  }
  try {
    const m = await c.sendMessage(chat, text, { parse_mode: 'HTML', reply_markup: keyboard(opts.buttons), link_preview_options: { is_disabled: true } })
    return m.message_id
  } catch (err) {
    console.error('[notify] send failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Remove a message (an older copy of a repeated reminder). Fails quietly: Telegram only deletes recent ones. */
export async function deleteMessage(messageId: number, chatId?: string) {
  const c = client()
  const chat = chatId ?? env('TELEGRAM_ALLOWED_CHAT_ID')
  if (!c || !chat) return
  await c.deleteMessage(chat, messageId).catch(() => {})
}

/** Escape text for Telegram HTML parse mode. */
export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
