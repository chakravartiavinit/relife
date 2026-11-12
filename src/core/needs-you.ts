import { and, eq, gt, ne, or, sql } from 'drizzle-orm'
import { schema } from '@/db'
import { NUDGE_TTL_DAYS } from '@/domain/needs-you'

/**
 * Pending insights that still count: everything except nudges older than NUDGE_TTL_DAYS.
 * The Coach list, Today's nudge chip and the shell badge use this, so the three agree.
 */
export function pendingInsight(userId: string) {
  const I = schema.insights
  return and(
    eq(I.userId, userId), eq(I.status, 'pending'),
    or(ne(I.kind, 'nudge'), gt(I.createdAt, sql`now() - make_interval(days => ${NUDGE_TTL_DAYS})`)),
  )
}
