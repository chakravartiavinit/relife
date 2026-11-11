import { timingSafeEqual } from 'node:crypto'
import { emitRaw } from '@/core/ingest'
import { parseNow } from '@/jobs'
import { getUser } from '@/core/user'
import { lineToRawEvent } from '@/connectors/icloud-inbox'

// Direct push from iPhone Shortcuts (over Tailscale) or anything else.
// Body: one JSON object, an array of objects/strings, or plain text with one event per line.
// Same line formats as the iCloud inbox file (docs/SHORTCUTS.md).

function authorized(req: Request) {
  const token = process.env.INGEST_TOKEN
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(got)
  const b = Buffer.from(token ?? '')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!process.env.INGEST_TOKEN) return Response.json({ error: 'INGEST_TOKEN is not set on this computer. Add it to .env and restart ReLife.' }, { status: 503 })
  if (!authorized(req)) return Response.json({ error: 'unauthorized: send the header Authorization: Bearer <INGEST_TOKEN>' }, { status: 401 })

  const raw = await req.text()
  if (raw.length > 1_000_000) return Response.json({ error: 'body too large' }, { status: 413 })
  let lines: string[]
  try {
    const j = JSON.parse(raw) as unknown
    lines = (Array.isArray(j) ? j : [j]).map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
  } catch {
    lines = raw.split('\n')
  }

  const user = await getUser()
  const now = new Date()
  let received = 0
  let inserted = 0
  let skipped = 0 // blank, malformed or not a type ReLife reads (steps, health, sleep)
  for (const line of lines) {
    const ev = lineToRawEvent(line, now, user.timezone)
    if (!ev) { if (line.trim()) skipped++; continue }
    received++
    if (await emitRaw(user.id, ev)) inserted++
  }
  // The events are saved; if parsing can't start now, the parse job picks them up.
  const parsed = inserted ? await parseNow().catch((e) => { console.error('[ingest] parse failed, the parse job retries:', e instanceof Error ? e.message : e); return 'queued' }) : 'nothing new'
  return Response.json({ received, inserted, skipped, parsed })
}
