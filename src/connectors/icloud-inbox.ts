import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import type { Connector, RawEvent } from '@/core/types'
import { env } from '@/core/env'

// iPhone Shortcuts append one line per event to an iCloud Drive file; the Mac syncs it locally.
// We read from a byte offset, so nothing is lost while the laptop is off. See docs/SHORTCUTS.md.

const DEFAULT_PATH = '~/Library/Mobile Documents/com~apple~CloudDocs/relife/inbox.txt'
// Newer iOS saves "Append to Text File" into the Shortcuts folder of iCloud Drive (iCloud Drive/Shortcuts/inbox.txt).
const SHORTCUTS_PATH = '~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/inbox.txt'

const expand = (p: string) => (p.startsWith('~') ? homedir() + p.slice(1) : p)

/** Blocked by macOS privacy settings (background processes need permission for iCloud Drive). */
const blocked = (path: string) => new Error(`macOS blocked reading ${path.replace(homedir(), '~')}. Give Node Full Disk Access: System Settings → Privacy & Security → Full Disk Access → + → ${process.execPath}`)

/** A readable file. Permission errors are thrown, not treated as "no file", so they show on Connectors. */
function isFile(p: string) {
  try { return statSync(p).isFile() } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EACCES') throw blocked(p)
    return false
  }
}

/**
 * The file set on Connectors (or in .env) when it exists; otherwise iCloud Drive/relife/inbox.txt or the Shortcuts
 * folder's inbox.txt, whichever exists. A setting that points nowhere (a folder name, a typo) falls back too.
 */
export function inboxPath() {
  const set = env('ICLOUD_INBOX_PATH')
  return [set, DEFAULT_PATH, SHORTCUTS_PATH].filter((p): p is string => !!p).map(expand).find(isFile) ?? expand(set || DEFAULT_PATH)
}

type Cursor = { offset: number; ino: number }

/**
 * How many bytes of newly appended text are whole entries. Lines ending in a line break are whole. iOS's
 * "Append to Text File" puts its line break before each entry, so the newest one has none after it: a last line
 * that is complete JSON counts as whole too. Anything else may still be syncing from iCloud and waits.
 */
export function consumable(buf: Buffer) {
  const end = buf.lastIndexOf(0x0a)
  const rest = buf.subarray(end + 1).toString('utf8').trim()
  if (rest) {
    try { JSON.parse(rest); return buf.length } catch { /* still arriving */ }
  }
  return end + 1
}

/**
 * One inbox line → raw event. JSON lines: {type:'steps', value, date?} · {type:'health', metric, value, unit?, date?}
 * · {type:'sleep', event:'start'|'end', at?}. Also used by POST /api/ingest. Bank texts and screenshot text
 * (plain lines, type 'sms' or 'ocr') are skipped: spending comes from the order apps on Connectors.
 */
export function lineToRawEvent(raw: string, now: Date): RawEvent | null {
  const line = raw.trim()
  if (!line) return null
  const externalId = createHash('sha256').update(line).digest('hex')
  let j: Record<string, unknown> | null = null
  if (line.startsWith('{')) {
    try { j = JSON.parse(line) } catch { j = null }
  }
  if (!j) return null

  const parsed = new Date(String(j.at ?? ''))
  const at = Number.isNaN(parsed.getTime()) ? now : parsed
  switch (j.type) {
    case 'sleep': {
      if (j.event !== 'start' && j.event !== 'end') return null
      const iso = at.toISOString()
      return { source: 'sleep', externalId: `${j.event}:${iso}`, at, body: { event: j.event, at: iso } }
    }
    case 'steps':
    case 'health':
      return { source: 'shortcuts', externalId, at, body: j }
    default:
      return null
  }
}

export const icloudInbox: Connector = {
  id: 'icloud-inbox',
  name: 'iPhone inbox (iCloud Drive)',
  category: 'health',
  description: 'iPhone Shortcuts append steps, sleep and Health data to a file in iCloud Drive. No app to install.',
  provides: ['Steps', 'Sleep', 'Health'],
  fields: [
    { env: 'ICLOUD_INBOX_PATH', label: 'Inbox file', optional: true, placeholder: DEFAULT_PATH, hint: 'Leave blank: ReLife finds iCloud Drive/relife/inbox.txt or iCloud Drive/Shortcuts/inbox.txt. See docs/SHORTCUTS.md.' },
  ],
  env: [],
  everyMinutes: 1,
  async sync(ctx) {
    const path = inboxPath()
    const s = await stat(path).catch((e: NodeJS.ErrnoException) => {
      // macOS privacy settings block background processes from iCloud Drive until allowed; say so instead of
      // looking like an empty inbox. A missing file just means it isn't set up yet.
      if (e.code === 'EPERM' || e.code === 'EACCES') throw blocked(path)
      return null
    })
    if (!s) return // not set up yet; nothing to do
    const prev = (ctx.cursor as Cursor | null) ?? { offset: 0, ino: s.ino }
    // File replaced or truncated (e.g. you cleared it): start over. Duplicates are ignored by id.
    let offset = prev.ino !== s.ino || s.size < prev.offset ? 0 : prev.offset
    if (s.size === offset) return

    const fh = await open(path, 'r')
    try {
      const buf = Buffer.alloc(s.size - offset)
      await fh.read(buf, 0, buf.length, offset)
      const take = consumable(buf)
      if (!take) return
      const now = new Date()
      for (const line of buf.subarray(0, take).toString('utf8').split('\n')) {
        const ev = lineToRawEvent(line, now)
        if (ev) await ctx.emit(ev)
      }
      offset += take
    } finally {
      await fh.close()
    }
    ctx.setCursor({ offset, ino: s.ino } satisfies Cursor)
  },
}
