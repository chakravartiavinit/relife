import { and, eq, gte, inArray } from 'drizzle-orm'
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

/** At 18:00, notice when workouts from Strava or Hevy stop. Only active once one of them has synced. */
export const workoutGap: Rule = {
  id: 'workout-gap',
  every: '0 18 * * *',
  async check({ user, db, now }) {
    const ts = await db.select().from(schema.trackers)
      .where(and(eq(schema.trackers.userId, user.id), inArray(schema.trackers.slug, ['exercise.minutes', 'hevy.minutes'])))
    if (!ts.length) return []
    const today = localDate(now, user.timezone)
    const rows = await db.select().from(schema.entries)
      .where(and(inArray(schema.entries.trackerId, ts.map((t) => t.id)), gte(schema.entries.localDate, addDays(today, -(GAP + 28)))))
    // Strava sources add up; Hevy may repeat a Strava workout, so it only counts where it's larger.
    const sum = (slug: string) => {
      const id = ts.find((t) => t.slug === slug)?.id
      const m = new Map<string, number>()
      for (const r of rows) if (r.trackerId === id) m.set(r.localDate, (m.get(r.localDate) ?? 0) + r.value)
      return m
    }
    const days = sum('exercise.minutes')
    for (const [d, v] of sum('hevy.minutes')) days.set(d, Math.max(v, days.get(d) ?? 0))
    const alert = workoutGapAlert(days, today)
    return alert ? [alert] : []
  },
}
