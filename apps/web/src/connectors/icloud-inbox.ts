import { createHash } from 'node:crypto'
import { accessSync, constants, statSync } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
import type { Connector, RawEvent } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'

// iPhone Shortcuts append one line per event to an iCloud Drive file; the Mac syncs it locally.
// We read from a byte offset, so nothing is lost while the laptop is off. See docs/SHORTCUTS.md.

const DEFAULT_PATH = '~/Library/Mobile Documents/com~apple~CloudDocs/relife/inbox.txt'
// Newer iOS saves "Append to Text File" into the Shortcuts folder of iCloud Drive (iCloud Drive/Shortcuts/inbox.txt).
const SHORTCUTS_PATH = '~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/inbox.txt'

const expand = (p: string) => (p.startsWith('~') ? homedir() + p.slice(1) : p)

/** Blocked by macOS privacy settings (background processes need permission for iCloud Drive). */
const blocked = (path: string) => new Error(`macOS blocked reading ${path.replace(homedir(), '~')}. Give Node Full Disk Access: System Settings → Privacy & Security → Full Disk Access → + → ${process.execPath}`)

/** A readable file. Permission errors are thrown, not treated as "no file", so they show in You › Connections. */
function isFile(p: string) {
  try { return statSync(p).isFile() } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EACCES') throw blocked(p)
    return false
  }
}

/**
 * The file set in You › Connections (or in .env) when it exists; otherwise iCloud Drive/relife/inbox.txt or the Shortcuts
 * folder's inbox.txt, whichever exists. A setting that points nowhere (a folder name, a typo) falls back too.
 */
export function inboxPath(set = env('ICLOUD_INBOX_PATH')) {
  return [set, DEFAULT_PATH, SHORTCUTS_PATH].filter((p): p is string => !!p).map(expand).find(isFile) ?? expand(set || DEFAULT_PATH)
}

/** `tail`: hash of the bytes just before `offset`, to tell a re-saved copy of the same file from a new one. */
type Cursor = { offset: number; ino: number; tail?: string }
const TAIL = 256
const MAX_READ = 8 * 1024 * 1024

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
 * (plain lines, type 'sms' or 'ocr') are skipped: spending comes from the order apps in You › Connections.
 */
export function lineToRawEvent(raw: string, now: Date, tz = 'UTC'): RawEvent | null {
  const line = raw.trim()
  if (!line) return null
  let j: Record<string, unknown> | null = null
  if (line.startsWith('{')) {
    try { j = JSON.parse(line) } catch { j = null }
  }
  if (!j) return null

  const parsed = new Date(String(j.at ?? ''))
  const at = Number.isNaN(parsed.getTime()) ? now : parsed
  // A line with no date means "today" (your local day): the same line on another day (weight 71.4 again) is new,
  // not a repeat. The file is only read again from the start when its content changed (see `sync`), so old lines
  // aren't moved to today.
  const dated = !Number.isNaN(parsed.getTime()) || (typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j.date))
  const externalId = createHash('sha256').update(dated ? line : `${line}@${localDate(now, tz)}`).digest('hex')
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

/** Folders where iCloud Drive keeps the inbox file; one of them exists once the Shortcut (or you) made it. */
const folders = (set?: string) => [set, DEFAULT_PATH, SHORTCUTS_PATH].filter((p): p is string => !!p).map((p) => dirname(expand(p)))

/** Throws advice when the inbox can't work: nothing in iCloud Drive to read from, or macOS won't let ReLife in. */
export function checkInbox(set?: string) {
  const path = inboxPath(set)
  if (isFile(path)) {
    try { accessSync(path, constants.R_OK) } catch { throw blocked(path) }
    return
  }
  const isDir = (p: string) => { try { return statSync(p).isDirectory() } catch (e) { const c = (e as NodeJS.ErrnoException).code; if (c === 'EPERM' || c === 'EACCES') throw blocked(p); return false } }
  if (set && isDir(expand(set))) throw new Error(`“${set}” is a folder. Point Inbox file at the inbox.txt inside it, or leave it blank.`)
  const found = folders(set).some(isDir)
  if (!found) {
    throw new Error(`Couldn’t find ${set ? set : 'iCloud Drive/relife or iCloud Drive/Shortcuts'}. Turn on iCloud Drive on this Mac and make a folder named relife in it (see docs/SHORTCUTS.md), or type where your inbox file is.`)
  }
  // The folder is there but the file isn't yet: the first Shortcut run creates it.
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
  reach: 'local',
  hostLocal: true,
  check: async (get) => checkInbox(get('ICLOUD_INBOX_PATH')),
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
    const fh = await open(path, 'r')
    try {
      // iCloud often saves a newer copy as a new file (new inode) with the same start. Carry on from the offset
      // while the bytes before it are unchanged; start over only when the file shrank or its content changed
      // (you cleared or edited it). Cursors from before `tail` existed trust the offset.
      const tailAt = async (end: number) => {
        const b = Buffer.alloc(Math.min(TAIL, end))
        await fh.read(b, 0, b.length, end - b.length)
        return createHash('sha256').update(b).digest('hex').slice(0, 16)
      }
      const same = s.size >= prev.offset && (prev.ino === s.ino || !prev.tail || (await tailAt(prev.offset)) === prev.tail)
      let offset = same ? prev.offset : 0
      if (s.size === offset) {
        if (!prev.tail || prev.ino !== s.ino) ctx.setCursor({ offset, ino: s.ino, tail: await tailAt(offset) } satisfies Cursor)
        return
      }

      // At most 8 MB a run, so a big backlog (or a file that grew while the Mac was off) is read in pieces.
      const buf = Buffer.alloc(Math.min(s.size - offset, MAX_READ))
      const { bytesRead } = await fh.read(buf, 0, buf.length, offset)
      const chunk = buf.subarray(0, bytesRead)
      let take = consumable(chunk)
      // No line break in 8 MB is not a line from a Shortcut: skip it instead of stalling on it for good.
      if (!take && chunk.length === MAX_READ) { take = chunk.length; ctx.log('icloud-inbox: skipped 8 MB with no line break') }
      if (!take) return
      const now = new Date()
      for (const line of chunk.subarray(0, take).toString('utf8').split('\n')) {
        const ev = lineToRawEvent(line, now, ctx.user.timezone)
        if (ev) await ctx.emit(ev)
      }
      offset += take
      ctx.setCursor({ offset, ino: s.ino, tail: await tailAt(offset) } satisfies Cursor)
    } finally {
      await fh.close()
    }
  },
}
