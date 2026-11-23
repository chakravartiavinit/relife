import { trackerDays } from '@/core/metrics'
import type { User } from '@/core/user'
import { Card, CardHeader } from '../components/card'
import { ScaleLogger } from '../components/category/mood-logger'
import { StatusWord } from '../components/status-word'

/** Today's check-in, the first card of Mind's rail: both scales side by side. The mood chart is the Overview's lead. */
export async function MindCheckIn({ user, today }: { user: User; today: string }) {
  const data = await trackerDays(user, today, today, { slugs: ['mood', 'energy'] })
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)?.days.get(today)
  const mood = get('mood'), energy = get('energy')
  return (
    <Card>
      <CardHeader
        title="Today’s check-in" description={mood == null && energy == null ? 'Not logged yet today. One tap each.' : 'Tap again to change it. Patterns show up after a week.'}
        action={mood == null && energy == null ? <StatusWord status="Quiet" /> : undefined}
      />
      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-2 text-label text-ink-2">Mood</div>
          <ScaleLogger slug="mood" name="mood" value={mood} />
        </div>
        <div>
          <div className="mb-2 text-label text-ink-2">Energy</div>
          <ScaleLogger slug="energy" name="energy" value={energy} />
        </div>
      </div>
    </Card>
  )
}
