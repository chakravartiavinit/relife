import type { Metadata } from 'next'
import { Activity, Code, GitCommitHorizontal, GraduationCap, Keyboard, Languages, Laptop, Cable, MonitorSmartphone, Terminal } from 'lucide-react'
import { AreaHeader } from '@/ui/components/area-header'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { trackerDays } from '@/core/metrics'
import { addDays, localDate } from '@/core/time'
import { formatNumber } from '@/domain/money'
import { Card, CardHeader, KpiStrip } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { BrandLogo } from '@/ui/components/brand-logo'
import { TrainingLog, type Stream } from '@/ui/components/training-log'
import { streaks } from '@/domain/streaks'
import { env } from '@/core/env'
import { LibraryGrid } from '@/ui/components/library'
import { buttonClass } from '@/ui/components/button'
import { RoutinesCard } from '@/ui/components/category/routines-card'
import { CategorySkeleton } from '@/ui/components/category/skeleton'
import { NewLearningButton } from '@/ui/components/forms/learning-forms'

export const metadata: Metadata = { title: 'Skills' }

export default function SkillsPage() {
  return (
    <div>
      <AreaHeader area="skills" title="Code & learning" description="Code you ship and courses you take, with the hours each one gets." />
      <Suspense fallback={<CategorySkeleton />}>
        <Skills />
      </Suspense>
    </div>
  )
}

async function Skills() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -89)
  const [data, items, skillTrackers] = await Promise.all([
    trackerDays(user, from, today, { slugs: ['github.commits', 'github.prs', 'github.reviews', 'learning.minutes'] }),
    db.select().from(schema.learningItems).where(eq(schema.learningItems.userId, user.id))
      .orderBy(desc(schema.learningItems.updatedAt)),
    trackerDays(user, from, today, { category: 'skills' }),
  ])
  // Competitive programming: problems solved across sites, and each site's rating with its 30-day change.
  const solved = skillTrackers.find((t) => t.tracker.slug === 'cp.solved')?.days ?? new Map<string, number>()
  const cpActive = [...solved].filter(([d, v]) => v > 0 && d >= addDays(today, -27)).length
  const cpSites = skillTrackers.filter((t) => t.tracker.slug.startsWith('cp.rating-') && t.days.size).map((t) => {
    const sorted = [...t.days].sort((a, b) => a[0].localeCompare(b[0]))
    const now = sorted.at(-1)![1]
    const before = sorted.filter(([d]) => d <= addDays(today, -30)).at(-1)?.[1] ?? sorted[0][1]
    return { name: t.tracker.name.replace(/ rating$/, ''), value: now, change: now - before }
  })
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)?.days ?? new Map<string, number>()
  const sumLast = (m: Map<string, number>, n: number) => {
    const since = addDays(today, -(n - 1))
    let s = 0
    for (const [d, v] of m) if (d >= since) s += v
    return s
  }
  const commits = get('github.commits')
  // Courses, books and video series (time on them counts as learning). Shows live on Hobbies.
  const learningKinds = items.filter((i) => i.kind !== 'show')
  const learning = learningKinds.filter((i) => i.status !== 'done')
  const done = learningKinds.filter((i) => i.status === 'done')

  // Training log streams: one row per way of practising. Coding counts commits, PRs and reviews together.
  const byslug = (slug: string) => skillTrackers.find((t) => t.tracker.slug === slug)?.days ?? new Map<string, number>()
  const addUp = (...ms: Map<string, number>[]) => { const out = new Map<string, number>(); for (const m of ms) for (const [d, v] of m) out.set(d, (out.get(d) ?? 0) + v); return out }
  const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m` : `${Math.round(min)}m`)
  const coding = addUp(byslug('github.commits'), byslug('github.prs'), byslug('github.reviews'))
  const learningMin = byslug('learning.minutes'), workMin = byslug('screen.work')
  // Row totals cover the same 8 weeks the training log draws.
  const LOG_WEEKS = 8, LOG_DAYS = LOG_WEEKS * 7
  const streams: Stream[] = [
    { key: 'learning', label: 'Learning', icon: GraduationCap, color: 'var(--cat-skills)', unit: 'min', days: learningMin, total: hm(sumLast(learningMin, LOG_DAYS)) },
    { key: 'work', label: 'Deep work', icon: Laptop, color: 'var(--pill)', unit: 'min', days: workMin, total: hm(sumLast(workMin, LOG_DAYS)) },
    { key: 'coding', label: 'Coding', icon: GitCommitHorizontal, color: 'var(--cat-mind)', unit: 'contributions', days: coding, total: `${formatNumber(sumLast(coding, LOG_DAYS))} contributions` },
    { key: 'problems', label: 'Problems', icon: Terminal, color: 'var(--cat-hobbies)', unit: 'solved', days: solved, total: `${formatNumber(sumLast(solved, LOG_DAYS))} solved` },
  ]
  // Rows from connectors that only some people use (WakaTime, Duolingo, Monkeytype): shown once they have data.
  const codeMin = byslug('coding.minutes'), langXp = byslug('duolingo.xp'), typeMin = byslug('typing.minutes')
  if (codeMin.size) streams.push({ key: 'codetime', label: 'Coding time', icon: Code, color: 'var(--cat-mind)', unit: 'min', days: codeMin, total: hm(sumLast(codeMin, LOG_DAYS)) })
  if (langXp.size) streams.push({ key: 'language', label: 'Languages', icon: Languages, color: 'var(--cat-relationships)', unit: 'XP', days: langXp, total: `${formatNumber(sumLast(langXp, LOG_DAYS))} XP` })
  if (typeMin.size) streams.push({ key: 'typing', label: 'Typing', icon: Keyboard, color: 'var(--cat-wealth)', unit: 'min', days: typeMin, total: hm(sumLast(typeMin, LOG_DAYS)) })
  const practised = new Set(streams.flatMap((st) => [...st.days].filter(([, v]) => v > 0).map(([d]) => d)))
  const streak = streaks([...practised], today)
  const practisedDays28 = [...practised].filter((d) => d >= addDays(today, -27)).length
  const wpm = [...byslug('typing.wpm')].sort(([a], [b]) => a.localeCompare(b)).at(-1)?.[1]
  const rating = (site: string) => cpSites.find((c) => c.name.toLowerCase() === site.toLowerCase())
  const sources = [
    { name: 'GitHub', logo: 'GitHub', connected: !!env('GITHUB_TOKEN') || commits.size > 0, value: formatNumber(sumLast(coding, 28)), change: undefined as number | undefined, sub: 'contributions, 28 days' },
    ...(['Codeforces', 'CodeChef', 'AtCoder', 'LeetCode'] as const).map((site) => {
      const r = rating(site)
      const key = site === 'LeetCode' ? 'LEETCODE_USERNAME' : `${site.toUpperCase()}_HANDLE`
      return { name: `${site} rating`, logo: site, connected: !!r || !!env(key), value: r ? formatNumber(r.value) : '–', change: r?.change, sub: '' }
    }),
    { name: 'WakaTime', logo: 'WakaTime', connected: !!env('WAKATIME_API_KEY') || codeMin.size > 0, value: hm(sumLast(codeMin, 7)), change: undefined, sub: 'coding, 7 days' },
    { name: 'Duolingo', logo: 'Duolingo', connected: !!env('DUOLINGO_USERNAME') || langXp.size > 0, value: formatNumber(sumLast(langXp, 7)), change: undefined, sub: 'XP, 7 days' },
    { name: 'Monkeytype', logo: 'Monkeytype', connected: !!env('MONKEYTYPE_APE_KEY') || typeMin.size > 0, value: wpm == null ? '–' : formatNumber(wpm, 0), change: undefined, sub: 'wpm, latest' },
    { name: 'Laptop activity', logo: '', connected: !!env('ACTIVITY_TOKEN'), value: hm(sumLast(learningMin, 7) + sumLast(workMin, 7)), change: undefined, sub: 'learning + deep work, 7 days' },
  ]
  return (
    <div className="flex flex-col gap-6">
      <KpiStrip items={[
        { label: 'Days practised, 28 days', value: `${practisedDays28}/28`, sub: streak.current ? `${streak.current}-day streak` : 'Start a streak today' },
        { label: 'Learning, 28 days', value: hm(sumLast(learningMin, 28)), sub: `${learning.length} in progress`, peek: { type: 'metric', id: 'learning.minutes' } },
        { label: 'Coding, 28 days', value: formatNumber(sumLast(coding, 28)), sub: `${formatNumber(sumLast(commits, 7))} commits this week`, peek: { type: 'metric', id: 'github.commits' } },
        { label: 'Problems solved, 28 days', value: formatNumber(sumLast(solved, 28)), sub: cpActive ? `${cpActive} active days` : cpSites.length ? 'None this month yet' : 'Connect a judge in You › Connections' },
      ]} />
      <Card>
        <CardHeader title="Training log" icon={<Activity strokeWidth={2} />} color="var(--cat-skills)" description={`Every way you practise on one timeline, ${LOG_WEEKS} weeks. Taller means more, compared with that row’s busiest day.`} />
        <TrainingLog streams={streams} today={today} weeks={LOG_WEEKS} streak={streak} />
      </Card>

      <Card>
        <CardHeader title="Sources" icon={<Cable strokeWidth={2} />} color="var(--cat-skills)" description="Where the training log comes from" action={<Link href="/you/connections" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Connections</Link>} />
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sources.map((src) => (
            <li key={src.name} className="flex items-center gap-3 rounded-[14px] bg-surface-2 p-3">
              {src.logo ? <BrandLogo name={src.logo} size="md" /> : (
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[color-mix(in_oklch,var(--pill)_16%,transparent)] text-pill-ink">
                  <MonitorSmartphone className="size-[22px]" strokeWidth={1.75} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink-3">{src.name}</span>
                {src.connected ? (
                  <span className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                    <span className="shrink-0 font-display text-[19px] leading-tight font-bold whitespace-nowrap text-ink">{src.value}</span>
                    {src.change ? <span className={src.change > 0 ? 'text-[12px] font-medium text-good' : 'text-[12px] font-medium text-bad'}>{src.change > 0 ? '▲' : '▼'} {formatNumber(Math.abs(src.change))}</span> : null}
                    <span className="truncate text-[12px] text-ink-3">{src.sub}</span>
                  </span>
                ) : (
                  <Link href="/you/connections" className="text-[13px] font-medium text-pill-ink hover:underline">Connect</Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Learning" icon={<GraduationCap strokeWidth={2} />} color="var(--cat-skills)"
            description={`${formatNumber(sumLast(get('learning.minutes'), 28) / 60, 1)} h in the last 28 days`}
            action={<NewLearningButton />}
          />
          <LibraryGrid
            items={learning}
            empty={<EmptyState title="Nothing in progress" icon={GraduationCap} color={'var(--cat-skills)'} description="Add a course, a cohort or a book, or press Track this in the ReLife browser extension on any course page." />}
          />
          {done.length ? <p className="mt-4 text-[13px] text-ink-3">{done.length} finished</p> : null}
        </Card>
        <RoutinesCard user={user} category="skills" />
      </div>
    </div>
  )
}
