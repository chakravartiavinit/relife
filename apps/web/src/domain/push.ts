// Web push, pure: how a Telegram-style message becomes a notification, and which button taps a notification can run.
// No database, no React. src/core/push.ts sends it, src/core/notify-actions.ts runs the actions, public/sw.js shows it.

type Button = { text: string; data: string } | { text: string; url: string }

/** What the service worker needs to show one notification. `id` and `tag` are added by the sender. */
export type PushMessage = {
  title: string
  body: string
  /** Where a tap on the notification opens: relative, so it works on whichever host the phone uses. */
  url: string
  /** At most 2 (Chrome's `maxActions`). `open` is set for a button that opens the app instead of running something. */
  actions: { action: string; title: string; open?: string }[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Telegram HTML to plain text: tags go, entities are decoded, blank runs collapse. */
export function plain(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const BODY_MAX = 240
const TITLE_MAX = 120

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** Where a notification opens. Relative on purpose. */
export function urlFor(ref: string | null | undefined) {
  const [kind, id] = (ref ?? '').split(':')
  if (kind === 'insight' && id) return `/?peek=insight:${id}`
  return '/'
}

const UUID = '[0-9a-f-]{36}'
const id = (s: string) => new RegExp(`^${UUID}$`, 'i').test(s)

/** A button tap a notification can run, by what it does (src/core/notify-actions.ts runs it). */
export type PushOp =
  | { type: 'reminder'; id: string; op: 'd' | 's' | 'p1' | 'p2' }
  | { type: 'snooze'; id: string; minutes: number }
  | { type: 'check'; scheduleId: string; occ: string }
  | { type: 'step'; scheduleId: string }
  | { type: 'insight'; id: string; op: 'a' | 'd' }
  | { type: 'noted'; id: string }
  | { type: 'chest'; id: string }
  | { type: 'mood'; value: number }
  | { type: 'open'; url: string }

/** Snooze choices the Telegram "Later" button opens; a notification has no second row, so it takes an hour. */
export const PUSH_SNOOZE_MIN = 60

/**
 * The Telegram callback string of a button, as a typed action. Anything else is `null` and is not offered on a
 * notification: opening a menu or refreshing a view has no meaning there (`q:o`, `t:o`, `t:r`, `s:o`, `m:o`, `noop`).
 */
export function parseAction(data: string): PushOp | null {
  const p = data.split(':')
  const [a, b, c, d] = p
  if (a === 'r' && p.length === 3 && ['d', 's', 'p1', 'p2'].includes(b) && id(c)) return { type: 'reminder', id: c, op: b as 'd' | 's' | 'p1' | 'p2' }
  if (a === 'r' && p.length === 3 && b === 'z' && id(c)) return { type: 'snooze', id: c, minutes: PUSH_SNOOZE_MIN }
  if (a === 't' && b === 'd' && id(c) && d && /^[0-9a-z]+$/.test(d) && p.length === 4) return { type: 'check', scheduleId: c, occ: d }
  if (a === 't' && b === 'p' && id(c) && p.length === 3) return { type: 'step', scheduleId: c }
  if (a === 'i' && (b === 'a' || b === 'd') && id(c) && p.length === 3) return { type: 'insight', id: c, op: b }
  if (a === 'a' && b === 'k' && id(c) && p.length === 3) return { type: 'noted', id: c }
  if (a === 'a' && b === 'w' && id(c) && p.length === 3) return { type: 'open', url: `/?peek=insight:${c}` }
  if (a === 'c' && b === 'o' && id(c) && p.length === 3) return { type: 'chest', id: c }
  if (a === 'm' && p.length === 2 && /^[1-5]$/.test(b)) return { type: 'mood', value: Number(b) }
  return null
}

/** An absolute link (`openInReLife` builds them from RELIFE_PUBLIC_URL) as a path, so it opens on whichever host the phone uses. */
function relative(url: string) {
  try { const u = new URL(url); return `${u.pathname}${u.search}${u.hash}` } catch { return url.startsWith('/') ? url : null }
}

/** The notification for a message: first line is the title, the rest the body (240 characters), up to 2 runnable buttons. */
export function toPush(row: { text: string; ref?: string | null }, buttons: Button[][] | null | undefined): PushMessage {
  const lines = plain(row.text).split('\n')
  const first = lines.findIndex((l) => l.trim())
  const title = first < 0 ? '' : lines[first].trim()
  const body = lines.slice(first + 1).join('\n').trim()
  const flat = (buttons ?? []).flat()
  const urlButton = flat.find((b): b is { text: string; url: string } => 'url' in b)
  const actions: PushMessage['actions'] = []
  for (const b of flat) {
    if (!('data' in b) || actions.length >= 2) continue
    const op = parseAction(b.data)
    if (!op) continue
    actions.push({ action: b.data, title: clip(plain(b.text), 40), ...(op.type === 'open' ? { open: op.url } : {}) })
  }
  return { title: clip(title, TITLE_MAX), body: clip(body, BODY_MAX), url: (urlButton && relative(urlButton.url)) ?? urlFor(row.ref), actions }
}

/**
 * Whether a tap's `action` may run for this message: one of the message's own button values, or, for a reminder (which is
 * drawn again at every send, so its buttons can differ from the stored ones), an action on that same reminder.
 */
export function actionAllowed(action: string, row: { buttons?: Button[][] | null; ref?: string | null }) {
  if ((row.buttons ?? []).flat().some((b) => 'data' in b && b.data === action)) return true
  const [kind, rid] = (row.ref ?? '').split(':')
  const op = parseAction(action)
  return kind === 'reminder' && !!rid && !!op && (op.type === 'reminder' || op.type === 'snooze') && op.id === rid
}

/** What the "Push on this device" row shows. */
export type PushState = 'unsupported' | 'insecure' | 'ios-install' | 'blocked' | 'off' | 'on'

/**
 * The state of push on this browser, from what it reports. Order matters: a page on plain http has no service worker at all
 * (so it is "insecure", not "unsupported"), and Safari on iPhone only offers push to a Home Screen app (so a tab is "ios-install").
 */
export function pushState(b: {
  secure: boolean; ios: boolean; standalone: boolean; supported: boolean; permission: 'default' | 'granted' | 'denied'; subscribed: boolean
}): PushState {
  if (!b.secure) return 'insecure'
  if (b.ios && !b.standalone) return 'ios-install'
  if (!b.supported) return 'unsupported'
  if (b.permission === 'denied') return 'blocked'
  return b.permission === 'granted' && b.subscribed ? 'on' : 'off'
}
