import { createHash } from 'node:crypto'
import { open, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import type { Connector, RawEvent } from '@/core/types'
import { env } from '@/core/env'

// iPhone Shortcuts append one line per event to an iCloud Drive file; the Mac syncs it locally.
// We read from a byte offset, so nothing is lost while the laptop is off. See docs/SHORTCUTS.md.

const DEFAULT_PATH = '~/Library/Mobile Documents/com~apple~CloudDocs/relife/inbox.txt'

export function inboxPath() {
  const p = env('ICLOUD_INBOX_PATH') || DEFAULT_PATH
  return p.startsWith('~') ? homedir() + p.slice(1) : p
}

type Cursor = { offset: number; ino: number }

/**
 * One inbox line → raw event. Accepts plain text (treated as an SMS) or JSON:
 * {type:'sms'|'ocr', text, at?} · {type:'steps', value, date?} · {type:'health', metric, value, unit?, date?}
 * · {type:'sleep', event:'start'|'end', at?}. Also used by POST /api/ingest.
 */
export function lineToRawEvent(raw: string, now: Date): RawEvent | null {
  const line = raw.trim()
  if (!line) return null
  const externalId = createHash('sha256').update(line).digest('hex')
  let j: Record<string, unknown> | null = null
  if (line.startsWith('{')) {
    try { j = JSON.parse(line) } catch { j = null }
  }
  if (!j) return { source: 'sms', externalId, at: now, body: { text: line } }

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
    case 'ocr':
      return { source: 'ocr', externalId, at, body: { text: String(j.text ?? '') } }
    default:
      return { source: 'sms', externalId, at, body: { text: String(j.text ?? ''), sender: j.sender } }
  }
}

export const icloudInbox: Connector = {
  id: 'icloud-inbox',
  name: 'iPhone inbox (iCloud Drive)',
  category: 'health',
  description: 'iPhone Shortcuts append bank SMS, steps and sleep to a file in iCloud Drive. No app to install.',
  provides: ['Bank SMS', 'Steps', 'Sleep'],
  fields: [
    { env: 'ICLOUD_INBOX_PATH', label: 'Inbox file', optional: true, placeholder: DEFAULT_PATH, hint: 'The file your iPhone Shortcuts append to. See docs/SHORTCUTS.md.' },
  ],
  env: [],
  everyMinutes: 1,
  async sync(ctx) {
    const path = inboxPath()
    const s = await stat(path).catch(() => null)
    if (!s) return // not set up yet; nothing to do
    const prev = (ctx.cursor as Cursor | null) ?? { offset: 0, ino: s.ino }
    // File replaced or truncated (e.g. you cleared it): start over. Duplicates are ignored by id.
    let offset = prev.ino !== s.ino || s.size < prev.offset ? 0 : prev.offset
    if (s.size === offset) return

    const fh = await open(path, 'r')
    try {
      const buf = Buffer.alloc(s.size - offset)
      await fh.read(buf, 0, buf.length, offset)
      // Only consume complete lines; iCloud may still be writing the last one.
      const end = buf.lastIndexOf(0x0a)
      if (end < 0) return
      const now = new Date()
      for (const line of buf.subarray(0, end).toString('utf8').split('\n')) {
        const ev = lineToRawEvent(line, now)
        if (ev) await ctx.emit(ev)
      }
      offset += end + 1
    } finally {
      await fh.close()
    }
    ctx.setCursor({ offset, ino: s.ino } satisfies Cursor)
  },
}
