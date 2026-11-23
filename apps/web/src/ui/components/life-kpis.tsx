import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { ArrowDownRight, ArrowUpRight, Brain, Code, HeartPulse, Palette, Users, Wallet } from 'lucide-react'
import { db, schema } from '@/db'
import type { Category } from '@/db/schema'
import type { User } from '@/core/user'
import { activeDays, trackerDays, transactionsBetween, isSpend } from '@/core/metrics'
import { addDays, daysBetween, localDate } from '@/core/time'
import { streaks } from '@/domain/streaks'
import { average, fillDays } from '@/domain/series'
import { formatMoney, formatNumber } from '@/domain/money'
import { shiftMonth, monthRange } from '@/domain/wealth'
import { CATEGORY } from '../tokens'
import { Capsule } from './capsule'
import { IconChip } from './card'
import { ProgressBlock } from './progress-block'
import { Sparkline, type Point } from './charts'
import { Ticker } from './ticker'
import { cn } from '../cn'

// Progress's "This week, area by area": one cell per life area.
// Each tile compares the last 7 days with the 7 before, so the number reads as a direction, not a snapshot.

const ICON: Record<Category, React.ReactNode> = {
  health: <HeartPulse strokeWidth={2} />,
  mind: <Brain strokeWidth={2} />,
  skills: <Code strokeWidth={2} />,
  wealth: <Wallet strokeWidth={2} />,
  hobbies: <Palette strokeWidth={2} />,
  relationships: <Users strokeWidth={2} />,
}

type Delta = { text: string; up: boolean; good: boolean }
type Tile = {
  cat: Category
  href: string
  label: string
  value: React.ReactNode | null
  sub: string
  delta?: Delta
  spark?: Point[]
  ratio?: [number, number]
  /** The tile as a few plain words, for the phone fold's one line. */
  short?: string
}

const sum = (xs: Point[]) => xs.reduce((s, p) => s + (p.value ?? 0), 0)

function delta(now: number | null, before: number | null, fmt: (d: number) => string, higherIsGood = true): Delta | undefined {
  if (now == null || before == null) return undefined
  const d = now - before
  if (Math.abs(d) < 0.05) return undefined // would read as "0" after rounding
  return { text: fmt(d), up: d > 0, good: d > 0 === higherIsGood }
}

/** The daily "showed up" streak, shared by Today's header and the Overview tile. */
export async function showUpStreak(user: User, today: string) {
  const active = await activeDays(user, addDays(today, -400))
  return { ...streaks(active, today), doneToday: active.has(today), active }
}

export async function LifeKpis({ user, now }: { user: User; now: Date }) {
  const today = localDate(now, user.timezone)
  const from14 = addDays(today, -13)
  const week = (s: Point[]) => [s.slice(0, 7), s.slice(7)] as const
  const month = today.slice(0, 7)
  const lastMonthStart = `${shiftMonth(month, -1)}-01`
  const lastMonthEnd = monthRange(shiftMonth(month, -1))[1]
  const sameDay = `${shiftMonth(month, -1)}-${today.slice(8)}`
  const lastMonthSameDay = sameDay < lastMonthEnd ? sameDay : lastMonthEnd

  const [trackers, txns, people, active, hobbyTrackers] = await Promise.all([
    trackerDays(user, from14, today, { slugs: ['sleep.hours', 'steps', 'mood', 'github.commits'] }),
    transactionsBetween(user, from14 < lastMonthStart ? from14 : lastMonthStart, today),
    db.select().from(schema.people).where(eq(schema.people.userId, user.id)),
    activeDays(user, addDays(today, -400)),
    trackerDays(user, from14, today, { category: 'hobbies' }),
  ])
  const series = (slug: string) => {
    const t = trackers.find((x) => x.tracker.slug === slug)
    return t && t.days.size ? fillDays(t.days, from14, today) : null
  }

  // Health: sleep if tracked, else steps.
  const sleep = series('sleep.hours')
  const steps = series('steps')
  let health: Tile
  if (sleep) {
    const [prev, cur] = week(sleep)
    const a = average(cur.map((p) => p.value)), b = average(prev.map((p) => p.value))
    health = {
      cat: 'health', href: '/health', label: 'Sleep, 7-day avg', spark: sleep,
      value: a == null ? null : <Ticker value={a} decimals={1} suffix="h" />,
      sub: a == null ? 'No sleep logged this week' : `${cur.filter((p) => p.value != null).length} nights logged`,
      delta: delta(a, b, (d) => `${formatNumber(Math.abs(d), 1)}h`),
      short: a == null ? undefined : `Sleep ${formatNumber(a, 1)}h`,
    }
  } else if (steps) {
    const [prev, cur] = week(steps)
    const a = average(cur.map((p) => p.value)), b = average(prev.map((p) => p.value))
    health = {
      cat: 'health', href: '/health', label: 'Steps, 7-day avg', spark: steps,
      value: a == null ? null : <Ticker value={Math.round(a)} />, sub: 'per day',
      delta: delta(a, b, (d) => formatNumber(Math.abs(d))),
      short: a == null ? undefined : `${formatNumber(Math.round(a))} steps`,
    }
  } else {
    health = { cat: 'health', href: '/health', label: 'Sleep', value: null, sub: 'Send sleep from your iPhone or type “sleep 7”' }
  }

  // Mind: mood average.
  const mood = series('mood')
  let mind: Tile = { cat: 'mind', href: '/mind', label: 'Mood', value: null, sub: 'Rate your mood from 1 to 5 on the Mind page' }
  if (mood) {
    const [prev, cur] = week(mood)
    const a = average(cur.map((p) => p.value)), b = average(prev.map((p) => p.value))
    mind = {
      cat: 'mind', href: '/mind', label: 'Mood, 7-day avg', spark: mood,
      value: a == null ? null : <span><Ticker value={a} decimals={1} /><span className="text-ink-3">/5</span></span>,
      sub: a == null ? 'Not logged this week' : `${cur.filter((p) => p.value != null).length} days logged`,
      delta: delta(a, b, (d) => formatNumber(Math.abs(d), 1)),
      short: a == null ? undefined : `mood ${formatNumber(a, 1)}/5`,
    }
  }

  // Skills: commits this week.
  const commits = series('github.commits')
  let skills: Tile = { cat: 'skills', href: '/skills', label: 'Commits, 7 days', value: null, sub: 'Connect GitHub in You › Connections' }
  if (commits) {
    const [prev, cur] = week(commits)
    const a = sum(cur), b = sum(prev)
    skills = {
      cat: 'skills', href: '/skills', label: 'Commits, 7 days', spark: commits.map((p) => ({ ...p, value: p.value ?? 0 })),
      value: <Ticker value={a} />,
      sub: `${cur.filter((p) => (p.value ?? 0) > 0).length} of 7 days active`,
      delta: delta(a, b, (d) => formatNumber(Math.abs(d))),
      short: `${formatNumber(a)} commits`,
    }
  }

  // Wealth: month-to-date spend vs the same days last month. Lower is better.
  const spend = txns.filter(isSpend)
  const mtd = spend.filter((t) => t.localDate >= `${month}-01`).reduce((s, t) => s - t.base, 0)
  const lastMtd = spend.filter((t) => t.localDate >= lastMonthStart && t.localDate <= lastMonthSameDay).reduce((s, t) => s - t.base, 0)
  const perDay = new Map<string, number>()
  for (const t of spend) if (t.localDate >= from14) perDay.set(t.localDate, (perDay.get(t.localDate) ?? 0) - t.base)
  const pct = lastMtd > 0 ? Math.round(((mtd - lastMtd) / lastMtd) * 100) : null
  const wealth: Tile = txns.length
    ? {
      cat: 'wealth', href: '/wealth/spending', label: 'Spent this month', spark: fillDays(perDay, from14, today, 0),
      value: <Ticker value={mtd} currency={user.baseCurrency} compact={mtd >= 100_000} />,
      sub: lastMtd > 0 ? `${formatMoney(lastMtd, user.baseCurrency, { compact: true })} by now last month` : 'This month so far',
      delta: pct ? { text: `${Math.abs(pct)}%`, up: pct > 0, good: pct < 0 } : undefined,
      short: `spent ${formatMoney(mtd, user.baseCurrency, { compact: true })}`,
    }
    : { cat: 'wealth', href: '/wealth', label: 'Spent this month', value: null, sub: 'Connect an order app or type “spent 120 chai”' }

  // Relationships: people contacted within their rhythm.
  const tracked = people.filter((p) => p.contactEveryDays != null)
  const overdue = tracked.filter((p) => !p.lastContactedAt || daysBetween(localDate(p.lastContactedAt, user.timezone), today) > p.contactEveryDays!).length
  const relationships: Tile = tracked.length
    ? {
      cat: 'relationships', href: '/people', label: 'In touch', ratio: [tracked.length - overdue, tracked.length],
      value: <span>{tracked.length - overdue}<span className="text-ink-3">/{tracked.length}</span></span>,
      sub: overdue ? `${overdue} to reach out to` : 'Everyone’s in rhythm',
      short: `${tracked.length - overdue}/${tracked.length} in touch`,
    }
    : { cat: 'relationships', href: '/people', label: 'In touch', value: null, sub: 'Add people you want to stay close to' }

  // Hobbies: practice minutes this week, across every hobby.
  const practice = new Map<string, number>()
  const practiceTrackers = hobbyTrackers.filter((h) => h.tracker.unit === 'min')
  for (const h of practiceTrackers) for (const [d, v] of h.days) practice.set(d, (practice.get(d) ?? 0) + v)
  let hobbies: Tile = { cat: 'hobbies', href: '/hobbies', label: 'Practice, 7 days', value: null, sub: 'Add a hobby and log practice minutes' }
  if (practiceTrackers.length) {
    const s = fillDays(practice, from14, today, 0)
    const [prev, cur] = week(s)
    const a = sum(cur), b = sum(prev)
    hobbies = {
      cat: 'hobbies', href: '/hobbies', label: 'Practice, 7 days', spark: s,
      value: <span><Ticker value={a} /><span className="text-ink-3"> min</span></span>,
      sub: `${cur.filter((p) => (p.value ?? 0) > 0).length} of 7 days practised`,
      delta: delta(a, b, (d) => `${formatNumber(Math.abs(d))} min`),
      short: `${formatNumber(a)} min practised`,
    }
  }

  const tiles = [health, mind, skills, wealth, hobbies, relationships]
  const summary = tiles.flatMap((t) => (t.short ? [t.short] : [])).slice(0, 3).join(' · ')

  // The daily streak with this week's check-ins is on the character sheet: one streak on the page.
  return (
    <ProgressBlock title="This week, area by area" description="The last 7 days, and how they compare with the 7 before" summary={summary || 'Nothing logged yet'}>
      <ul className="-mx-5 -mb-5 mt-1 grid grid-cols-2 gap-px overflow-hidden rounded-b-lg border-t border-divider bg-divider grid-md:grid-cols-3 grid-lg:grid-cols-6">
        {tiles.map((t) => <li key={t.cat} className="flex min-w-0 *:flex-1"><KpiTile tile={t} /></li>)}
      </ul>
    </ProgressBlock>
  )
}

const TILE = 'bg-surface p-4 transition-[background-color] duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pill'

function DeltaBadge({ d }: { d: Delta }) {
  const Arrow = d.up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn('inline-flex h-5 items-center gap-0.5 rounded-full pr-1.5 pl-1 text-caption font-medium tabular-nums', d.good ? 'bg-good/12 text-good' : 'bg-bad/12 text-bad')}
      title="Compared with the period before"
    >
      <Arrow className="size-3" strokeWidth={2.5} aria-hidden />
      <span className="sr-only">{d.up ? 'Up' : 'Down'}</span>
      {d.text}
    </span>
  )
}

function KpiTile({ tile: t }: { tile: Tile }) {
  const { color, label: area } = CATEGORY[t.cat]
  // Child 1 of the grid is the streak, so an even last child means an odd tile count: stretch it on phones.
  return (
    <Link href={t.href} className={cn(TILE, 'group flex min-w-0 flex-col')}>
      <div className="flex items-center gap-2">
        <IconChip color={color} className="size-6 rounded-[7px] [&_svg]:size-3.5">{ICON[t.cat]}</IconChip>
        <span className="truncate text-caption font-medium text-ink">{area}</span>
      </div>
      <div className="mt-3 text-caption text-ink-3">{t.label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="num text-title leading-none text-ink">
          {t.value ?? <span className="text-ink-3">–</span>}
        </span>
        {t.delta ? <DeltaBadge d={t.delta} /> : null}
      </div>
      <div className={cn('mt-1.5 text-caption leading-snug', t.value == null ? 'text-ink-2' : 'text-ink-3')}>{t.sub}</div>
      <div className="mt-auto pt-3">
        {t.spark ? <Sparkline data={t.spark} color={color} height={28} label={`${area} ${t.label}, last 14 days`} />
          : t.ratio ? <div className="flex h-7 items-center"><Capsule value={t.ratio[0]} max={t.ratio[1]} color={color} size="sm" label={`${t.ratio[0]} of ${t.ratio[1]} in touch`} /></div>
            : <div aria-hidden className="flex h-7 items-end"><div className="w-full border-t border-dashed border-divider" /></div>}
      </div>
    </Link>
  )
}
