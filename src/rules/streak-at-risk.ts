import { and, eq, gte } from 'drizzle-orm'
import { schema } from '@/db'
import { addDays, localDate } from '@/core/time'
import type { Alert, Rule } from '@/core/types'

/** Pure: the alert for a Duolingo streak that ends tonight, or null. Exported for tests. */
export function streakAlert(streak: number | undefined, xpToday: number | undefined): Alert | null {
  // xpToday is undefined until a full day of syncs exists, so a new connection never warns by mistake.
  if (!streak || streak < 3 || xpToday == null || xpToday > 0) return null
  return {
    key: 'streak-at-risk:duolingo',
    title: `${streak}-day Duolingo streak ends tonight`,
    body: `No Duolingo lesson yet today, and your streak is ${streak} days.`,
    category: 'skills',
    emoji: '🔥',
    meta: 'Skills · Today',
    action: 'Do one short lesson before midnight.',
    data: [`Streak: ${streak} days`, 'XP today: 0'],
  }
}

/** At 20:00, warn when a Duolingo streak would end tonight. Only active once Duolingo has synced. */
export const streakAtRisk: Rule = {
  id: 'streak-at-risk',
  every: '0 20 * * *',
  async check({ user, db, now }) {
    const today = localDate(now, user.timezone)
    const trackers = await db.select().from(schema.trackers)
      .where(and(eq(schema.trackers.userId, user.id), eq(schema.trackers.slug, 'duolingo.streak')))
    if (!trackers.length) return []
    const rows = await db.select({ slug: schema.trackers.slug, d: schema.entries.localDate, v: schema.entries.value })
      .from(schema.entries).innerJoin(schema.trackers, eq(schema.trackers.id, schema.entries.trackerId))
      .where(and(eq(schema.entries.userId, user.id), gte(schema.entries.localDate, addDays(today, -1))))
    const val = (slug: string, d: string) => rows.find((r) => r.slug === slug && r.d === d)?.v
    // Today's streak still counts yesterday's lessons; take the latest number we have.
    const streak = val('duolingo.streak', today) ?? val('duolingo.streak', addDays(today, -1))
    const alert = streakAlert(streak, val('duolingo.xp', today))
    return alert ? [alert] : []
  },
}
