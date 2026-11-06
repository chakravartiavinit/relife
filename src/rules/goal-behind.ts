import { and, eq } from 'drizzle-orm'
import { schema } from '@/db'
import { dayAgenda, type ScheduleMeta } from '@/core/schedules'
import { localDate } from '@/core/time'
import type { Rule } from '@/core/types'
import { goalValue } from '@/bot/messages'
import { formatNumber } from '@/domain/money'

/** At 18:00, nudge quantity goals (water) that are under half done. */
export const goalBehind: Rule = {
  id: 'goal-behind',
  every: '0 18 * * *',
  async check({ user, db, now }) {
    const day = localDate(now, user.timezone)
    const ids = new Set((await dayAgenda(user, day, now)).map((i) => i.schedule.id))
    const list = await db.select().from(schema.schedules)
      .where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true)))
    const out = []
    for (const s of list) {
      const slug = (s.meta as ScheduleMeta).trackerSlug
      if (!slug || !s.target || !ids.has(s.id)) continue
      const v = await goalValue(user, slug, day)
      if (v >= s.target / 2) continue
      out.push({
        key: `goal-behind:${s.id}`,
        title: `${s.name} is behind`,
        body: `${formatNumber(v)} of ${formatNumber(s.target)}${s.unit ? ` ${s.unit}` : ''} so far today.`,
        category: s.category,
      })
    }
    return out
  },
}
