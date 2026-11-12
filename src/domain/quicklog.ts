// The quick-log grammar, shared by ⌘K / Capture (client) and Telegram (server). Pure: no DB, no React.
//   "water 250"          → add 250 to tracker "water"
//   "mood 4"             → tracker "mood" (scale trackers keep the last value)
//   "spent 120 chai"     → manual expense of ₹120, merchant "chai"
//   "spent 15 usd claude"
//   "read 30 min"        → tracker "read" value 30 (unit word ignored)

export type QuickLog =
  | { type: 'entry'; slug: string; value: number }
  | { type: 'spend'; amount: number; currency: string; note: string }

export const UNIT_WORDS = new Set(['ml', 'l', 'min', 'mins', 'minutes', 'h', 'hr', 'hrs', 'hours', 'pages', 'km', 'kg', 'steps', 'cups', 'x'])

/** Trackers where a new value replaces today's value instead of adding to it. */
export const LAST_VALUE = new Set(['mood', 'energy', 'weight', 'sleep', 'sleep.hours', 'screen-time'])

export function parseQuickLog(text: string): QuickLog | null {
  const t = text.trim().replace(/\s+/g, ' ')
  const spend = /^(?:spent|spend|paid|₹)\s*₹?\s*(\d+(?:\.\d+)?)\s*(?:([a-z]{3})\b)?\s*(.*)$/i.exec(t)
  if (spend) {
    const cur = spend[2]?.toUpperCase()
    const isCur = cur && /^(INR|USD|EUR|GBP|AED|SGD|USDT)$/.test(cur)
    const note = (isCur ? spend[3] : [spend[2], spend[3]].filter(Boolean).join(' ')).trim()
    return { type: 'spend', amount: Number(spend[1]), currency: isCur ? cur! : 'INR', note: note || 'Manual' }
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
