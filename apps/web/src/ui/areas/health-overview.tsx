import { AREAS } from '@/core/areas'
import { trackerDays } from '@/core/metrics'
import { addDays } from '@/core/time'
import type { User } from '@/core/user'
import { average, fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { Card, CardHeader } from '../components/card'
import { MetricCard } from '../components/category/metric-card'
import { TargetTrend, TargetTrendLegend } from '../components/category/target-trend'

const def = AREAS.health

/**
 * Health's lead chart: sleep against its target over 28 days, labelled on the chart. Steps, water, active minutes and
 * weight are rows of the targets table above and charts on the Trends tab; every metric is under All metrics.
 */
export async function HealthOverview({ user, today }: { user: User; today: string }) {
  const from = addDays(today, -27)
  const [sleep] = await trackerDays(user, from, today, { slugs: ['sleep.hours'] })
  if (!sleep?.days.size) {
    return (
      <MetricCard
        title="Sleep" data={sleep} from={from} to={today} color={def.color} chart="area" target={7.5}
        empty={{ title: 'No sleep data yet', description: <>Send <code>/sleep</code> and <code>/wake</code> to the Telegram bot, or set up the Sleep Focus shortcut.</> }}
      />
    )
  }
  const target = sleep.tracker.target ?? 7.5
  const points = fillDays(sleep.days, from, today)
  const avg = average(points.map((p) => p.value))
  return (
    <Card aria-labelledby="sleep-heading">
      <CardHeader
        title={<span id="sleep-heading">Sleep, last 28 days</span>}
        description={avg == null ? undefined : `${formatNumber(avg, 1)}h average against your ${formatNumber(target, 1)}h target`}
        action={<TargetTrendLegend target={target} unit="h" color={def.color} className="hidden @lg:flex" />}
      />
      <TargetTrend data={points} target={target} unit="h" color={def.color} label="Sleep, last 28 days" />
      <TargetTrendLegend target={target} unit="h" color={def.color} className="mt-3 @lg:hidden" />
    </Card>
  )
}
