import { AREAS } from '@/core/areas'
import { trackerDays } from '@/core/metrics'
import { addDays } from '@/core/time'
import type { User } from '@/core/user'
import { Card, CardHeader } from '../components/card'
import { MetricCard } from '../components/category/metric-card'
import { ScaleLogger } from '../components/category/mood-logger'

const def = AREAS.mind

/** Today's check-in, then the mood chart. Energy, tasks done and screen time are rows of the targets table and charts on Trends. */
export async function MindOverview({ user, today }: { user: User; today: string }) {
  const from = addDays(today, -27)
  const data = await trackerDays(user, from, today, { slugs: ['mood', 'energy'] })
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)
  return (
    <>
      {/* Today's check-in: both scales side by side. */}
      <Card>
        <CardHeader title="Today’s check-in" description="Tap once a day. Patterns show up after a week." />
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 @2xl:grid-cols-2">
          <div>
            <div className="mb-2 text-small font-medium text-ink-2">Mood</div>
            <ScaleLogger slug="mood" name="mood" value={get('mood')?.days.get(today)} />
          </div>
          <div>
            <div className="mb-2 text-small font-medium text-ink-2">Energy</div>
            <ScaleLogger slug="energy" name="energy" value={get('energy')?.days.get(today)} />
          </div>
        </div>
      </Card>
      <MetricCard
        title="Mood" data={get('mood')} from={from} to={today} color={def.color} chart="area" domain={[1, 5]}
        empty={{ title: 'No mood logged yet', description: 'Use the check-in above once a day. Patterns show up after a week.' }}
      />
    </>
  )
}
