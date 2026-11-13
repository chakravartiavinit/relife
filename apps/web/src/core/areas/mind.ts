import { trackerDays } from '../metrics'
import { addDays } from '../time'
import type { User } from '../user'
import { average, fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import type { AreaKpi } from './types'

/** Mood, energy and screen time (7-day averages) and the minutes meditated this week. */
export async function mindKpis(user: User, today: string): Promise<AreaKpi[]> {
  const data = await trackerDays(user, addDays(today, -6), today, { slugs: ['mood', 'energy', 'screen-time', 'meditation'] })
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)
  const last7 = (slug: string) => fillDays(get(slug)?.days ?? new Map(), addDays(today, -6), today).map((p) => p.value)
  const mood = average(last7('mood')), energy = average(last7('energy')), screen = average(last7('screen-time'))
  const meditation = last7('meditation').reduce<number>((s, v) => s + (v ?? 0), 0)
  const fmt1 = (v: number | null, suffix = '') => (v == null ? '–' : `${formatNumber(v, 1)}${suffix}`)
  return [
    { label: 'Mood, 7-day avg', value: fmt1(mood, ' / 5'), sub: get('mood')?.days.get(today) != null ? `Today ${get('mood')!.days.get(today)}` : 'Not logged today', peek: { type: 'metric', id: 'mood' } },
    { label: 'Energy, 7-day avg', value: fmt1(energy, ' / 5'), peek: { type: 'metric', id: 'energy' } },
    { label: 'Screen time, 7-day avg', value: fmt1(screen, 'h'), sub: get('screen-time')?.tracker.target ? `Aim under ${formatNumber(get('screen-time')!.tracker.target!, 1)}h` : undefined, peek: { type: 'metric', id: 'screen-time' } },
    { label: 'Meditation, 7 days', value: meditation ? `${formatNumber(meditation)} min` : '–', peek: { type: 'metric', id: 'meditation' } },
  ]
}
