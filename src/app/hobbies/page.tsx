import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import Link from 'next/link'
import { ChartColumn, Flame, Hourglass, Tv } from 'lucide-react'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { LibraryGrid } from '@/ui/components/library'
import { getUser } from '@/core/user'
import { trackerDays } from '@/core/metrics'
import { addDays, daysBetween, formatDay, localDate } from '@/core/time'
import { fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { streaks } from '@/domain/streaks'
import { CATEGORY } from '@/ui/tokens'
import { HobbyCollage, HobbyImage } from '@/ui/components/hobby-image'
import { BrandLogo } from '@/ui/components/brand-logo'
import { AreaHeader } from '@/ui/components/area-header'
import { Card, CardHeader, KpiStrip } from '@/ui/components/card'
import { Capsule } from '@/ui/components/capsule'
import { DailyBars, Sparkline } from '@/ui/components/charts'
import { EmptyState } from '@/ui/components/empty'
import { RoutinesCard } from '@/ui/components/category/routines-card'
import { CategorySkeleton } from '@/ui/components/category/skeleton'
import { AddHobbyButton, PracticeButtons } from '@/ui/components/hobbies'

export const metadata: Metadata = { title: 'Hobbies' }
const color = CATEGORY.hobbies.color

export default function HobbiesPage() {
  return (
    <div>
      <AreaHeader
        area="hobbies" title="Practice & play"
        description="The things you do for joy: music, art, games, cooking. Log practice minutes and watch the hours add up."
        actions={<AddHobbyButton />}
      />
      <Suspense fallback={<CategorySkeleton />}>
        <Hobbies />
      </Suspense>
    </div>
  )
}

const hours = (min: number) => (min >= 60 ? `${formatNumber(min / 60, min < 600 ? 1 : 0)} h` : `${formatNumber(min)} min`)

async function Hobbies() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -364)
  const [tracked, shows] = await Promise.all([
    trackerDays(user, from, today, { category: 'hobbies' }),
    db.select().from(schema.learningItems).where(and(eq(schema.learningItems.userId, user.id), eq(schema.learningItems.kind, 'show')))
      .orderBy(desc(schema.learningItems.lastActiveAt)),
  ])
  // Shows and anime you track from the browser extension.
  const watching = shows.length ? (
    <Card>
      <CardHeader title="Watching" icon={<Tv strokeWidth={2} />} color="var(--cat-health)" description="Shows and anime you track with the ReLife extension. Time on them counts as entertainment." />
      <LibraryGrid items={shows} />
    </Card>
  ) : null
  // Hobbies are the practice-minute trackers; chess.games, chess.rating-lichess and the like are stats
  // that belong to a hobby by slug prefix and show on its card.
  const hobbies = tracked.filter((h) => h.tracker.unit === 'min')
  const statsOf = (slug: string) => tracked.filter((h) => h.tracker.slug.startsWith(`${slug}.`))

  if (!hobbies.length) {
    return (
      <div className="flex flex-col gap-6">
      <Card>
        <EmptyState
          art={<HobbyCollage />}
          title="No hobbies yet"
          description="Add one you want to get better at, like guitar, drawing or chess. Log practice in a tap, or type “guitar 30” in Telegram."
          action={<AddHobbyButton />}
        />
      </Card>
      {watching}
      </div>
    )
  }

  const sumDays = (days: Map<string, number>, a: string, b: string) => { let s = 0; for (const [d, v] of days) if (d >= a && d <= b) s += v; return s }
  const week = addDays(today, -6), prevWeek = addDays(today, -13)
  const cards = hobbies.map(({ tracker: t, days }) => {
    const thisWeek = sumDays(days, week, today)
    const lastWeek = sumDays(days, prevWeek, addDays(today, -7))
    const total = sumDays(days, from, today)
    const practised = [...days].filter(([, v]) => v > 0).map(([d]) => d)
    const last = practised.sort().at(-1)
    const stats = statsOf(t.slug)
    const sum7 = (suffix: string) => { const s = stats.find((x) => x.tracker.slug === `${t.slug}.${suffix}`); return s ? sumDays(s.days, week, today) : null }
    const games = sum7('games'), wins = sum7('wins')
    const ratings = stats.filter((s) => s.tracker.aggregate === 'last' && s.days.size).map((s) => {
      const sorted = [...s.days].sort((a, b) => a[0].localeCompare(b[0]))
      const now = sorted.at(-1)![1]
      const before = sorted.filter(([d]) => d <= addDays(today, -30)).at(-1)?.[1] ?? sorted[0][1]
      return { name: s.tracker.name, value: now, change: now - before }
    })
    return {
      t, thisWeek, lastWeek, total, goal: t.target ? Math.round(t.target * 7) : null, games, wins, ratings,
      streak: streaks(practised, today).current,
      last: last ? (last === today ? 'Today' : last === addDays(today, -1) ? 'Yesterday' : `${daysBetween(last, today)} days ago`) : 'Not yet',
      spark: fillDays(days, addDays(today, -27), today, 0),
    }
  }).sort((a, b) => b.thisWeek - a.thisWeek)

  const all = new Map<string, number>()
  for (const h of hobbies) for (const [d, v] of h.days) all.set(d, (all.get(d) ?? 0) + v)
  const weekTotal = cards.reduce((s, c) => s + c.thisWeek, 0)
  const lastTotal = cards.reduce((s, c) => s + c.lastWeek, 0)
  const diff = weekTotal - lastTotal
  const active = cards.filter((c) => c.thisWeek > 0).length
  const bestStreak = Math.max(0, ...cards.map((c) => c.streak))

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip items={[
        { label: 'Practice, 7 days', value: hours(weekTotal), sub: lastTotal || weekTotal ? `${diff >= 0 ? '+' : '−'}${hours(Math.abs(diff))} vs last week` : undefined, tone: diff > 0 ? 'good' : diff < 0 ? 'bad' : undefined },
        { label: 'Hobbies practised', value: `${active} / ${cards.length}`, sub: 'this week' },
        { label: 'Longest streak now', value: bestStreak ? `${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}` : '–' },
        { label: 'Hours, last 12 months', value: hours(cards.reduce((s, c) => s + c.total, 0)) },
      ]} />

      <Card>
        <CardHeader title="Practice, last 4 weeks" icon={<ChartColumn strokeWidth={2} />} color="var(--cat-hobbies)" description="Minutes a day across every hobby." />
        <DailyBars data={fillDays(all, addDays(today, -27), today, 0)} color={color} unit="min" label="Practice minutes per day" />
      </Card>

      <section aria-label="Your hobbies" className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {cards.map((c) => {
          return (
            <Card key={c.t.id} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <HobbyImage name={c.t.name} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">
                    <Link href={`/routines/trackers/${c.t.slug}`} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">{c.t.name}</Link>
                  </h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3 tabular-nums">
                    <span className="inline-flex items-center gap-1"><Flame className="size-3.5" strokeWidth={1.5} aria-hidden style={{ color: c.streak ? 'var(--warn)' : undefined }} />{c.streak ? `${c.streak}-day streak` : 'No streak'}</span>
                    <span className="inline-flex items-center gap-1"><Hourglass className="size-3.5" strokeWidth={1.5} aria-hidden />{hours(c.total)} in total</span>
                    <span>Last: {c.last}</span>
                  </p>
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-[12.5px] tabular-nums">
                  <span className="font-medium text-ink">{hours(c.thisWeek)} this week</span>
                  <span className="text-ink-3">{c.goal ? `goal ${hours(c.goal)}` : 'no goal'}</span>
                </div>
                <Capsule value={c.thisWeek} max={c.goal ?? Math.max(c.thisWeek, 1)} color={color} label={`${c.t.name}: ${c.thisWeek} of ${c.goal ?? c.thisWeek} minutes this week`} />
              </div>
              {c.ratings.length || c.games != null ? (
                <ul className="flex flex-wrap gap-2" aria-label={`${c.t.name} stats`}>
                  {c.games != null ? (
                    <li className="flex h-9 items-center gap-2 rounded-[10px] bg-surface-2 px-2.5 text-[12.5px] tabular-nums">
                      <span className="font-semibold text-ink">{c.games}</span><span className="text-ink-3">games this week</span>
                      {c.games && c.wins != null ? <span className="font-medium text-good">· {Math.round((c.wins / c.games) * 100)}% won</span> : null}
                    </li>
                  ) : null}
                  {c.ratings.map((r) => (
                    <li key={r.name} className="flex h-9 items-center gap-2 rounded-[10px] bg-surface-2 ps-1 pe-2.5 text-[12.5px] tabular-nums">
                      <BrandLogo name={r.name} className="size-7 rounded-[7px]" />
                      <span className="font-semibold text-ink">{formatNumber(r.value)}</span>
                      {r.change ? <span className={r.change > 0 ? 'font-medium text-good' : 'font-medium text-bad'}>{r.change > 0 ? '▲' : '▼'} {formatNumber(Math.abs(r.change))}</span> : null}
                      <span className="text-ink-3">30 days</span>
                    </li>
                  ))}
                </ul>
              ) : /chess/i.test(c.t.name) ? (
                <p className="text-[12.5px] text-ink-3">
                  Play online? <Link href="/sources/browse" className="font-medium text-pill-ink hover:underline">Connect Lichess or Chess.com</Link> and your games, time and rating sync on their own.
                </p>
              ) : null}
              {c.spark.some((p) => (p.value ?? 0) > 0) ? <Sparkline data={c.spark} color={color} height={40} label={`${c.t.name}, minutes per day for 4 weeks`} /> : null}
              <PracticeButtons slug={c.t.slug} name={c.t.name} color={color} />
            </Card>
          )
        })}
      </section>

      {watching}
      <RoutinesCard user={user} category="hobbies" />
      <p className="px-1 text-[12.5px] text-ink-3">Tip: type “{cards[0].t.slug.replace(/-/g, ' ')} 30” in ⌘K or Telegram to log 30 minutes. Since {formatDay(from)}.</p>
    </div>
  )
}
