import { cache } from 'react'
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { trackerDays } from '../metrics'
import { addDays, daysBetween, localDate } from '../time'
import type { User } from '../user'
import type { AreaKpi } from './types'

/** Everyone you keep in touch with, overdue first, with the days since you last talked. One read per request. */
export const loadPeople = cache(async (user: User, today: string) => {
  const people = await db.select().from(schema.people).where(eq(schema.people.userId, user.id)).orderBy(asc(schema.people.name))
  const rows = people.map((p) => {
    const since = p.lastContactedAt ? daysBetween(localDate(p.lastContactedAt, user.timezone), today) : null
    const overdue = p.contactEveryDays != null && (since == null || since > p.contactEveryDays)
    return { p, since, overdue }
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || (b.since ?? 1e9) - (a.since ?? 1e9))
  const [contacts] = await trackerDays(user, addDays(today, -29), today, { slugs: ['people.contacts'] })
  const catchUps = [...(contacts?.days.values() ?? [])].reduce((s, v) => s + v, 0)
  return { rows, catchUps }
})

export async function peopleKpis(user: User, today: string): Promise<AreaKpi[]> {
  const { rows, catchUps } = await loadPeople(user, today)
  const tracked = rows.filter((r) => r.p.contactEveryDays != null)
  const overdue = tracked.filter((r) => r.overdue)
  const longest = rows.reduce<{ name: string; since: number } | null>((m, r) => (r.since != null && (!m || r.since > m.since) ? { name: r.p.name, since: r.since } : m), null)
  return [
    { label: 'In touch', value: tracked.length ? `${tracked.length - overdue.length}/${tracked.length}` : '–', sub: tracked.length ? 'within their rhythm' : 'Add people with a rhythm' },
    { label: 'Overdue', value: String(overdue.length), sub: overdue[0] ? `Start with ${overdue[0].p.name}` : 'Nobody waiting', tone: overdue.length ? 'bad' : undefined },
    { label: 'Catch-ups, 30 days', value: String(catchUps), peek: { type: 'metric', id: 'people.contacts' } },
    { label: 'Longest gap', value: longest ? `${longest.since}d` : '–', sub: longest?.name },
  ]
}
