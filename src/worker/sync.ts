import { and, eq } from 'drizzle-orm'
import { db, isMock, schema } from '@/db'
import { connectors } from '@/connectors'
import { emitRaw, processNew } from '@/core/ingest'
import { getUser } from '@/core/user'
import type { Connector } from '@/core/types'
import { env } from '@/core/env'

// Safe to import from the web app: no timers start here.

export function missingEnv(c: Connector) {
  return c.env.filter((k) => !env(k))
}

/** Run one connected connector now: fetch → raw_events → parsers. Never throws. */
export async function runConnector(connectorId: string): Promise<{ ok: boolean; events: number; error?: string }> {
  const c = connectors.find((x) => x.id === connectorId)
  if (!c) return { ok: false, events: 0, error: `Unknown connector "${connectorId}"` }
  const missing = missingEnv(c)
  if (missing.length) return { ok: false, events: 0, error: `Missing env: ${missing.join(', ')}` }

  const user = await getUser()
  const [conn] = await db.select().from(schema.connections)
    .where(and(eq(schema.connections.userId, user.id), eq(schema.connections.connectorId, c.id)))
  if (!conn?.enabled) return { ok: false, events: 0, error: `${c.name} isn’t connected` }

  const [run] = await db.insert(schema.syncRuns).values({ connectorId: c.id }).returning()
  let cursor = conn.cursor
  let events = 0
  try {
    await c.sync({
      user,
      cursor,
      setCursor: (next) => { cursor = next },
      emit: async (e) => { if (await emitRaw(user.id, e)) events++ },
      log: (msg) => console.log(`[${c.id}] ${msg}`),
    })
    await db.update(schema.connections)
      .set({ cursor: cursor ?? null, lastSyncAt: new Date(), status: 'ok', failures: 0, lastError: null })
      .where(eq(schema.connections.id, conn.id))
    await db.update(schema.syncRuns).set({ finishedAt: new Date(), ok: true, eventsCount: events }).where(eq(schema.syncRuns.id, run.id))
    if (events) await processNew()
    return { ok: true, events }
  } catch (err) {
    const error = String(err instanceof Error ? err.message : err).slice(0, 1000)
    // Keep the cursor from before the failed run so nothing is skipped on retry.
    await db.update(schema.connections)
      .set({ lastSyncAt: new Date(), status: 'error', failures: conn.failures + 1, lastError: error })
      .where(eq(schema.connections.id, conn.id))
    await db.update(schema.syncRuns).set({ finishedAt: new Date(), ok: false, error, eventsCount: events }).where(eq(schema.syncRuns.id, run.id))
    if (events) await processNew()
    return { ok: false, events, error }
  }
}

/** Connectors whose interval has elapsed since their last sync. */
export async function dueConnectors(now = new Date()) {
  const user = await getUser()
  const rows = await db.select().from(schema.connections).where(eq(schema.connections.userId, user.id))
  return connectors.filter((c) => {
    if (missingEnv(c).length) return false
    const row = rows.find((r) => r.connectorId === c.id)
    if (!row?.enabled) return false // only what the user connected
    // Back off after repeated failures: wait failures × interval (max 6h) before retrying.
    const wait = c.everyMinutes * Math.min(Math.max(1, row?.failures ?? 0), 6) * 60_000
    return !row?.lastSyncAt || now.getTime() - row.lastSyncAt.getTime() >= Math.min(wait, 6 * 3_600_000)
  })
}

/** Status of every connector for the Connectors page. */
export async function connectorStatus() {
  const user = await getUser()
  const rows = await db.select().from(schema.connections).where(eq(schema.connections.userId, user.id))
  return connectors.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    description: c.description,
    provides: c.provides,
    env: c.env,
    everyMinutes: c.everyMinutes,
    // Mock mode shows seeded connection states (connected, failing) instead of "key missing".
    missingEnv: isMock ? [] : missingEnv(c),
    fields: c.fields,
    connection: rows.find((r) => r.connectorId === c.id) ?? null,
  }))
}
