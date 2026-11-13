import { cache } from 'react'
import { activitySummary } from '../activity'
import { addDays } from '../time'
import type { User } from '../user'
import type { ActivityKind } from '@/domain/activity'
import type { AreaKpi } from './types'

/** Focus and distraction, as the Today page and the System count them. */
export const FOCUS: ActivityKind[] = ['learning', 'work']
export const DISTRACT: ActivityKind[] = ['social', 'entertainment']
export const DISTRACT_CAP = 90 * 60 // social 30 min + entertainment 60 min

export const hmSeconds = (seconds: number) => {
  const m = Math.round(seconds / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

const sum = (m: Map<ActivityKind, number>, ks: ActivityKind[]) => ks.reduce((a, k) => a + (m.get(k) ?? 0), 0)

/** The last 7 days of laptop time with today's numbers worked out. One read per request. */
export const loadTime = cache(async (user: User, today: string) => {
  const from = addDays(today, -6)
  const s = await activitySummary(user, from, today)
  const todayKinds = s.byDay.get(today) ?? new Map<ActivityKind, number>()
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const todayTotal = [...todayKinds.values()].reduce((a, b) => a + b, 0)
  // Averages over the days that have any tracking, so a new install doesn't divide by 7.
  const tracked = days.filter((d) => s.byDay.has(d)).length || 1
  return {
    s, from, days, todayKinds, todayTotal, tracked,
    focusToday: sum(todayKinds, FOCUS), distractToday: sum(todayKinds, DISTRACT),
    focusAvg: days.reduce((a, d) => a + sum(s.byDay.get(d) ?? new Map(), FOCUS), 0) / tracked,
  }
})

/** Today, focus, distraction and the place most time went to. None until the extension has recorded something. */
export async function timeKpis(user: User, today: string): Promise<AreaKpi[]> {
  const t = await loadTime(user, today)
  if (!t.s.rows) return []
  const top = t.s.places[0]
  return [
    { label: 'Today', value: hmSeconds(t.todayTotal), sub: `${hmSeconds(t.s.total / t.tracked)} a day this week` },
    { label: 'Focus today', value: hmSeconds(t.focusToday), sub: `Learning and deep work · ${hmSeconds(t.focusAvg)} a day on average`, tone: t.focusToday > 0 && t.focusToday >= t.focusAvg ? 'good' : undefined },
    { label: 'Distraction today', value: hmSeconds(t.distractToday), sub: `Social and entertainment · cap ${hmSeconds(DISTRACT_CAP)}`, tone: t.distractToday > DISTRACT_CAP ? 'bad' : undefined },
    { label: 'Most time on', value: top?.name ?? '–', sub: top ? `${hmSeconds(top.seconds)} this week` : undefined },
  ]
}
