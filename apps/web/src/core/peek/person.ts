import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { fillDays } from '@/domain/series'
import { trackerDays } from '../metrics'
import { addDays, daysBetween, formatDay, localDate } from '../time'
import type { User } from '../user'
import type { PersonPeek } from './types'

const UUID = /^[0-9a-f-]{36}$/i

/** Someone in the keep-in-touch list: when you last talked, their rhythm and whether it is due. */
export async function loadPersonPeek(user: User, id: string): Promise<PersonPeek | null> {
  if (!UUID.test(id)) return null
  const [p] = await db.select().from(schema.people).where(and(eq(schema.people.id, id), eq(schema.people.userId, user.id)))
  if (!p) return null
  const today = localDate(new Date(), user.timezone)
  const [contacts] = await trackerDays(user, addDays(today, -29), today, { slugs: ['people.contacts'] })
  const last = p.lastContactedAt ? localDate(p.lastContactedAt, user.timezone) : null
  const since = last ? daysBetween(last, today) : null
  const dueIn = p.contactEveryDays != null ? (since == null ? 0 : p.contactEveryDays - since) : null
  return {
    type: 'person',
    id: p.id,
    name: p.name,
    relation: p.relation,
    contactEveryDays: p.contactEveryDays,
    notes: p.notes,
    lastContacted: last ? formatDay(last, { weekday: 'short', day: 'numeric', month: 'short' }) : null,
    since,
    overdue: p.contactEveryDays != null && (since == null || since > p.contactEveryDays),
    dueIn,
    catchUps: fillDays(contacts?.days ?? new Map(), addDays(today, -29), today, 0),
  }
}
