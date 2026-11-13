import { and, desc, eq, gte, like, lt } from 'drizzle-orm'
import { rawEvents } from '@/db/schema'
import { localDate } from '@/core/time'
import type { Parser } from '@/core/types'
import { asObj } from './util'

const MAX_GAP_H = 16

/** Hours between bedtime and wake, or null if they don't look like one night. */
export function sleepHours(start: Date, end: Date): number | null {
  const h = (end.getTime() - start.getTime()) / 3_600_000
  if (!(h >= 0.5 && h <= MAX_GAP_H)) return null
  return Math.round(h * 100) / 100
}

/**
 * Sleep from Telegram /sleep + /wake or Shortcuts (Sleep Focus on, alarm stopped).
 * A start is stored and waits; an end pairs with the latest start in the 16h before it.
 */
export const sleep: Parser = {
  id: 'sleep',
  match: (e) => e.source === 'sleep',
  parse: async (e, { user, db }) => {
    const b = asObj(e)
    if (b.event !== 'end') return []
    const end = new Date(String(b.at ?? e.at.toISOString()))
    const [start] = await db.select().from(rawEvents).where(and(
      eq(rawEvents.userId, user.id),
      eq(rawEvents.source, 'sleep'),
      like(rawEvents.externalId, 'start:%'),
      gte(rawEvents.at, new Date(end.getTime() - MAX_GAP_H * 3_600_000)),
      lt(rawEvents.at, end),
    )).orderBy(desc(rawEvents.at)).limit(1)
    if (!start) return []
    const hours = sleepHours(start.at, end)
    if (hours == null) return []
    return [{
      kind: 'entry', tracker: 'sleep.hours', date: localDate(end, user.timezone), value: hours, source: 'sleep',
      meta: { bedtime: start.at.toISOString(), wake: end.toISOString() },
      defaults: { name: 'Sleep', category: 'health', unit: 'h', aggregate: 'last', target: 7.5, kind: 'duration' },
    }]
  },
}
