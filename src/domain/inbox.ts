// Inbox items in plain words: which app a raw message came from, what it says, and why it's here.
// Pure, so the page stays layout and this stays tested.

/** Errors that sort themselves out: the daily retry saves these once the other half arrives. */
const WAITING: Record<string, string> = {
  'No matching payment yet': 'Waiting for the matching bank payment. Saved on its own after 2 days if none comes.',
  'Order not saved yet': 'Waiting for its order to be saved first, then the items attach to it.',
}

export const WAITING_ERRORS = Object.keys(WAITING)

export type InboxGroup = 'needs' | 'waiting' | 'skipped'

/** `orphan`: an item list whose order you dismissed, so it can never attach and isn't really waiting. */
export function groupOf(status: string, error: string | null, orphan = false): InboxGroup {
  if (status === 'ignored' || orphan) return 'skipped'
  return error && WAITING[error] ? 'waiting' : 'needs'
}

/** Why it's here, in a sentence. */
export function reasonFor(status: string, error: string | null, orphan = false) {
  if (orphan) return 'Its order was dismissed, so these items have nothing to attach to. Retry the order to bring both back.'
  if (status === 'ignored') return error ? 'You dismissed this.' : 'No reader recognised this message.'
  if (error && WAITING[error]) return WAITING[error]
  return error ? `Couldn’t read it: ${error}` : 'Couldn’t read it.'
}

const SOURCES: Record<string, { app: string; label: string }> = {
  sms: { app: 'sms', label: 'Bank SMS' },
  gmail: { app: 'gmail', label: 'Email' },
  icloud: { app: 'icloud-inbox', label: 'iCloud inbox' },
  inbox: { app: 'icloud-inbox', label: 'iCloud inbox' },
  ocr: { app: 'ocr', label: 'Screenshot' },
  ingest: { app: 'ingest', label: 'Shortcut' },
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export type InboxSummary = { app: string; title: string; text?: string; items?: string[]; more?: number; amount?: { value: number; currency: string } }

/** "Zepto order · 3 items", item names, the amount: whatever the message's shape allows. */
export function summarize(source: string, body: unknown): InboxSummary {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const isItems = source.endsWith('-items')
  const app = isItems ? source.slice(0, -'-items'.length) : (SOURCES[source]?.app ?? source)
  const appName = typeof b.name === 'string' ? b.name : SOURCES[source]?.label ?? cap(app)

  const list = Array.isArray(b.items) ? (b.items as { name?: unknown; qty?: unknown; price?: unknown }[]) : null
  if (list || typeof b.orderId === 'string') {
    const names = (list ?? []).map((i) => (typeof i.name === 'string' ? `${typeof i.qty === 'number' && i.qty > 1 ? `${i.qty} × ` : ''}${i.name}` : null)).filter((x): x is string => !!x)
    const sum = (list ?? []).reduce((s, i) => s + (typeof i.price === 'number' ? i.price : 0), 0)
    const total = typeof b.total === 'number' ? b.total : sum || null
    const n = list?.length ?? 0
    return {
      app,
      title: `${cap(appName)} ${isItems ? 'item list' : 'order'}${n ? ` · ${n} ${n === 1 ? 'item' : 'items'}` : ''}`,
      items: names.slice(0, 3), more: Math.max(0, names.length - 3),
      amount: total ? { value: total, currency: typeof b.currency === 'string' ? b.currency : 'INR' } : undefined,
    }
  }

  const text = typeof body === 'string' ? body
    : [typeof b.subject === 'string' ? b.subject : null, typeof b.text === 'string' ? b.text : typeof b.body === 'string' ? b.body : null]
      .filter((x, i, a) => x && a.indexOf(x) === i).join(' · ')
  return { app, title: appName, text: text || undefined }
}
