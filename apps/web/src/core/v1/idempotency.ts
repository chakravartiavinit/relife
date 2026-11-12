import { and, eq, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { apiError } from '../auth/request'

/** A first try that has been `pending` this long died with its server; its key is free again. */
export const STALE_PENDING_MS = 2 * 60_000

const claim = (deviceId: string, key: string) =>
  db.insert(schema.idempotency).values({ deviceId, key, response: { pending: true } }).onConflictDoNothing().returning({ key: schema.idempotency.key })

/**
 * A client-made `Idempotency-Key` makes a write safe to retry: the first success is stored and replayed, so a quick
 * log retried after a timeout is not counted twice. Failures are not stored (the retry runs again). A retry that arrives
 * while the first try is still running gets 503 with Retry-After.
 */
export async function withIdempotency(deviceId: string, key: string | null, run: () => Promise<Response>): Promise<Response> {
  if (!key || key.length > 120) return run()
  let claimed = await claim(deviceId, key)
  if (!claimed.length) {
    // A server that restarted mid-write left `pending` behind for good; without this the key would answer 503 for ever.
    const stale = await db.delete(schema.idempotency).where(and(
      eq(schema.idempotency.deviceId, deviceId), eq(schema.idempotency.key, key), sql`${schema.idempotency.response} ? 'pending'`,
      lt(schema.idempotency.createdAt, new Date(Date.now() - STALE_PENDING_MS)),
    )).returning({ key: schema.idempotency.key })
    if (stale.length) claimed = await claim(deviceId, key)
  }
  if (!claimed.length) {
    const [row] = await db.select().from(schema.idempotency).where(and(eq(schema.idempotency.deviceId, deviceId), eq(schema.idempotency.key, key))).limit(1)
    const r = row?.response as { status?: number; body?: unknown; pending?: boolean } | undefined
    if (r?.status) return Response.json(r.body, { status: r.status, headers: { 'Idempotent-Replayed': 'true' } })
    return apiError(503, 'unavailable', 'The first try is still running. Try again in a moment.', { retryAfter: 1 })
  }
  let res: Response
  try { res = await run() } catch (e) { await release(deviceId, key); throw e }
  if (res.status >= 200 && res.status < 300) {
    const body = await res.clone().json().catch(() => null)
    await db.update(schema.idempotency).set({ response: { status: res.status, body } }).where(and(eq(schema.idempotency.deviceId, deviceId), eq(schema.idempotency.key, key)))
  } else await release(deviceId, key)
  return res
}

const release = (deviceId: string, key: string) =>
  db.delete(schema.idempotency).where(and(eq(schema.idempotency.deviceId, deviceId), eq(schema.idempotency.key, key), sql`${schema.idempotency.response} ? 'pending'`))
