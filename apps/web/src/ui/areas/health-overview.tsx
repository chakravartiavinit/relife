import { AREAS } from '@/core/areas'
import { loadWater } from '@/core/areas/health'
import { trackerDays } from '@/core/metrics'
import { addDays } from '@/core/time'
import type { User } from '@/core/user'
import { AllMetrics } from '../components/area/all-metrics'
import { MetricCard } from '../components/category/metric-card'

const def = AREAS.health

/** Health's own charts (sleep, steps, water, active minutes, weight), then every metric. Routines live on the right and on their tab. */
export async function HealthOverview({ user, today }: { user: User; today: string }) {
  const from = addDays(today, -27)
  const { goal: waterGoal, slug: waterSlug } = await loadWater(user)
  const data = await trackerDays(user, from, today, { slugs: ['sleep.hours', 'steps', 'weight', 'exercise.minutes', waterSlug] })
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)
  const color = def.color
  return (
    <>
      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2 @2xl:[&>*:last-child:nth-child(odd)]:col-span-2">
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
        {get('exercise.minutes')?.days.size ? (
          <MetricCard title="Active minutes" data={get('exercise.minutes')} from={from} to={today} color={color} chart="bars" decimals={0} target={get('exercise.minutes')?.tracker.target ?? 30} empty={{ title: '', description: '' }} />
        ) : null}
        {get('weight')?.days.size ? (
          <MetricCard title="Weight" data={get('weight')} from={from} to={today} color={color} chart="area" empty={{ title: '', description: '' }} />
        ) : null}
      </div>
      <AllMetrics user={user} def={def} today={today} />
    </>
  )
}
