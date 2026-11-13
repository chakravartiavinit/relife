import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { formatDay, localDate } from '../time'
import { questBoard } from '../quests'
import { systemBoard } from '../system'
import type { User } from '../user'
import type { QuestPeek } from './types'

const UUID = /^[0-9a-f-]{36}$/i
const KIND = { daily: 'Daily quest', penalty: 'Retired quest', emergency: 'Corrective quest', recovery: 'Recovery step' } as const

/** `quest:<systemQuestId>` is one of the System's quests; `quest:weekly.<key>` is this week's quest. */
export async function loadQuestPeek(user: User, id: string): Promise<QuestPeek | null> {
  if (id.startsWith('weekly.')) {
    const key = id.slice('weekly.'.length)
    const q = (await questBoard(user)).weekly.find((w) => w.key === key)
    if (!q) return null
    return {
      type: 'quest', id, source: 'weekly', title: q.title, reason: null, area: q.area === 'general' ? 'general' : q.area,
      status: q.done ? 'cleared' : 'active', period: `This week · from ${formatDay(q.start, { weekday: 'short', day: 'numeric', month: 'short' })}`,
      progress: q.progress, target: q.target, unit: 'days', rank: null, xp: null, baseline: null, difficulty: null, measure: q.measure, statSlug: null,
    }
  }
  if (!UUID.test(id)) return null
  const Q = schema.systemQuests
  const [q] = await db.select().from(Q).where(and(eq(Q.id, id), eq(Q.userId, user.id)))
  if (!q) return null
  const today = localDate(new Date(), user.timezone)
  const [board, tracker] = await Promise.all([
    q.status === 'active' ? systemBoard(user) : Promise.resolve(null),
    q.statId.includes(':') ? Promise.resolve(null) : db.select({ slug: schema.trackers.slug }).from(schema.trackers).where(and(eq(schema.trackers.userId, user.id), eq(schema.trackers.slug, q.statId))).then((r) => r[0] ?? null),
  ])
  return {
    type: 'quest', id: q.id, source: 'system', title: q.title, reason: q.reason, area: q.area, status: q.status,
    period: `${KIND[q.kind]} · ${q.toDate === today ? 'today' : `until ${formatDay(q.toDate, { weekday: 'short', day: 'numeric', month: 'short' })}`}`,
    progress: q.progress, target: q.target, unit: q.unit, rank: q.rank, xp: q.xp, baseline: q.baseline, difficulty: board?.difficulty ?? null,
    measure: `${q.statName}, ${q.agg === 'avg' ? 'average' : 'total'}, ${q.op === 'gte' ? 'at least' : 'at most'}`, statSlug: tracker?.slug ?? null,
  }
}
