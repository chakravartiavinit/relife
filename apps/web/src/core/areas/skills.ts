import { cache } from 'react'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { trackerDays } from '../metrics'
import { addDays } from '../time'
import type { User } from '../user'
import { formatNumber } from '@/domain/money'
import { streaks } from '@/domain/streaks'
import type { AreaKpi } from './types'

type Days = Map<string, number>

export const sumLast = (m: Days, today: string, n: number) => {
  const since = addDays(today, -(n - 1))
  let s = 0
  for (const [d, v] of m) if (d >= since) s += v
  return s
}
export const addUp = (...ms: Days[]) => { const out: Days = new Map(); for (const m of ms) for (const [d, v] of m) out.set(d, (out.get(d) ?? 0) + v); return out }
export const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m` : `${Math.round(min)}m`)

/** Everything the Skills overview and its headline numbers read: practice streams, judges' ratings, the library. One read per request. */
export const loadSkills = cache(async (user: User, today: string) => {
  const [items, skillTrackers] = await Promise.all([
    db.select().from(schema.learningItems).where(eq(schema.learningItems.userId, user.id)).orderBy(desc(schema.learningItems.updatedAt)),
    trackerDays(user, addDays(today, -89), today, { category: 'skills' }),
  ])
  const byslug = (slug: string): Days => skillTrackers.find((t) => t.tracker.slug === slug)?.days ?? new Map()
  // Competitive programming: problems solved across sites, and each site's rating with its 30-day change.
  const solved = byslug('cp.solved')
  const cpActive = [...solved].filter(([d, v]) => v > 0 && d >= addDays(today, -27)).length
  const cpSites = skillTrackers.filter((t) => t.tracker.slug.startsWith('cp.rating-') && t.days.size).map((t) => {
    const sorted = [...t.days].sort((a, b) => a[0].localeCompare(b[0]))
    const now = sorted.at(-1)![1]
    const before = sorted.filter(([d]) => d <= addDays(today, -30)).at(-1)?.[1] ?? sorted[0][1]
    return { name: t.tracker.name.replace(/ rating$/, ''), value: now, change: now - before }
  })
  const commits = byslug('github.commits')
  const coding = addUp(commits, byslug('github.prs'), byslug('github.reviews'))
  const learningMin = byslug('learning.minutes'), workMin = byslug('screen.work')
  const codeMin = byslug('coding.minutes'), langXp = byslug('duolingo.xp'), typeMin = byslug('typing.minutes')
  const practised = new Set([learningMin, workMin, coding, solved, codeMin, langXp, typeMin].flatMap((m) => [...m].filter(([, v]) => v > 0).map(([d]) => d)))
  return {
    items, byslug, solved, cpActive, cpSites, commits, coding, learningMin, workMin, codeMin, langXp, typeMin,
    streak: streaks([...practised], today),
    practisedDays28: [...practised].filter((d) => d >= addDays(today, -27)).length,
    /** Courses, books and video series (time on them counts as learning). Shows live on Hobbies. */
    learning: items.filter((i) => i.kind !== 'show' && i.status !== 'done'),
    finished: items.filter((i) => i.kind !== 'show' && i.status === 'done'),
  }
})

export async function skillsKpis(user: User, today: string): Promise<AreaKpi[]> {
  const s = await loadSkills(user, today)
  return [
    { label: 'Days practised, 28 days', value: `${s.practisedDays28}/28`, sub: s.streak.current ? `${s.streak.current}-day streak` : 'Start a streak today' },
    { label: 'Learning, 28 days', value: hm(sumLast(s.learningMin, today, 28)), sub: `${s.learning.length} in progress`, peek: { type: 'metric', id: 'learning.minutes' } },
    { label: 'Coding, 28 days', value: formatNumber(sumLast(s.coding, today, 28)), sub: `${formatNumber(sumLast(s.commits, today, 7))} commits this week`, peek: { type: 'metric', id: 'github.commits' } },
    { label: 'Problems solved, 28 days', value: formatNumber(sumLast(s.solved, today, 28)), sub: s.cpActive ? `${s.cpActive} active days` : s.cpSites.length ? 'None this month yet' : 'Connect a judge in You › Connections', peek: { type: 'metric', id: 'cp.solved' } },
  ]
}
