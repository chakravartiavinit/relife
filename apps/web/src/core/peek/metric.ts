import { and, desc, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/db'
import { METRIC_DAYS, summarizeMetric } from '@/domain/metric-peek'
import { trackerDays } from '../metrics'
import { addDays, localDate } from '../time'
import type { User } from '../user'
import type { MetricPeek } from './types'

/** One tracker for the metric Peek and /plan/trackers/[slug]: 90 days, averages, streak, recent entries, sources. */
export async function loadMetricPeek(user: User, slug: string): Promise<MetricPeek | null> {
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -(METRIC_DAYS - 1))
  const [data] = await trackerDays(user, from, today, { slugs: [slug] })
  if (!data) return null
  const { tracker: t, days } = data
  const E = schema.entries
  const [entries, recent] = await Promise.all([
    db.select().from(E).where(and(eq(E.trackerId, t.id), eq(E.userId, user.id))).orderBy(desc(E.localDate), desc(E.updatedAt)).limit(12),
    db.select({ source: E.source, verified: E.verified, date: E.localDate }).from(E).where(and(eq(E.trackerId, t.id), eq(E.userId, user.id), gte(E.localDate, from))).orderBy(desc(E.localDate)),
  ])
  const sources = new Map<string, { source: string; verified: boolean; lastDate: string }>()
  for (const r of recent) if (!sources.has(r.source)) sources.set(r.source, { source: r.source, verified: r.verified, lastDate: r.date })
  return {
    type: 'metric',
    id: t.id,
    slug: t.slug,
    name: t.name,
    category: t.category,
    kind: t.kind,
    unit: t.unit,
    target: t.target,
    direction: t.direction,
    aggregate: t.aggregate,
    today,
    todayValue: days.get(today) ?? null,
    ...summarizeMetric(days, today, t.target, t.direction),
    entries: entries.map((e) => ({ id: e.id, date: e.localDate, value: e.value, source: e.source, verified: e.verified, note: e.note })),
    sources: [...sources.values()],
  }
}
