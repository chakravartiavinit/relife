// The quick-log grammar, shared by ⌘K / Capture (client) and Telegram (server). Pure: no DB, no React.
//   "water 250"          → add 250 to tracker "water"
//   "mood 4"             → tracker "mood" (scale trackers keep the last value)
//   "spent 120 chai"     → manual expense of 120 in the default currency (the user's base currency), merchant "chai"
//   "spent 15 usd claude"  → any ISO code (or USDT) after the amount sets the currency
//   "read 30 min"        → tracker "read" value 30 (unit word ignored)

import { isIsoCurrency } from './money'

export type QuickLog =
  | { type: 'entry'; slug: string; value: number }
  | { type: 'spend'; amount: number; currency: string; note: string }

export const UNIT_WORDS = new Set(['ml', 'l', 'min', 'mins', 'minutes', 'h', 'hr', 'hrs', 'hours', 'pages', 'km', 'kg', 'steps', 'cups', 'x'])

/** Trackers where a new value replaces today's value instead of adding to it. */
export const LAST_VALUE = new Set(['mood', 'energy', 'weight', 'sleep', 'sleep.hours', 'screen-time'])

const COMMON_CURRENCIES = new Set(['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'NZD', 'THB', 'SAR', 'QAR'])

/** `defaultCurrency` is what a spend without a code is in: the user's base currency. */
export function parseQuickLog(text: string, defaultCurrency = 'INR'): QuickLog | null {
  const t = text.trim().replace(/\s+/g, ' ')
  const spend = /^(?:spent|spend|paid|₹)\s*₹?\s*(\d+(?:\.\d+)?)\s*(?:([a-z]{3,4})\b)?\s*(.*)$/i.exec(t)
  if (spend) {
    const cur = spend[2]?.toUpperCase()
    // A lower-case word is a code only when it is a common currency (or the user's own): "cup", "all" and "pen" are ISO
    // codes too, and "spent 200 cup coffee" is a note. Typed in capitals, any ISO code counts.
    const isCur = cur && (cur === 'USDT' || cur === defaultCurrency.toUpperCase() || COMMON_CURRENCIES.has(cur) || (spend[2] === cur && cur.length === 3 && isIsoCurrency(cur)))
    const note = (isCur ? spend[3] : [spend[2], spend[3]].filter(Boolean).join(' ')).trim()
    return { type: 'spend', amount: Number(spend[1]), currency: isCur ? cur! : /^(?:[a-z]+\s*)?₹/i.test(t) ? 'INR' : defaultCurrency, note: note || 'Manual' }
  }
  const m = /^([a-z][\w .-]*?)\s+(-?\d+(?:\.\d+)?)\s*([a-z]+)?$/i.exec(t)
  if (m && (!m[3] || UNIT_WORDS.has(m[3].toLowerCase()))) {
    let value = Number(m[2])
    if (m[3]?.toLowerCase() === 'l') value *= 1000 // litres → ml
    return { type: 'entry', slug: slugify(m[1]), value }
  }
  return null
}

export function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * What it takes to take a quick log back (the toast's Undo). Carried to the client and sent back to
 * `undoQuickLog`, which validates it. `date` is the local day the log landed on, so an Undo after midnight
 * still reverses the right day. An add log carries its own `ref` (also kept on the entry), so Undo takes back that
 * one log exactly once, however many times it is sent.
 */
export type QuickLogUndo =
  | { kind: 'entry'; slug: string; date: string; ref: string }
  | { kind: 'set'; slug: string; date: string; prev: number | null }
  | { kind: 'spend'; externalRef: string }

/** The token for a log that has just been applied. `prev` is the manual value the day had before a set-not-add log. */
export function quickLogUndo(q: QuickLog, ctx: { date: string; prev: number | null; externalRef: string }): QuickLogUndo {
  if (q.type === 'spend') return { kind: 'spend', externalRef: ctx.externalRef }
  if (LAST_VALUE.has(q.slug)) return { kind: 'set', slug: q.slug, date: ctx.date, prev: ctx.prev }
  return { kind: 'entry', slug: q.slug, date: ctx.date, ref: ctx.externalRef }
}
