import { connection } from 'next/server'
import { sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { localAiStatus } from '@/ai/local'
import { modelId } from '@/ai/models'
import { isDemo } from '@/core/demo'

// Local status probe: database, worker heartbeat, connector sync state.
export async function GET() {
  await connection()
  try {
    await db.execute(sql`select 1`)
  } catch (e) {
    return Response.json({ db: false, error: String(e instanceof Error ? e.message : e) }, { status: 503 })
  }
  const beats = await db.select().from(schema.heartbeats)
  const worker = beats.find((b) => b.name === 'worker')
  const conns = await db.select({
    connector: schema.connections.connectorId, status: schema.connections.status,
    lastSyncAt: schema.connections.lastSyncAt, failures: schema.connections.failures, lastError: schema.connections.lastError,
  }).from(schema.connections)
  // Only when the default model is the local one: the answer says whether the Compose `ai` profile is up.
  const localAi = !isDemo() && modelId('chat')?.startsWith('local:') ? await localAiStatus() : undefined
  return Response.json({
    db: true,
    ...(localAi ? { localAi } : {}),
    workerHeartbeatAgeSec: worker ? Math.round((Date.now() - worker.at.getTime()) / 1000) : null,
    connectors: conns,
  })
}
