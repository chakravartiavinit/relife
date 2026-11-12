import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { loadAdherence } from '../adherence'
import { trackerDays } from '../metrics'
import type { ScheduleMeta } from '../schedules'
import { addDays } from '../time'
import type { User } from '../user'
import { average, fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import type { AreaKpi } from './types'

/** Sleep and steps (7-day averages), today's water against its goal, and how many medicines were kept. */
export async function healthKpis(user: User, today: string): Promise<AreaKpi[]> {
  const [goals, meds] = await Promise.all([
    db.select().from(schema.schedules)
      .where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.category, 'health'), eq(schema.schedules.active, true))),
    loadAdherence(user, { category: 'health', kinds: ['medicine'] }),
  ])
  const waterGoal = goals.find((s) => (s.meta as ScheduleMeta).trackerSlug && s.target)
  const waterSlug = waterGoal ? (waterGoal.meta as ScheduleMeta).trackerSlug! : 'water'
  const data = await trackerDays(user, addDays(today, -6), today, { slugs: ['sleep.hours', 'steps', waterSlug] })
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)
  const avg7 = (slug: string) => average(fillDays(get(slug)?.days ?? new Map(), addDays(today, -6), today).map((p) => p.value))
  const sleep = avg7('sleep.hours')
  const steps = avg7('steps')
  const water = get(waterSlug)?.days.get(today)
  const rates = meds.map((m) => m.rate).filter((r): r is number => r != null)
  const kept = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null
  return [
    { label: 'Sleep, 7-day avg', value: sleep == null ? '–' : `${formatNumber(sleep, 1)}h`, sub: `Target ${formatNumber(get('sleep.hours')?.tracker.target ?? 7.5, 1)}h`, peek: { type: 'metric', id: 'sleep.hours' } },
    { label: 'Steps, 7-day avg', value: steps == null ? '–' : formatNumber(steps), sub: `Target ${formatNumber(get('steps')?.tracker.target ?? 8000)}`, peek: { type: 'metric', id: 'steps' } },
    { label: waterGoal ? `${waterGoal.name} today` : 'Water today', value: water == null ? '–' : formatNumber(water), sub: waterGoal?.target ? `of ${formatNumber(waterGoal.target)} ${waterGoal.unit ?? ''}` : 'No daily goal yet', peek: { type: 'metric', id: waterSlug } },
    { label: 'Medicines kept', value: kept == null ? '–' : `${Math.round(kept * 100)}%`, sub: meds.length ? `${meds.length} medicine${meds.length === 1 ? '' : 's'}, last 60 days` : 'None added' },
  ]
}
