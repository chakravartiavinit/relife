import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { describe } from '@/domain/recurrence'
import { loadAdherence } from '../adherence'
import { dayAgenda, scheduleInitial, type ScheduleMeta } from '../schedules'
import { trackerDays } from '../metrics'
import { formatTime, localDate } from '../time'
import type { User } from '../user'
import type { RoutinePeek } from './types'

const UUID = /^[0-9a-f-]{36}$/i

/** A routine or medicine: its rule, the last 14 days, today's occurrences and (for water) today's progress. */
export async function loadRoutinePeek(user: User, id: string): Promise<RoutinePeek | null> {
  if (!UUID.test(id)) return null
  const [s] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.id, id), eq(schema.schedules.userId, user.id)))
  if (!s) return null
  const now = new Date()
  const today = localDate(now, user.timezone)
  const meta = s.meta as ScheduleMeta
  const isRoutine = s.kind === 'routine' || s.kind === 'medicine'
  const [[adh], agenda, tracker] = await Promise.all([
    isRoutine ? loadAdherence(user, { ids: [s.id], includeInactive: true }, 60, 14, now) : Promise.resolve([]),
    s.active ? dayAgenda(user, today, now) : Promise.resolve([]),
    meta.trackerSlug ? trackerDays(user, today, today, { slugs: [meta.trackerSlug] }) : Promise.resolve([]),
  ])
  let initial = null
  try { initial = isRoutine ? scheduleInitial(s) : null } catch { /* a rule the form can't read: no Edit */ }
  return {
    type: 'routine',
    id: s.id,
    name: s.name,
    kind: s.kind,
    category: s.category,
    active: s.active,
    when: describe(s.rrule),
    target: s.target,
    unit: s.unit,
    trackerSlug: meta.trackerSlug ?? null,
    step: meta.step ?? null,
    dose: meta.dose ?? null,
    stock: typeof meta.stock === 'number' ? meta.stock : null,
    refillSoon: adh?.refillSoon ?? false,
    notes: meta.notes ?? null,
    initial,
    days: adh?.days ?? [],
    streak: adh?.streak ?? 0,
    rate: adh?.rate ?? null,
    today,
    occurrences: agenda.filter((i) => i.schedule.id === s.id).map((i) => ({ iso: i.occurrence.toISOString(), time: formatTime(i.occurrence, user.timezone), status: i.status })),
    value: tracker[0]?.days.get(today) ?? null,
  }
}
