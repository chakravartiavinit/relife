import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { trackerDays } from '@/core/metrics'
import { addDays, localDate } from '@/core/time'
import type { ScheduleMeta } from '@/core/schedules'
import { average, fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '@/ui/tokens'
import { KpiStrip, PageHeader } from '@/ui/components/card'
import { CategorySkeleton } from '@/ui/components/category/skeleton'
import { MetricCard } from '@/ui/components/category/metric-card'
import { RoutinesCard } from '@/ui/components/category/routines-card'
import { loadAdherence } from '@/core/adherence'

export const metadata: Metadata = { title: 'Health' }
const color = CATEGORY.health.color

export default function HealthPage() {
  return (
    <div>
      <PageHeader eyebrow="Health" title="Body & routines" description="Sleep, movement, water, medicines and the small things you do every day." />
      <Suspense fallback={<CategorySkeleton />}>
        <Health />
      </Suspense>
    </div>
  )
}

async function Health() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -27)
  const [goals, meds] = await Promise.all([
    db.select().from(schema.schedules)
      .where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.category, 'health'), eq(schema.schedules.active, true))),
    loadAdherence(user, { category: 'health', kinds: ['medicine'] }),
  ])
  const waterGoal = goals.find((s) => (s.meta as ScheduleMeta).trackerSlug && s.target)
  const waterSlug = waterGoal ? (waterGoal.meta as ScheduleMeta).trackerSlug! : 'water'
  const data = await trackerDays(user, from, today, { slugs: ['sleep.hours', 'steps', 'weight', waterSlug] })
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)
  const avg7 = (slug: string) => average(fillDays(get(slug)?.days ?? new Map(), addDays(today, -6), today).map((p) => p.value))
  const sleep = avg7('sleep.hours')
  const steps = avg7('steps')
  const water = get(waterSlug)?.days.get(today)
  const rates = meds.map((m) => m.rate).filter((r): r is number => r != null)
  const kept = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip items={[
        { label: 'Sleep, 7-day avg', value: sleep == null ? '–' : `${formatNumber(sleep, 1)}h`, sub: `Target ${formatNumber(get('sleep.hours')?.tracker.target ?? 7.5, 1)}h` },
        { label: 'Steps, 7-day avg', value: steps == null ? '–' : formatNumber(steps), sub: `Target ${formatNumber(get('steps')?.tracker.target ?? 8000)}` },
        { label: waterGoal ? `${waterGoal.name} today` : 'Water today', value: water == null ? '–' : formatNumber(water), sub: waterGoal?.target ? `of ${formatNumber(waterGoal.target)} ${waterGoal.unit ?? ''}` : 'No daily goal yet' },
        { label: 'Medicines kept', value: kept == null ? '–' : `${Math.round(kept * 100)}%`, sub: meds.length ? `${meds.length} medicine${meds.length === 1 ? '' : 's'}, last 60 days` : 'None added' },
      ]} />
      <div className="grid gap-6 xl:grid-cols-2">
        <MetricCard
          title="Sleep" data={get('sleep.hours')} from={from} to={today} color={color} chart="area" target={get('sleep.hours')?.tracker.target ?? 7.5}
          empty={{ title: 'No sleep data yet', description: <>Send <code>/sleep</code> and <code>/wake</code> to the Telegram bot, or set up the Sleep Focus shortcut.</> }}
        />
        <MetricCard
          title="Steps" data={get('steps')} from={from} to={today} color={color} chart="bars" decimals={0} target={get('steps')?.tracker.target ?? 8000}
          empty={{ title: 'No steps yet', description: 'Your iPhone already counts steps. Add the nightly Health shortcut to send them here.' }}
        />
        <MetricCard
          title={waterGoal?.name ?? 'Water'} data={get(waterSlug)} from={from} to={today} color={color} chart="bars" decimals={0} target={waterGoal?.target}
          empty={waterGoal
            ? { title: 'No water logged yet', description: `Tap the quick-add button on Today, or type “${waterSlug} 250” in ⌘K.` }
            : { title: 'No water goal', description: 'Add a routine with a daily target, like 3,000 ml, then tap +250 ml through the day.' }}
        />
        {get('weight')?.days.size ? (
          <MetricCard title="Weight" data={get('weight')} from={from} to={today} color={color} chart="area" empty={{ title: '', description: '' }} />
        ) : null}
      </div>
      <RoutinesCard user={user} category="health" title="Routines & medicines" />
    </div>
  )
}
