import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, desc, eq } from 'drizzle-orm'
import { ArrowUpRight } from 'lucide-react'
import { db, schema } from '@/db'
import { CATEGORIES, type Category } from '@/db/schema'
import { getUser, type User } from '@/core/user'
import { trackerDays, transactionsBetween, isSpend } from '@/core/metrics'
import { addDays, formatDay, localDate } from '@/core/time'
import { fillDays } from '@/domain/series'
import { CATEGORY } from '@/ui/tokens'
import { Card, CardHeader, PageHeader, Skeleton } from '@/ui/components/card'
import { DailyBars, TrendArea } from '@/ui/components/charts'
import { buttonClass } from '@/ui/components/button'
import { LifeKpis, LifeKpisSkeleton } from '@/ui/components/life-kpis'
import { loadAdherence } from '@/ui/components/category/adherence-data'

export const metadata: Metadata = { title: 'Overview' }

// Overview is for looking back: streak, each area's direction, consistency and trends.

export default function OverviewPage() {
  return (
    <>
      <PageHeader eyebrow="Overview" title="How it’s going" description="The last few weeks across every area. Today’s to-dos live on Today." />
      <div className="flex flex-col gap-6">
        <Suspense fallback={<LifeKpisSkeleton />}><Kpis /></Suspense>
        <Suspense fallback={<Skeleton className="h-[260px] rounded-lg" />}><Consistency /></Suspense>
        <Suspense fallback={<div className="grid gap-6 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[250px] rounded-lg" />)}</div>}><Trends /></Suspense>
        <Suspense fallback={null}><LatestReview /></Suspense>
      </div>
    </>
  )
}

async function Kpis() {
  await connection()
  const user = await getUser()
  return <LifeKpis user={user} now={new Date()} />
}

const DAYS = 14

/** Share of scheduled routines done per area per day, last two weeks. */
async function Consistency() {
  await connection()
  const user = await getUser()
  const now = new Date()
  const today = localDate(now, user.timezone)
  const rows = await loadAdherence(user, { kinds: ['routine', 'medicine'] }, 60, DAYS, now)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - (DAYS - 1)))
  const grid = CATEGORIES.map((c) => {
    const mine = rows.filter((r) => r.schedule.category === c)
    return {
      c,
      cells: days.map((d) => {
        let due = 0, done = 0
        for (const r of mine) {
          const s = r.days.find((x) => x.date === d)?.status
          if (s === 'done') { due++; done++ } else if (s === 'partial' || s === 'missed') due++
        }
        return { d, due, done }
      }),
    }
  }).filter((r) => r.cells.some((x) => x.due))

  return (
    <Card>
      <CardHeader title="Consistency" description="Routines done each day, by area" action={<Link href="/habits" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Habits</Link>} />
      {grid.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-32" />
                {days.map((d) => (
                  <th key={d} scope="col" className={`text-center text-[11px] font-medium ${d === today ? 'text-ink' : 'text-ink-3'}`}>
                    {new Intl.DateTimeFormat('en', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))}
                  </th>
                ))}
                <th className="w-14" />
              </tr>
            </thead>
            <tbody>
              {grid.map(({ c, cells }) => {
                const due = cells.reduce((s, x) => s + x.due, 0)
                const done = cells.reduce((s, x) => s + x.done, 0)
                return (
                  <tr key={c}>
                    <th scope="row" className="pr-3 text-left text-[13px] font-medium text-ink-2">
                      <span className="flex items-center gap-2"><span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY[c].color }} />{CATEGORY[c].label}</span>
                    </th>
                    {cells.map((x) => <Cell key={x.d} c={c} {...x} />)}
                    <td className="pl-2 text-right text-[12px] text-ink-3 tabular-nums">{due ? `${Math.round((done / due) * 100)}%` : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">Add a routine on Habits and its days fill in here.</p>
      )}
    </Card>
  )
}

function Cell({ c, d, due, done }: { c: Category; d: string; due: number; done: number }) {
  const share = due ? done / due : 0
  const label = `${formatDay(d)}: ${due ? `${done} of ${due} done` : 'nothing scheduled'}`
  return (
    <td className="p-0">
      <div
        role="img"
        aria-label={label}
        title={label}
        className="h-7 rounded-[6px]"
        style={due
          ? { background: share ? `color-mix(in oklch, ${CATEGORY[c].color} ${Math.round(20 + share * 80)}%, transparent)` : 'var(--surface-2)', boxShadow: share ? undefined : 'inset 0 0 0 1px var(--hairline)' }
          : { background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
      />
    </td>
  )
}

async function Trends() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -27)
  const [data, txns] = await Promise.all([
    trackerDays(user, from, today, { slugs: ['sleep.hours', 'mood', 'github.commits'] }),
    transactionsBetween(user, from, today),
  ])
  const get = (slug: string) => data.find((d) => d.tracker.slug === slug)?.days ?? new Map<string, number>()
  const spend = new Map<string, number>()
  for (const t of txns) if (isSpend(t)) spend.set(t.localDate, (spend.get(t.localDate) ?? 0) - t.base)
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Trend title="Sleep" href="/health" cat="health"><TrendArea data={fillDays(get('sleep.hours'), from, today)} color={CATEGORY.health.color} unit="h" target={7.5} height={150} label="Sleep, last 28 days" /></Trend>
      <Trend title="Mood" href="/mind" cat="mind"><TrendArea data={fillDays(get('mood'), from, today)} color={CATEGORY.mind.color} domain={[1, 5]} height={150} label="Mood, last 28 days" /></Trend>
      <Trend title="Commits" href="/skills" cat="skills"><DailyBars data={fillDays(get('github.commits'), from, today)} color={CATEGORY.skills.color} height={150} label="Commits per day, last 28 days" /></Trend>
      <Trend title="Spending" href="/wealth/spending" cat="wealth"><DailyBars data={fillDays(spend, from, today, 0)} color={CATEGORY.wealth.color} unit="₹" height={150} label="Spending per day, last 28 days" /></Trend>
    </div>
  )
}

function Trend({ title, href, cat, children }: { title: string; href: string; cat: Category; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY[cat].color }} />{title}</span>}
        description="Last 28 days"
        action={<Link href={href} aria-label={`Open ${title}`} className={buttonClass({ variant: 'ghost', size: 'icon-sm' })}><ArrowUpRight className="size-4" strokeWidth={1.5} /></Link>}
      />
      {children}
    </Card>
  )
}

async function LatestReview() {
  await connection()
  const user: User = await getUser()
  const [review] = await db.select().from(schema.insights)
    .where(and(eq(schema.insights.userId, user.id), eq(schema.insights.kind, 'review')))
    .orderBy(desc(schema.insights.createdAt)).limit(1)
  if (!review) return null
  return (
    <Card>
      <CardHeader
        title="Latest weekly review"
        description={formatDay(localDate(review.createdAt, user.timezone))}
        action={<Link href="/insights" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Insights</Link>}
      />
      <h3 className="text-[15px] font-medium text-ink">{review.title}</h3>
      <p className="mt-1 max-w-[70ch] text-[14px] leading-relaxed text-ink-2">{review.body}</p>
    </Card>
  )
}
