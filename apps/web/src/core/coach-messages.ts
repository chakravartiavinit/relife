import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { ProposedAction } from '@/db/schema'
import { COACH_RETENTION_DAYS, THREAD_LOAD, type CoachMessagePayload, type ThreadMessage } from '@/domain/coach-thread'
import type { User } from './user'

/** A routine the coach proposed while answering: the pending `plan` insight, so the thread can show Approve and Dismiss. */
export type ThreadProposal = { id: string; title: string; body: string; status: 'pending' | 'accepted' | 'dismissed' | 'done'; actions: ProposedAction[] }
export type ThreadEntry = {
  id: string; role: 'user' | 'assistant'; text: string; channel: 'app' | 'telegram'; at: string
  payload: CoachMessagePayload; proposals: ThreadProposal[]
}

/** Save one message. Fails soft (a missing table before `db:push`, a dropped connection): the answer is still shown. */
export async function saveCoachMessage(user: User, m: { role: 'user' | 'assistant'; text: string; channel: 'app' | 'telegram'; payload?: CoachMessagePayload }) {
  try {
    const [row] = await db.insert(schema.coachMessages).values({ userId: user.id, role: m.role, text: m.text, channel: m.channel, payload: m.payload ?? {} }).returning({ id: schema.coachMessages.id })
    return row?.id ?? null
  } catch (e) {
    console.error('[coach_messages]', e instanceof Error ? e.message : e)
    return null
  }
}

/** The last `limit` messages, oldest first. Empty when the table is missing. */
export async function recentCoachMessages(user: User, limit = THREAD_LOAD): Promise<(typeof schema.coachMessages.$inferSelect)[]> {
  try {
    const rows = await db.select().from(schema.coachMessages).where(eq(schema.coachMessages.userId, user.id))
      .orderBy(desc(schema.coachMessages.createdAt)).limit(limit)
    return rows.reverse()
  } catch {
    return []
  }
}

/** The last few turns as the model needs them (before the question being asked now). */
export async function threadForModel(user: User, limit = 12): Promise<ThreadMessage[]> {
  return (await recentCoachMessages(user, limit)).map((r) => ({ role: r.role, text: r.text, payload: r.payload }))
}

/** What the Ask pane draws: the last 30 messages with the routines the coach proposed in them. */
export async function loadThread(user: User): Promise<ThreadEntry[]> {
  const rows = await recentCoachMessages(user)
  const ids = [...new Set(rows.flatMap((r) => r.payload.insightIds ?? []))]
  const insights = ids.length
    ? await db.select().from(schema.insights).where(and(eq(schema.insights.userId, user.id), inArray(schema.insights.id, ids)))
    : []
  const byId = new Map(insights.map((i) => [i.id, i]))
  return rows.map((r) => ({
    id: r.id, role: r.role, text: r.text, channel: r.channel, at: r.createdAt.toISOString(), payload: r.payload,
    proposals: (r.payload.insightIds ?? []).flatMap((id) => {
      const i = byId.get(id)
      return i ? [{ id: i.id, title: i.title, body: i.body, status: i.status, actions: i.payload.actions ?? [] }] : []
    }),
  }))
}

/** "Clear conversation": delete this user's messages. */
export async function clearCoachMessages(user: User) {
  await db.delete(schema.coachMessages).where(eq(schema.coachMessages.userId, user.id))
}

/** The `coach-messages-prune` job: messages older than 180 days. Returns how many went. */
export async function pruneCoachMessages(user: User, now = new Date()) {
  const cutoff = new Date(now.getTime() - COACH_RETENTION_DAYS * 86_400_000)
  const rows = await db.delete(schema.coachMessages)
    .where(and(eq(schema.coachMessages.userId, user.id), lt(schema.coachMessages.createdAt, cutoff))).returning({ id: schema.coachMessages.id })
  return rows.length
}
