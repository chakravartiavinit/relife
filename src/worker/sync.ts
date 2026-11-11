import { and, eq } from 'drizzle-orm'
import { db, isMock, schema } from '@/db'
import { connectors } from '@/connectors'
import { emitRawMany } from '@/core/ingest'
import { getUser } from '@/core/user'
import type { Connector, RawEvent } from '@/core/types'
import { env } from '@/core/env'

// Safe to import from the web app: no timers start here.

export function missingEnv(c: Connector) {
  return c.env.filter((k) => !env(k))
}

/**
 * Run one connected connector now: fetch → raw_events. Never throws. Parsing is the `parse` job's, so an event
 * is never parsed twice at once. Call it through the `sync:<id>` job (src/jobs), which keeps one run at a time.
 */
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
  // Raw events are written in batches of 250 (one statement each) rather than one by one.
  const buffer: RawEvent[] = []
  const flush = async () => { events += await emitRawMany(user.id, buffer.splice(0)) }
  try {
    await c.sync({
      user,
      cursor,
      setCursor: (next) => { cursor = next },
      emit: async (e) => { buffer.push(e); if (buffer.length >= 250) await flush() },
      log: (msg) => console.log(`[${c.id}] ${msg}`),
    })
    await flush()
    await db.update(schema.connections)
      .set({ cursor: cursor ?? null, lastSyncAt: new Date(), status: 'ok', failures: 0, lastError: null })
      .where(eq(schema.connections.id, conn.id))
    await db.update(schema.syncRuns).set({ finishedAt: new Date(), ok: true, eventsCount: events }).where(eq(schema.syncRuns.id, run.id))
    return { ok: true, events }
  } catch (err) {
    await flush().catch(() => {}) // keep what was read before the failure; the next run skips it
    const raw = String(err instanceof Error ? err.message : err)
    // Chrome closing under a browser sync (the app restarting or reloading) is not the app's fault.
    const error = (/Target page, context or browser has been closed/i.test(raw) ? 'The sync was cut short because ReLife restarted or Chrome closed. It runs again on the next sync.' : raw).slice(0, 1000)
    // Keep the cursor from before the failed run so nothing is skipped on retry.
    await db.update(schema.connections)
      .set({ lastSyncAt: new Date(), status: 'error', failures: conn.failures + 1, lastError: error })
      .where(eq(schema.connections.id, conn.id))
    await db.update(schema.syncRuns).set({ finishedAt: new Date(), ok: false, error, eventsCount: events }).where(eq(schema.syncRuns.id, run.id))
    return { ok: false, events, error }
  }
}

/** Status of every connector for the Sources page. */
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
    login: c.login,
    // Mock mode shows seeded connection states (connected, failing) instead of "key missing".
    missingEnv: isMock ? [] : missingEnv(c),
    fields: c.fields,
    connection: rows.find((r) => r.connectorId === c.id) ?? null,
  }))
}
