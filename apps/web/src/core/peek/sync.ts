import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { isDemo } from '../demo'
import { agoShort, syncLabel, syncTone, workerAlive } from '@/domain/shell'
import { connectorStatus } from '@/worker/sync'
import type { User } from '../user'
import type { SyncPeek } from './types'

const ago = (ms: number) => { const a = agoShort(ms); return a === 'just now' ? a : `${a} ago` }

/** How data is flowing: the worker's heartbeat and every enabled connection, failing ones first. */
export async function loadSyncPeek(_user: User): Promise<SyncPeek> {
  const now = Date.now()
  const [[beat], sources] = await Promise.all([
    db.select().from(schema.heartbeats).where(eq(schema.heartbeats.name, 'worker')),
    connectorStatus(),
  ])
  const alive = workerAlive(beat?.at, now)
  const on = sources.filter((s) => s.connection?.enabled)
  const connections = on.map((s) => {
    const c = s.connection!
    return {
      id: s.id, name: s.name, category: s.category ?? null,
      status: (c.status === 'error' ? 'error' : c.lastSyncAt ? 'ok' : 'waiting') as 'ok' | 'error' | 'waiting',
      ago: c.lastSyncAt ? ago(now - c.lastSyncAt.getTime()) : 'not yet',
      error: c.status === 'error' ? c.lastError : null, failures: c.failures,
    }
  }).sort((a, b) => Number(b.status === 'error') - Number(a.status === 'error') || a.name.localeCompare(b.name))
  const failing = connections.filter((c) => c.status === 'error').length
  const last = on.flatMap((s) => (s.connection?.lastSyncAt ? [s.connection.lastSyncAt] : [])).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const tone = syncTone(alive, failing)
  return {
    type: 'sync',
    tone,
    label: isDemo() ? 'Demo data' : syncLabel(tone, failing, last, now),
    worker: { alive, heartbeat: beat?.at.toISOString() ?? null, ago: beat ? ago(now - beat.at.getTime()) : 'never', demo: isDemo() },
    connections,
  }
}
