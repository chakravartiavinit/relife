import { HealthBatch, type HealthIngestResult } from '@relife/contract'
import { parseNow } from '@/jobs'
import { dayEventId } from '@/parsers/util'
import { authenticate, apiError, denied } from '../auth/request'
import { emitRawMany } from '../ingest'
import type { RawEvent } from '../types'

// The Android app posts one summary per day it read from Health Connect, about once an hour. Scope `ingest` (or `full`).
// Each day is one raw event `day:<date>` for the source `health-connect`, like the Oura and Withings connectors: the same
// numbers again change nothing, and a day whose numbers changed replaces the old body and is parsed again, so the entries
// follow the latest read (parsers/daily.ts).

const MAX_BODY = 256 * 1024

export async function postHealth(req: Request) {
  const a = await authenticate(req, 'ingest')
  if (!a.ok) return denied(a)
  const raw = await req.text()
  if (raw.length > MAX_BODY) return apiError(400, 'bad_request', 'That batch is too large. Send fewer days at a time.')
  let json: unknown
  try { json = JSON.parse(raw) } catch { json = null }
  const parsed = HealthBatch.safeParse(json)
  if (!parsed.success) return apiError(400, 'bad_request', 'That health batch was not valid.')

  const at = new Date()
  const events: RawEvent[] = parsed.data.days.map((day) => ({ source: 'health-connect', externalId: dayEventId(day.date), at, body: day }))
  const inserted = await emitRawMany(a.user.id, events)
  // The events are saved; if parsing can't start now, the parse job picks them up.
  if (inserted) await parseNow().catch((e) => console.error('[health] parse failed, the parse job retries:', e instanceof Error ? e.message : e))
  return Response.json({ ok: true, received: events.length, inserted, timezone: a.user.timezone } satisfies HealthIngestResult)
}
