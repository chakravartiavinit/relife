import { cache } from 'react'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { trackerDays } from '../metrics'
import { addDays, daysBetween } from '../time'
import type { User } from '../user'
import { fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { streaks } from '@/domain/streaks'
import type { AreaKpi } from './types'

export const hoursText = (min: number) => (min >= 60 ? `${formatNumber(min / 60, min < 600 ? 1 : 0)} h` : `${formatNumber(min)} min`)

const sumDays = (days: Map<string, number>, a: string, b: string) => { let s = 0; for (const [d, v] of days) if (d >= a && d <= b) s += v; return s }

/** Hobbies are the practice-minute trackers; `chess.games`, `chess.rating-lichess` and the like belong to one by slug prefix. One read per request. */
export const loadHobbies = cache(async (user: User, today: string) => {
  const from = addDays(today, -364)
  const [tracked, shows] = await Promise.all([
    trackerDays(user, from, today, { category: 'hobbies' }),
    db.select().from(schema.learningItems).where(and(eq(schema.learningItems.userId, user.id), eq(schema.learningItems.kind, 'show')))
      .orderBy(desc(schema.learningItems.lastActiveAt)),
  ])
  const hobbies = tracked.filter((h) => h.tracker.unit === 'min')
  const statsOf = (slug: string) => tracked.filter((h) => h.tracker.slug.startsWith(`${slug}.`))
  const week = addDays(today, -6), prevWeek = addDays(today, -13)
  const cards = hobbies.map(({ tracker: t, days }) => {
    const thisWeek = sumDays(days, week, today)
    const lastWeek = sumDays(days, prevWeek, addDays(today, -7))
    const total = sumDays(days, from, today)
    const practised = [...days].filter(([, v]) => v > 0).map(([d]) => d)
    const last = practised.sort().at(-1)
    const stats = statsOf(t.slug)
    const sum7 = (suffix: string) => { const s = stats.find((x) => x.tracker.slug === `${t.slug}.${suffix}`); return s ? sumDays(s.days, week, today) : null }
    const ratings = stats.filter((s) => s.tracker.aggregate === 'last' && s.days.size).map((s) => {
      const sorted = [...s.days].sort((a, b) => a[0].localeCompare(b[0]))
      const now = sorted.at(-1)![1]
      const before = sorted.filter(([d]) => d <= addDays(today, -30)).at(-1)?.[1] ?? sorted[0][1]
      return { name: s.tracker.name, value: now, change: now - before }
    })
    return {
      t, thisWeek, lastWeek, total, goal: t.target ? Math.round(t.target * 7) : null, games: sum7('games'), wins: sum7('wins'), ratings,
      streak: streaks(practised, today).current,
      last: last ? (last === today ? 'Today' : last === addDays(today, -1) ? 'Yesterday' : `${daysBetween(last, today)} days ago`) : 'Not yet',
      spark: fillDays(days, addDays(today, -27), today, 0),
    }
  }).sort((a, b) => b.thisWeek - a.thisWeek)
  const all = new Map<string, number>()
  for (const h of hobbies) for (const [d, v] of h.days) all.set(d, (all.get(d) ?? 0) + v)
  return { from, cards, shows, all }
})

export async function hobbiesKpis(user: User, today: string): Promise<AreaKpi[]> {
  const { cards } = await loadHobbies(user, today)
  if (!cards.length) return []
  const weekTotal = cards.reduce((s, c) => s + c.thisWeek, 0)
  const lastTotal = cards.reduce((s, c) => s + c.lastWeek, 0)
  const diff = weekTotal - lastTotal
  const active = cards.filter((c) => c.thisWeek > 0).length
  const bestStreak = Math.max(0, ...cards.map((c) => c.streak))
  return [
    { label: 'Practice, 7 days', value: hoursText(weekTotal), sub: lastTotal || weekTotal ? `${diff >= 0 ? '+' : '−'}${hoursText(Math.abs(diff))} vs last week` : undefined, tone: diff > 0 ? 'good' : diff < 0 ? 'bad' : undefined },
    { label: 'Hobbies practised', value: `${active} / ${cards.length}`, sub: 'this week' },
    { label: 'Longest streak now', value: bestStreak ? `${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}` : '–' },
    { label: 'Hours, last 12 months', value: hoursText(cards.reduce((s, c) => s + c.total, 0)) },
  ]
}
