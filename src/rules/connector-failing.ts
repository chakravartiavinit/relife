import { and, eq, gte } from 'drizzle-orm'
import { schema } from '@/db'
import { connectors } from '@/connectors'
import { hideUrlQuery } from '@/domain/text'
import type { Rule } from '@/core/types'

export const connectorFailing: Rule = {
  id: 'connector-failing',
  every: '0 */3 * * *',
  async check({ user, db }) {
    const rows = await db.select().from(schema.connections).where(and(
      eq(schema.connections.userId, user.id), eq(schema.connections.enabled, true), gte(schema.connections.failures, 3),
    ))
    return rows.map((c) => ({
      key: `connector-failing:${c.connectorId}`,
      title: `${connectors.find((x) => x.id === c.connectorId)?.name ?? c.connectorId} sync is failing`,
      body: `${c.failures} failed syncs in a row. Last error: ${hideUrlQuery(c.lastError ?? 'unknown').slice(0, 200)}`,
    }))
  },
}
