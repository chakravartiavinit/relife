import { and, eq, gte } from 'drizzle-orm'
import { schema } from '@/db'
import { addDays, localDate } from '@/core/time'
import type { Alert, Rule } from '@/core/types'

const GAP = 4

/**
 * Pure: an alert when someone who usually works out has stopped for GAP days, or null. "Usually" means
 * 8 or more active days in the 4 weeks before the gap. Exported for tests.
 */
export function workoutGapAlert(days: Map<string, number>, today: string): Alert | null {
  const gap = Array.from({ length: GAP }, (_, i) => addDays(today, -(i + 1)))
  if (!gap.every((d) => days.has(d) && !days.get(d))) return null // needs synced zeros, not missing days
  let active = 0
  for (let i = GAP + 1; i <= GAP + 28; i++) if ((days.get(addDays(today, -i)) ?? 0) > 0) active++
  if (active < 8) return null
  const perWeek = Math.round((active / 4) * 10) / 10
  return {
    key: 'workout-gap',
    title: `${GAP} days without a workout`,
    body: `You usually move ${perWeek} days a week, but nothing since ${gap.at(-1)}.`,
    category: 'health',
    emoji: '🏃',
    meta: 'Health · This week',
    action: 'A 20-minute walk or run today restarts it.',
    data: [`Active days in the 4 weeks before: ${active} of 28`, `Days since the last workout: ${GAP}`],
    weekly: true,
  }
}

/** At 18:00, notice when workouts from Strava stop. Only active once Strava has synced. */
export const workoutGap: Rule = {
  id: 'workout-gap',
  every: '0 18 * * *',
  async check({ user, db, now }) {
    const [t] = await db.select().from(schema.trackers)
      .where(and(eq(schema.trackers.userId, user.id), eq(schema.trackers.slug, 'exercise.minutes')))
    if (!t) return []
    const today = localDate(now, user.timezone)
    const rows = await db.select().from(schema.entries)
      .where(and(eq(schema.entries.trackerId, t.id), gte(schema.entries.localDate, addDays(today, -(GAP + 28)))))
    const days = new Map<string, number>()
    for (const r of rows) days.set(r.localDate, (days.get(r.localDate) ?? 0) + r.value)
    const alert = workoutGapAlert(days, today)
    return alert ? [alert] : []
  },
}
