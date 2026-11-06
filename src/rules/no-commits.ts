import { and, eq, gte } from 'drizzle-orm'
import { schema } from '@/db'
import { addDays, localDate } from '@/core/time'
import type { Rule } from '@/core/types'

/** Only active once the GitHub connector has created the tracker. */
export const noCommits: Rule = {
  id: 'no-commits',
  every: '0 20 * * *',
  async check({ user, db, now }) {
    const [t] = await db.select().from(schema.trackers)
      .where(and(eq(schema.trackers.userId, user.id), eq(schema.trackers.slug, 'github.commits')))
    if (!t) return []
    const today = localDate(now, user.timezone)
    const rows = await db.select().from(schema.entries)
      .where(and(eq(schema.entries.trackerId, t.id), gte(schema.entries.localDate, addDays(today, -2))))
    if (rows.some((r) => r.value > 0)) return []
    return [{
      key: 'no-commits',
      title: 'No commits in 3 days',
      body: 'A small commit keeps the streak alive. Even a README fix counts.',
      category: 'skills' as const,
    }]
  },
}
