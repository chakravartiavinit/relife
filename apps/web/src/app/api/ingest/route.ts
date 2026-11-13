import { authenticate, denied } from '@/core/auth/request'
import { env } from '@/core/env'
import { emitRawMany } from '@/core/ingest'
import type { RawEvent } from '@/core/types'
import { parseNow } from '@/jobs'
import { lineToRawEvent } from '@/connectors/icloud-inbox'

// Direct push from iPhone Shortcuts (over Tailscale) or anything else.
// Body: one JSON object, an array of objects/strings, or plain text with one event per line.
// Same line formats as the iCloud inbox file (docs/SHORTCUTS.md).

export async function POST(req: Request) {
  // The old shared INGEST_TOKEN is a device with scope `ingest` (src/core/auth/devices.ts); a full device works too.
  const a = await authenticate(req, 'ingest')
  if (!a.ok) {
    if (!env('INGEST_TOKEN') && a.reason !== 'scope') return Response.json({ error: 'INGEST_TOKEN is not set on this computer. Add it to .env and restart ReLife.' }, { status: 503 })
    return denied(a, { legacy: true })
  }

  const raw = await req.text()
  if (raw.length > 1_000_000) return Response.json({ error: 'body too large' }, { status: 413 })
  let lines: string[]
  try {
    const j = JSON.parse(raw) as unknown
    lines = (Array.isArray(j) ? j : [j]).map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
  } catch {
    lines = raw.split('\n')
  }

  const user = a.user
  const now = new Date()
  let skipped = 0 // blank, malformed or not a type ReLife reads (steps, health, sleep)
  const events: RawEvent[] = []
  for (const line of lines) {
    const ev = lineToRawEvent(line, now, user.timezone)
    if (ev) events.push(ev)
    else if (line.trim()) skipped++
  }
  const received = events.length
  // A 1 MB body can hold tens of thousands of lines: insert in batches, one statement each (and under
  // Postgres's 65,535-parameter limit), instead of one round trip per line.
  let inserted = 0
  for (let i = 0; i < events.length; i += 1000) inserted += await emitRawMany(user.id, events.slice(i, i + 1000))
  // The events are saved; if parsing can't start now, the parse job picks them up.
  const parsed = inserted ? await parseNow().catch((e) => { console.error('[ingest] parse failed, the parse job retries:', e instanceof Error ? e.message : e); return 'queued' }) : 'nothing new'
  return Response.json({ received, inserted, skipped, parsed })
}
