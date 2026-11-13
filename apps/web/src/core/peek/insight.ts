import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { ProposedAction } from '@/db/schema'
import { describe } from '@/domain/recurrence'
import { formatDay, localDate } from '../time'
import { getRecovery } from '../recovery'
import type { User } from '../user'
import type { InsightPeek } from './types'

const UUID = /^[0-9a-f-]{36}$/i

/** Plain text for a proposed routine's rule. */
function summary(a: ProposedAction) {
  if (a.type !== 'schedule') return `New tracker${a.unit ? ` · ${a.unit}` : ''}`
  return describe(a.rrule.includes('DTSTART') ? a.rrule : `DTSTART:20260101T000000\n${a.rrule.startsWith('RRULE:') ? a.rrule : `RRULE:${a.rrule}`}`)
}

/** A Coach item (nudge, alert, plan, review): its text, proposed actions and, for a recovery decision, the choices. */
export async function loadInsightPeek(user: User, id: string): Promise<InsightPeek | null> {
  if (!UUID.test(id)) return null
  const I = schema.insights
  const [i] = await db.select().from(I).where(and(eq(I.id, id), eq(I.userId, user.id)))
  if (!i) return null
  const recovery = i.payload.recovery && i.status === 'pending' ? await getRecovery(user) : null
  const actions = i.payload.actions ?? []
  return {
    type: 'insight',
    id: i.id,
    kind: i.kind,
    status: i.status,
    title: i.title,
    body: i.body,
    meta: i.payload.meta ?? null,
    when: formatDay(localDate(i.createdAt, user.timezone)),
    review: i.payload.review ?? null,
    actions: actions.map((a) => ({ name: a.name, category: a.category, summary: summary(a) })),
    hasActions: actions.length > 0,
    recovery: recovery?.id === i.id ? recovery : null,
    goalDraft: !!i.payload.goalDraft,
  }
}
