import { and, eq } from 'drizzle-orm'
import { schema } from '@/db'
import { localDate } from '@/core/time'
import type { Alert, Rule } from '@/core/types'

/** Pure: the alert for a Duolingo streak that ends tonight, or null. Exported for tests. */
export function streakAlert(streak: number | undefined, practised: boolean | undefined): Alert | null {
  // practised is unknown (undefined) when nothing synced today, so a stopped worker never warns by mistake.
  if (!streak || streak < 3 || practised !== false) return null
  return {
    key: 'streak-at-risk:duolingo',
    title: `${streak}-day Duolingo streak ends tonight`,
    body: `No Duolingo lesson yet today, and your streak is ${streak} days.`,
    category: 'skills',
    emoji: '🔥',
    meta: 'Skills · Today',
    action: 'Do one short lesson before midnight.',
    data: [`Streak: ${streak} days`, 'Lessons today: none yet'],
  }
}

/** At 20:00, warn when a Duolingo streak would end tonight. Only active once Duolingo has synced. */
export const streakAtRisk: Rule = {
  id: 'streak-at-risk',
  every: '0 20 * * *',
  async check({ user, db, now }) {
    const today = localDate(now, user.timezone)
    // Today's streak entry carries Duolingo's own "practised today" flag (src/parsers/daily.ts).
    const [row] = await db.select({ v: schema.entries.value, meta: schema.entries.meta })
      .from(schema.entries).innerJoin(schema.trackers, eq(schema.trackers.id, schema.entries.trackerId))
      .where(and(eq(schema.entries.userId, user.id), eq(schema.trackers.slug, 'duolingo.streak'), eq(schema.entries.localDate, today)))
    const alert = streakAlert(row?.v, (row?.meta as { practised?: boolean } | undefined)?.practised)
    return alert ? [alert] : []
  },
}
