import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { trackerDays } from '@/core/metrics'
import { addDays, localDate } from '@/core/time'
import { CATEGORY } from '@/ui/tokens'
import { Card, CardHeader, KpiStrip, PageHeader } from '@/ui/components/card'
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
      <PageHeader eyebrow="Mind" title="Mood & focus" description="Mood, energy, screen time and the routines that help you think clearly." />
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
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="How are you today?" description="Rate your mood from 1 to 5." />
        <ScaleLogger slug="mood" name="mood" value={get('mood')?.days.get(today)} />
        <div className="mt-5">
          <CardHeader title="Energy" className="mb-3" />
          <ScaleLogger slug="energy" name="energy" value={get('energy')?.days.get(today)} />
        </div>
      </Card>
      <MetricCard
        title="Mood" data={get('mood')} from={from} to={today} color={color} chart="area" domain={[1, 5]}
        empty={{ title: 'No mood logged yet', description: 'Tap a number on the left once a day. Patterns show up after a week.' }}
      />
      {get('energy')?.days.size ? (
        <MetricCard title="Energy" data={get('energy')} from={from} to={today} color={color} chart="area" domain={[1, 5]} empty={{ title: '', description: '' }} />
      ) : null}
      {get('screen-time')?.days.size ? (
        <MetricCard title="Screen time" data={get('screen-time')} from={from} to={today} color={color} chart="bars" empty={{ title: '', description: '' }} />
      ) : null}
      <div className="xl:col-span-2"><RoutinesCard user={user} category="mind" /></div>
    </div>
    </div>
  )
}
