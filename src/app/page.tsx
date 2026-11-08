import Link from 'next/link'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { and, desc, eq } from 'drizzle-orm'
import { BellRing, CalendarClock, CalendarRange, ChevronRight, Lightbulb, Moon, Plus, ScrollText, Sparkles, Sun, Sunrise, Sunset, Target } from 'lucide-react'
import { db, schema } from '@/db'
import { CATEGORIES } from '@/db/schema'
import { getUser } from '@/core/user'
import { dayAgenda, upcomingPayments, type ScheduleMeta } from '@/core/schedules'
import { trackerDays } from '@/core/metrics'
import { addDays, daysBetween, formatDay, formatTime, localDate, localHour } from '@/core/time'
import { formatMoney } from '@/domain/money'
import { dueLabel } from '@/domain/wealth'
import { CATEGORY } from '@/ui/tokens'
import { OnboardingCompact, onboardingSteps } from '@/ui/components/onboarding'
import { Agenda, Goals, type AgendaRow, type GoalRow } from '@/ui/components/agenda'
import { Card, CardHeader, Skeleton } from '@/ui/components/card'
import { Capsule } from '@/ui/components/capsule'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { PetalBurst } from '@/ui/components/petals'
import { showUpStreak } from '@/ui/components/life-kpis'
import { CharacterBanner } from '@/ui/components/hud'
import { questBoard, type QuestView } from '@/core/quests'
import { systemBoard } from '@/core/system'
import { weekStart } from '@/domain/quests'
import { Quests, type QuestItem } from '@/ui/components/quests'
import { xpSummary } from '@/core/xp'

const INSIGHT = {
  nudge: { label: 'Nudge', icon: Lightbulb, color: 'var(--pill)' },
  plan: { label: 'Plan', icon: Target, color: 'var(--good)' },
  alert: { label: 'Alert', icon: BellRing, color: 'var(--warn)' },
  review: { label: 'Weekly review', icon: CalendarRange, color: 'var(--cat-mind)' },
} as const

// Today is for doing: what's left, what's due, one next setup step. Looking back lives on Progress (/profile).

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
  if (!user.profile.onboardedAt) redirect('/welcome')
  const now = new Date()
  const today = localDate(now, user.timezone)

  const [agenda, payments, trackers, insights, steps, streak, xp, quests, system] = await Promise.all([
    dayAgenda(user, today, now),
    upcomingPayments(user, now),
    trackerDays(user, today, today),
    db.select().from(schema.insights)
      .where(and(eq(schema.insights.userId, user.id), eq(schema.insights.status, 'pending')))
      .orderBy(desc(schema.insights.createdAt)).limit(3),
    onboardingSteps(user),
    showUpStreak(user, today),
    xpSummary(user, now),
    questBoard(user, now),
    systemBoard(user, now),
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
      area: s.category,
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
  // Each routine's share of today's 100 plan XP, shown as its quest reward.
  for (const r of rows) r.xp = Math.round(100 / total)
  const done = Object.values(byCat).reduce((s, c) => s + c.done, 0)
  const left = total - done
  const dueSoon = payments.filter((p) => p.daysLeft <= 7)

  const hour = localHour(now, user.timezone)
  const { greet, Icon } = PHASE(hour)
  const firstName = user.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-6">
      <CharacterBanner
        s={xp} name={user.name} heading={`${greet}, ${firstName}.`}
        eyebrow={<span className="inline-flex items-center gap-1.5"><Icon className="size-3.5 text-pill-ink" strokeWidth={2} aria-hidden />{formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span>}
        streak={streak} freezes={quests.freezes} areas={user.profile.areas}
      />

      <PetalBurst complete={total > 0 && done === total} day={today} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5 sm:p-6">
          <CardHeader
            title="Today’s quest log" icon={<ScrollText strokeWidth={2} />} color="var(--pill)"
            description={total ? (left ? `${done} of ${total} done · ${left} to go` : `All ${total} done. Nice.`) : undefined}
            action={<Link href="/habits?new=1" className={buttonClass({ variant: 'ghost', size: 'sm' })}><Plus className="size-4" strokeWidth={2} />Add</Link>}
          />
          {total ? <Capsule value={done} max={total} size="sm" color="var(--pill)" label="Done today" className="-mt-2 mb-5" /> : null}
          {goals.length ? (
            <div className="mb-5 border-b border-divider pb-5"><Goals rows={goals} /></div>
          ) : null}
          {rows.length ? (
            <Agenda rows={rows} />
          ) : !goals.length ? (
            <EmptyState
              title="Nothing scheduled today" icon={Sunrise} color={'var(--pill)'}
              description="Add routines like skincare or medicines and they’ll show up here, with reminders on Telegram."
              action={<Link href="/habits?new=1" className={buttonClass({ variant: 'primary' })}>Add a routine</Link>}
            />
          ) : null}
        </Card>

        <aside className="flex flex-col gap-6" aria-label="Also today">
          <Quests
            system={{
              difficulty: system.difficulty, hasData: system.hasData,
              quests: system.quests.map((q) => ({
                id: q.id, kind: q.kind, title: q.title, reason: q.reason, rank: q.rank, xp: q.xp, status: q.status,
                progress: q.progress, target: q.target, op: q.op, unit: q.unit, toDate: q.toDate,
              })),
            }}
            weekly={quests.weekly.map(questItem)}
            chests={quests.chests.map((c) => ({ id: c.id, rarity: c.rarity, reason: c.reason }))}
            freezes={quests.freezes} frozeOn={quests.frozeOn}
            weekLeft={daysBetween(today, addDays(weekStart(today), 6))}
          />
          {steps.some((s) => !s.done) ? <OnboardingCompact steps={steps} /> : null}

          <Card>
            <CardHeader
              title="Due soon"
              icon={<CalendarClock strokeWidth={2} />}
              color="var(--cat-wealth)"
              action={<Link href="/wealth/subscriptions" className={buttonClass({ variant: 'ghost', size: 'sm' })}>All</Link>}
            />
            {dueSoon.length ? (
              <ul className="-mx-2 flex flex-col">
                {dueSoon.map((p) => {
                  const soon = p.daysLeft <= 1
                  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: user.timezone }).format(p.due)
                  const dd = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: user.timezone }).format(p.due)
                  return (
                    <li key={p.schedule.id} className="flex items-center gap-3 rounded-md px-2 py-2">
                      <span
                        aria-hidden
                        className={`grid size-10 shrink-0 place-content-center rounded-[10px] text-center leading-none ${soon ? 'text-warn' : 'text-ink'}`}
                        style={{ background: soon ? 'color-mix(in oklch, var(--warn) 14%, transparent)' : 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
                      >
                        <span className="text-[9.5px] font-semibold tracking-[0.06em] uppercase opacity-70">{wd}</span>
                        <span className="mt-0.5 font-display text-[16px] font-bold tabular-nums">{dd}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] text-ink">{p.schedule.name}</div>
                        <div className={`text-[12px] ${soon ? 'font-medium text-warn' : 'text-ink-3'}`}>{dueLabel(p.daysLeft)}</div>
                      </div>
                      {p.amount ? <span className="text-[14px] font-medium text-ink tabular-nums">{formatMoney(p.amount, p.currency ?? user.baseCurrency)}</span> : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">Nothing due in the next 7 days.</p>
            )}
          </Card>

          {insights.length ? (
            <Card>
              <CardHeader title="Suggestions" icon={<Sparkles strokeWidth={2} />} color="var(--pill)" action={<Link href="/insights" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Review</Link>} />
              <ul className="-mx-2 flex flex-col">
                {insights.map((i) => {
                  const K = INSIGHT[i.kind]
                  return (
                    <li key={i.id}>
                      <Link href="/insights" className="group flex items-center gap-3 rounded-md px-2 py-2 transition-[background-color] duration-150 hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:outline-pill dark:hover:bg-white/[0.04]">
                        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[9px]" style={{ color: K.color, background: `color-mix(in oklch, ${K.color} 13%, transparent)` }}>
                          <K.icon className="size-4" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11.5px] font-medium text-ink-3">{K.label}</span>
                          <span className="block text-[13.5px] leading-snug text-ink">{i.title}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-ink-3 transition-[translate,color] duration-150 group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.5} aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ) : null}

        </aside>
      </div>
    </div>
  )
}

const questItem = (q: QuestView): QuestItem => ({ key: q.key, title: q.title, area: q.area, measure: q.measure, target: q.target, progress: q.progress, done: q.done, rarity: q.rarity })

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="flex items-end justify-between">
        <div><Skeleton className="h-7 w-48 rounded-full" /><Skeleton className="mt-3 h-10 w-80" /><Skeleton className="mt-3 h-5 w-56" /></div>
        <Skeleton className="hidden h-16 w-80 rounded-lg sm:block" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[420px] rounded-lg" />
        <div className="flex flex-col gap-6"><Skeleton className="h-[180px] rounded-lg" /><Skeleton className="h-[160px] rounded-lg" /></div>
      </div>
    </div>
  )
}
