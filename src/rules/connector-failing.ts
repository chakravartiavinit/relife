import { and, eq, gte } from 'drizzle-orm'
import { schema } from '@/db'
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
      title: `${c.connectorId} sync is failing`,
      body: `${c.failures} failed syncs in a row. Last error: ${(c.lastError ?? 'unknown').slice(0, 200)}`,
    }))
  },
}
