import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@/db'
import { bucketOf, rankCaptureSuggestions, type CapturePayload } from '@/domain/capture'
import { LAST_VALUE } from '@/domain/quicklog'
import { buildDayPlan } from './day-plan'
import { manualLogHistory, trackerDays } from './metrics'
import { addDays, localDate } from './time'
import type { User } from './user'

const DUE_MAX = 5
const SPEND_DAYS = 60
const SPEND_MAX = 3

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Manual spends from the last 60 days grouped by merchant: the ones typed most often, with their usual amount. */
async function usualSpends(user: User, now: Date): Promise<CapturePayload['spend']> {
  const from = addDays(localDate(now, user.timezone), -SPEND_DAYS)
  const rows = await db.select({ merchant: schema.transactions.merchant, amount: schema.transactions.amount, currency: schema.transactions.currency })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, user.id), eq(schema.transactions.source, 'manual'), lt(schema.transactions.amount, 0), gte(schema.transactions.localDate, from)))
    .orderBy(desc(schema.transactions.at))
  const by = new Map<string, { note: string; currency: string; amounts: number[] }>()
  for (const r of rows) {
    if (!r.merchant) continue
    const key = `${r.merchant.toLowerCase()}|${r.currency}`
    const g = by.get(key) ?? { note: r.merchant, currency: r.currency, amounts: [] }
    g.amounts.push(Math.abs(Number(r.amount)))
    by.set(key, g)
  }
  // Map keeps insertion order, which is newest first: a tie goes to the more recent merchant.
  return [...by.values()].sort((a, b) => b.amounts.length - a.amounts.length).slice(0, SPEND_MAX)
    .map((g) => ({ note: g.note, amount: Math.round(median(g.amounts) * 100) / 100, currency: g.currency }))
}

/**
 * Everything Capture shows before you type: routines due now, quantity goals, what you usually log at this time
 * of day, whether mood is logged, and the spends you repeat. Due routines and goals come from the same plan as
 * Today (`buildDayPlan`), so a check-off here and on Today always agree.
 */
export async function loadCapture(user: User, now = new Date()): Promise<CapturePayload> {
  const [plan, history, trackers, mood, spend] = await Promise.all([
    buildDayPlan(user, now),
    manualLogHistory(user, 28, now),
    db.select({ slug: schema.trackers.slug, name: schema.trackers.name, unit: schema.trackers.unit }).from(schema.trackers)
      .where(and(eq(schema.trackers.userId, user.id), isNull(schema.trackers.archivedAt))).orderBy(schema.trackers.name),
    trackerDays(user, localDate(now, user.timezone), localDate(now, user.timezone), { slugs: ['mood'] }),
    usualSpends(user, now),
  ])
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: user.timezone, hour: 'numeric', hourCycle: 'h23' }).format(now))
  const bucket = bucketOf(hour)
  const goals = plan.goals.filter((g) => g.slug).map((g) => ({
    scheduleId: g.scheduleId, slug: g.slug!, name: g.name, value: g.value, target: g.target, unit: g.unit, step: g.step, area: g.area as CapturePayload['goals'][number]['area'],
  }))
  const hourOf = (time: string) => Number(time.slice(0, 2))
  const due = plan.rows
    .filter((r) => r.status === 'missed' || (r.status === 'pending' && bucketOf(hourOf(r.time)) === bucket))
    .sort((a, b) => Number(b.status === 'missed') - Number(a.status === 'missed') || a.time.localeCompare(b.time))
    .slice(0, DUE_MAX)
    .map((r) => ({ scheduleId: r.scheduleId, occurrence: r.occurrence, name: r.name, time: r.time, area: r.area as CapturePayload['due'][number]['area'], kind: r.kind, status: r.status as 'pending' | 'missed', xp: r.xp }))
  // Water and the like have their own goal chip, and set-not-add trackers (mood, weight) have no usual amount to repeat.
  const skip = new Set([...goals.map((g) => g.slug), ...LAST_VALUE])
  return {
    now: now.toISOString(), bucket, currency: user.baseCurrency, due, goals,
    frequent: rankCaptureSuggestions(history, hour, skip),
    trackers,
    moodToday: mood[0]?.days.get(plan.today) ?? null,
    spend,
  }
}
