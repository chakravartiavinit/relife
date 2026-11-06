import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, desc, eq } from 'drizzle-orm'
import { ArrowUpRight, CalendarClock, Flame, Moon, Plus, Sparkles, Sun, Sunrise, Sunset } from 'lucide-react'
import { db, schema } from '@/db'
import { CATEGORIES } from '@/db/schema'
import { getUser } from '@/core/user'
import { dayAgenda, upcomingPayments, type ScheduleMeta } from '@/core/schedules'
import { trackerDays } from '@/core/metrics'
import { formatDay, formatTime, localDate, localHour } from '@/core/time'
import { formatMoney } from '@/domain/money'
import { dueLabel } from '@/domain/wealth'
import { CATEGORY } from '@/ui/tokens'
import { OnboardingCompact, onboardingSteps } from '@/ui/components/onboarding'
import { Agenda, Goals, type AgendaRow, type GoalRow } from '@/ui/components/agenda'
import { Badge, Card, CardHeader, Skeleton } from '@/ui/components/card'
import { Capsule } from '@/ui/components/capsule'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { PetalBurst } from '@/ui/components/petals'
import { showUpStreak } from '@/ui/components/life-kpis'

// Today is for doing: what's left, what's due, one next setup step. Reviewing lives on /overview.

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <Today />
    </Suspense>
  )
}

const PHASE = (h: number) =>
  h < 5 ? { greet: 'Still up', Icon: Moon } : h < 12 ? { greet: 'Good morning', Icon: Sunrise }
    : h < 17 ? { greet: 'Good afternoon', Icon: Sun } : h < 21 ? { greet: 'Good evening', Icon: Sunset } : { greet: 'Good evening', Icon: Moon }

async function Today() {
  await connection()
  const user = await getUser()
  const now = new Date()
  const today = localDate(now, user.timezone)

  const [agenda, payments, trackers, insights, steps, streak] = await Promise.all([
    dayAgenda(user, today, now),
    upcomingPayments(user, now),
    trackerDays(user, today, today),
    db.select().from(schema.insights)
      .where(and(eq(schema.insights.userId, user.id), eq(schema.insights.status, 'pending')))
      .orderBy(desc(schema.insights.createdAt)).limit(3),
    onboardingSteps(user),
    showUpStreak(user, today),
  ])

  const valueOf = (slug: string) => trackers.find((t) => t.tracker.slug === slug)?.days.get(today)

  // Quantity routines (water) show once as a goal; everything else is a checkable row.
  const goals: GoalRow[] = []
  const rows: AgendaRow[] = []
  const catOf = new Map<string, (typeof CATEGORIES)[number]>()
  for (const i of agenda) {
    const s = i.schedule
    const meta = s.meta as ScheduleMeta
    if (['subscription', 'bill', 'renewal'].includes(s.kind)) continue
    catOf.set(s.id, s.category)
    if (meta.trackerSlug && s.target) {
      if (!goals.some((g) => g.scheduleId === s.id)) {
        goals.push({
          scheduleId: s.id, name: s.name, value: valueOf(meta.trackerSlug) ?? 0, target: s.target,
          unit: s.unit ?? '', step: meta.step ?? Math.max(1, Math.round(s.target / 8)), color: CATEGORY[s.category].color,
        })
      }
      continue
    }
    rows.push({
      key: `${s.id}|${i.occurrence.toISOString()}`,
      scheduleId: s.id,
      occurrence: i.occurrence.toISOString(),
      time: formatTime(i.occurrence, user.timezone),
      name: s.name,
      kind: s.kind,
      color: CATEGORY[s.category].color,
      detail: s.kind === 'medicine'
        ? [meta.dose, typeof meta.stock === 'number' ? `${meta.stock} left` : null].filter(Boolean).join(' · ')
        : meta.notes,
      status: i.status,
    })
  }

  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, { done: 0, total: 0 }]))
  for (const r of rows) { const c = catOf.get(r.scheduleId)!; byCat[c].total++; if (r.status === 'done') byCat[c].done++ }
  for (const g of goals) { const c = catOf.get(g.scheduleId)!; byCat[c].total++; if (g.value >= g.target) byCat[c].done++ }
  const total = rows.length + goals.length
  const done = Object.values(byCat).reduce((s, c) => s + c.done, 0)
  const left = total - done
  const dueSoon = payments.filter((p) => p.daysLeft <= 7)

  const hour = localHour(now, user.timezone)
  const { greet, Icon } = PHASE(hour)
  const firstName = user.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pt-1">
        <div className="min-w-0">
          <div className="mb-3 inline-flex h-7 items-center gap-2 rounded-full bg-glass px-3 text-[12px] font-medium text-ink-2 shadow-1 backdrop-blur-md">
            <Icon className="size-3.5 text-pill-ink" strokeWidth={2} aria-hidden />
            {formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <h1 className="font-display text-[32px] leading-[1.05] font-extrabold tracking-[-0.035em] text-ink sm:text-[38px]">{greet}, {firstName}.</h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {!total ? 'Nothing planned yet. Add one small routine to start.' : left ? `${left} left today, ${done} done.` : 'Everything for today is done.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {total ? (
            <div className="w-44 rounded-lg bg-surface px-4 py-3 shadow-1">
              <div className="flex items-baseline justify-between text-[12px] text-ink-3">
                <span>Today</span>
                <span className="tabular-nums"><span className="font-semibold text-ink">{done}</span> / {total}</span>
              </div>
              <Capsule value={done} max={total} size="sm" color="var(--pill)" label="Done today" className="mt-2" />
            </div>
          ) : null}
          <Link
            href="/overview"
            className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3 shadow-1 transition-[box-shadow] duration-150 hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
          >
            <span aria-hidden className={streak.current ? 'text-pill-ink' : 'text-ink-3'}><Flame className="size-5" strokeWidth={2} /></span>
            <span>
              <span className="block font-display text-[20px] leading-none font-bold text-ink tabular-nums">{streak.current}<span className="ml-1 font-sans text-[12px] font-medium text-ink-3">{streak.current === 1 ? 'day' : 'days'}</span></span>
              <span className="mt-1 block text-[12px] text-ink-3">{streak.doneToday ? 'Streak kept today' : streak.current ? 'Keep your streak' : 'Start a streak'}</span>
            </span>
          </Link>
        </div>
      </header>

      {CATEGORIES.some((c) => byCat[c].total) ? (
        <ul aria-label="Today by area" className="-mt-3 flex flex-wrap gap-2">
          {CATEGORIES.filter((c) => byCat[c].total).map((c) => (
            <li key={c} className="flex h-8 items-center gap-2 rounded-full bg-surface px-3 text-[13px] text-ink-2 shadow-1">
              <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY[c].color }} />
              {CATEGORY[c].label}
              <span className="text-ink-3 tabular-nums">{byCat[c].done}/{byCat[c].total}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <PetalBurst complete={total > 0 && done === total} day={today} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-6">
          <CardHeader
            title="Today’s plan"
            description={total ? `${rows.length} routine${rows.length === 1 ? '' : 's'}${goals.length ? ` and ${goals.length} goal${goals.length === 1 ? '' : 's'}` : ''}` : undefined}
            action={<Link href="/habits?new=1" className={buttonClass({ variant: 'ghost', size: 'sm' })}><Plus className="size-4" strokeWidth={2} />Add</Link>}
          />
          {goals.length ? (
            <div className="mb-5 border-b border-divider pb-5"><Goals rows={goals} /></div>
          ) : null}
          {rows.length ? (
            <Agenda rows={rows} />
          ) : !goals.length ? (
            <EmptyState
              title="Nothing scheduled today"
              description="Add routines like skincare or medicines and they’ll show up here, with reminders on Telegram."
              action={<Link href="/habits?new=1" className={buttonClass({ variant: 'primary' })}>Add a routine</Link>}
            />
          ) : null}
        </Card>

        <aside className="flex flex-col gap-6" aria-label="Also today">
          {steps.some((s) => !s.done) ? <OnboardingCompact steps={steps} /> : null}

          <Card>
            <CardHeader
              title="Due soon"
              icon={<CalendarClock strokeWidth={2} />}
              color="var(--cat-wealth)"
              action={<Link href="/wealth/subscriptions" className={buttonClass({ variant: 'ghost', size: 'sm' })}>All</Link>}
            />
            {dueSoon.length ? (
              <ul className="flex flex-col gap-3">
                {dueSoon.map((p) => (
                  <li key={p.schedule.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink">{p.schedule.name}</div>
                      <div className="text-[12px] text-ink-3">{dueLabel(p.daysLeft)}</div>
                    </div>
                    {p.daysLeft <= 1 ? <Badge color="var(--warn)">Soon</Badge> : null}
                    {p.amount ? <span className="text-sm font-medium text-ink tabular-nums">{formatMoney(p.amount, p.currency ?? user.baseCurrency)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">Nothing due in the next 7 days.</p>
            )}
          </Card>

          {insights.length ? (
            <Card>
              <CardHeader title="Suggestions" icon={<Sparkles strokeWidth={2} />} color="var(--pill)" action={<Link href="/insights" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Review</Link>} />
              <ul className="flex flex-col gap-3">
                {insights.map((i) => (
                  <li key={i.id}>
                    <Link href="/insights" className="group flex items-start gap-3 rounded-md">
                      <span className="min-w-0 flex-1 text-sm text-ink group-hover:underline">{i.title}</span>
                      <ArrowUpRight className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <p className="px-1 text-[12px] leading-relaxed text-ink-3">
            Press <Badge>⌘K</Badge> to log anything: “water 250”, “mood 4”, “spent 120 chai”.
          </p>
        </aside>
      </div>
    </div>
  )
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="flex items-end justify-between">
        <div><Skeleton className="h-7 w-48 rounded-full" /><Skeleton className="mt-3 h-10 w-80" /><Skeleton className="mt-3 h-5 w-56" /></div>
        <Skeleton className="hidden h-16 w-80 rounded-lg sm:block" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[420px] rounded-lg" />
        <div className="flex flex-col gap-6"><Skeleton className="h-[180px] rounded-lg" /><Skeleton className="h-[160px] rounded-lg" /></div>
      </div>
    </div>
  )
}
