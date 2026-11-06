import { and, eq } from 'drizzle-orm'
import { schema } from '@/db'
import type { ScheduleMeta } from '@/core/schedules'
import type { Rule } from '@/core/types'

/** Refill reminder when pills on hand drop to the refill level (default: 5 days of doses). */
export const medicineStock: Rule = {
  id: 'medicine-stock',
  every: '0 9 * * *',
  async check({ user, db }) {
    const meds = await db.select().from(schema.schedules).where(and(
      eq(schema.schedules.userId, user.id), eq(schema.schedules.kind, 'medicine'), eq(schema.schedules.active, true),
    ))
    return meds.flatMap((m) => {
      const meta = m.meta as ScheduleMeta
      if (typeof meta.stock !== 'number') return []
      const perDay = (m.rrule.match(/^RRULE:/gm)?.length ?? 1) * (meta.doseCount ?? 1)
      const refillAt = meta.refillAt ?? perDay * 5
      if (meta.stock > refillAt) return []
      return [{
        key: `medicine-stock:${m.id}`,
        title: `Refill ${m.name}`,
        body: `${meta.stock} left, about ${Math.floor(meta.stock / perDay)} days. Order more soon.`,
        category: m.category,
      }]
    })
  },
}
