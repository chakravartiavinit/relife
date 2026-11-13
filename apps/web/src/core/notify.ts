import { Api, InlineKeyboard } from 'grammy'
import { env } from './env'

// Outbound Telegram messages. Used by the worker, rules, AI jobs and the web app.
// Without TELEGRAM_BOT_TOKEN + TELEGRAM_ALLOWED_CHAT_ID it logs instead of sending.

/** A callback button, or (only when RELIFE_PUBLIC_URL is set, see `openInReLife`) one that opens the app in the browser. */
export type Button = { text: string; data: string } | { text: string; url: string }

let api: Api | undefined
function client() {
  const token = env('TELEGRAM_BOT_TOKEN')
  if (!token) return null
  api ??= new Api(token)
  return api
}

export function telegramConfigured() {
  return !!env('TELEGRAM_BOT_TOKEN') && !!env('TELEGRAM_ALLOWED_CHAT_ID')
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

/** Send an HTML message to the owner's chat. Returns the Telegram message id, or null when not sent. */
export async function sendMessage(text: string, opts: { buttons?: Button[][] } = {}): Promise<number | null> {
  const c = client()
  const chat = env('TELEGRAM_ALLOWED_CHAT_ID')
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
export async function deleteMessage(messageId: number) {
  const c = client()
  const chat = env('TELEGRAM_ALLOWED_CHAT_ID')
  if (!c || !chat) return
  await c.deleteMessage(chat, messageId).catch(() => {})
}

/** Escape text for Telegram HTML parse mode. */
export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
