import { Smile } from 'lucide-react'
import { AREAS } from '@/core/areas'
import { trackerDays } from '@/core/metrics'
import { addDays } from '@/core/time'
import type { User } from '@/core/user'
import { AllMetrics } from '../components/area/all-metrics'
import { Card, CardHeader } from '../components/card'
import { MetricCard } from '../components/category/metric-card'
import { ScaleLogger } from '../components/category/mood-logger'

const def = AREAS.mind

/** Today's check-in and Mind's charts, then every metric (including productivity pulse, meetings and focus time). */
export async function MindOverview({ user, today }: { user: User; today: string }) {
  const from = addDays(today, -27)
  const data = await trackerDays(user, from, today, { slugs: ['mood', 'energy', 'screen-time', 'tasks.done'] })
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)
  const color = def.color
  return (
    <>
      {/* Today's check-in: one slim row, both scales side by side. */}
      <Card>
        <CardHeader title="Today’s check-in" icon={<Smile strokeWidth={2} />} color={color} description="Tap once a day. Patterns show up after a week." />
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
      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2 @2xl:[&>*:last-child:nth-child(odd)]:col-span-2">
        <MetricCard
          title="Mood" data={get('mood')} from={from} to={today} color={color} chart="area" domain={[1, 5]}
          empty={{ title: 'No mood logged yet', description: 'Use the check-in above once a day. Patterns show up after a week.' }}
        />
        {get('energy')?.days.size ? <MetricCard title="Energy" data={get('energy')} from={from} to={today} color={color} chart="area" domain={[1, 5]} empty={{ title: '', description: '' }} /> : null}
        {get('tasks.done')?.days.size ? <MetricCard title="Tasks done" data={get('tasks.done')} from={from} to={today} color={color} chart="bars" decimals={0} target={get('tasks.done')?.tracker.target} empty={{ title: '', description: '' }} /> : null}
        {get('screen-time')?.days.size ? <MetricCard title="Screen time" data={get('screen-time')} from={from} to={today} color={color} chart="bars" empty={{ title: '', description: '' }} /> : null}
      </div>
      <AllMetrics user={user} def={def} today={today} />
    </>
  )
}
