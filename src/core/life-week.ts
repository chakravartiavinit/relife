import { cache } from 'react'
import { and, eq, gte, lte, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { BRIEF_SCOPES, topChange, changeLine, type ChangeFact } from '@/domain/briefs'
import { buildWeek } from '@/domain/life-week'
import { weekStart } from '@/domain/quests'
import { peekParam } from '@/domain/peek'
import { latestBriefs } from './briefs'
import { loadPatterns } from './patterns'
import { addDays, localDate } from './time'
import type { User } from './user'
import { xpSummary } from './xp'

/** The latest brief of every scope: the Life hub's tiles and header share one query. */
export const loadHubBriefs = cache((user: User) => latestBriefs(user, [...BRIEF_SCOPES]))

/** Area levels, read once per request for all six tiles. */
export const loadAreaLevels = cache(async (user: User) => (await xpSummary(user)).areas)

/**
 * "This week, area by area": per area which days earned XP, the week's XP against the same days of last week,
 * and its biggest change in words. Areas are the DB categories (`areas`, the ones the user shows).
 */
export const loadLifeWeek = cache(async (user: User, areas: string[]) => {
  const today = localDate(new Date(), user.timezone)
  const from = addDays(weekStart(today), -7)
  const [xp, patterns] = await Promise.all([
    db.select({ date: schema.xpEvents.localDate, area: schema.xpEvents.area, amount: schema.xpEvents.amount }).from(schema.xpEvents)
      .where(and(eq(schema.xpEvents.userId, user.id), gte(schema.xpEvents.localDate, from), lte(schema.xpEvents.localDate, today), ne(schema.xpEvents.area, 'general'), ne(schema.xpEvents.kind, 'achievement'))),
    loadPatterns(user),
  ])
  const week = buildWeek(xp, today, areas)
  const change = (area: string) => {
    const facts: ChangeFact[] = patterns.changes.filter((c) => c.signal.id !== 'routines' && c.signal.area === area)
      .map((c) => ({ name: c.signal.name, unit: c.signal.unit, pct: c.pct, recent: c.recent, usual: c.usual, peek: c.signal.id.startsWith('tracker:') ? peekParam({ type: 'metric', id: c.signal.id.slice(8) }) : undefined }))
    const top = topChange(facts)
    return top ? { text: changeLine(top), peek: top.peek } : null
  }
  return { ...week, changes: Object.fromEntries(areas.map((a) => [a, change(a)])) }
})
