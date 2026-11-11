import { and, eq, isNull, notInArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { WAITING_ERRORS } from '@/domain/inbox'
import type { User } from './user'

/**
 * What needs a look: raw messages that failed and won't sort themselves out (not the ones waiting for their order),
 * plus transactions still `Uncategorized`. The count on Sources in the rail and the "Needs a look" tab.
 */
export async function inboxCount(user: User): Promise<number> {
  const R = schema.rawEvents
  const T = schema.transactions
  const [[unread], [uncategorized]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(R)
      .where(and(eq(R.userId, user.id), eq(R.status, 'failed'), or(isNull(R.error), notInArray(R.error, WAITING_ERRORS)))),
    db.select({ n: sql<number>`count(*)::int` }).from(T)
      .where(and(eq(T.userId, user.id), eq(T.category, 'Uncategorized'))),
  ])
  return unread.n + uncategorized.n
}
