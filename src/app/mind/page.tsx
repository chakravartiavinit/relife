import type { Metadata } from 'next'
import { Smile } from 'lucide-react'
import { AreaHeader } from '@/ui/components/area-header'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { trackerDays } from '@/core/metrics'
import { addDays, localDate } from '@/core/time'
import { CATEGORY } from '@/ui/tokens'
import { Card, CardHeader, KpiStrip } from '@/ui/components/card'
import { average, fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { MetricCard } from '@/ui/components/category/metric-card'
import { RoutinesCard } from '@/ui/components/category/routines-card'
import { CategorySkeleton } from '@/ui/components/category/skeleton'
import { ScaleLogger } from '@/ui/components/category/mood-logger'

export const metadata: Metadata = { title: 'Mind' }
const color = CATEGORY.mind.color

export default function MindPage() {
  return (
    <div>
      <AreaHeader area="mind" title="Mood & focus" description="Mood, energy, screen time and the routines that help you think clearly." />
      <Suspense fallback={<CategorySkeleton />}>
        <Mind />
      </Suspense>
    </div>
  )
}

async function Mind() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -27)
  const data = await trackerDays(user, from, today, { slugs: ['mood', 'energy', 'screen-time', 'meditation'] })
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)
  const last7 = (slug: string) => fillDays(get(slug)?.days ?? new Map(), addDays(today, -6), today).map((p) => p.value)
  const avg = (slug: string) => average(last7(slug))
  const mood = avg('mood'), energy = avg('energy'), screen = avg('screen-time')
  const meditation = last7('meditation').reduce<number>((s, v) => s + (v ?? 0), 0)
  const fmt1 = (v: number | null, suffix = '') => (v == null ? '–' : `${formatNumber(v, 1)}${suffix}`)

  return (
    <div className="flex flex-col gap-6">
    <KpiStrip items={[
      { label: 'Mood, 7-day avg', value: fmt1(mood, ' / 5'), sub: get('mood')?.days.get(today) != null ? `Today ${get('mood')!.days.get(today)}` : 'Not logged today' },
      { label: 'Energy, 7-day avg', value: fmt1(energy, ' / 5') },
      { label: 'Screen time, 7-day avg', value: fmt1(screen, 'h'), sub: get('screen-time')?.tracker.target ? `Aim under ${formatNumber(get('screen-time')!.tracker.target!, 1)}h` : undefined },
      { label: 'Meditation, 7 days', value: meditation ? `${formatNumber(meditation)} min` : '–' },
    ]} />
    {/* Today's check-in: one slim row, both scales side by side. */}
    <Card>
      <CardHeader title="Today’s check-in" icon={<Smile strokeWidth={2} />} color="var(--cat-mind)" description="Tap once a day. Patterns show up after a week." />
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-2">Mood</div>
          <ScaleLogger slug="mood" name="mood" value={get('mood')?.days.get(today)} />
        </div>
        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-2">Energy</div>
          <ScaleLogger slug="energy" name="energy" value={get('energy')?.days.get(today)} />
        </div>
      </div>
    </Card>
    <div className="grid gap-6 xl:grid-cols-2">
      <MetricCard
        title="Mood" data={get('mood')} from={from} to={today} color={color} chart="area" domain={[1, 5]}
        empty={{ title: 'No mood logged yet', description: 'Use the check-in above once a day. Patterns show up after a week.' }}
      />
      {get('energy')?.days.size ? (
        <MetricCard title="Energy" data={get('energy')} from={from} to={today} color={color} chart="area" domain={[1, 5]} empty={{ title: '', description: '' }} />
      ) : null}
      {get('screen-time')?.days.size ? (
        <div className={get('energy')?.days.size ? 'xl:col-span-2' : undefined}>
          <MetricCard title="Screen time" data={get('screen-time')} from={from} to={today} color={color} chart="bars" empty={{ title: '', description: '' }} />
        </div>
      ) : null}
      <div className="xl:col-span-2"><RoutinesCard user={user} category="mind" /></div>
    </div>
    </div>
  )
}
