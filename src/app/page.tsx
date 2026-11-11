import Link from 'next/link'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AlarmClock, BellRing, CalendarClock, ChevronRight, History, Moon, Pill, Plus, ScrollText, Sun, Sunrise, Sunset, TriangleAlert, Unplug, Wallet } from 'lucide-react'
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
import { Card, CardHeader, KpiStrip, Skeleton } from '@/ui/components/card'
import { BrandLogo } from '@/ui/components/brand-logo'
import { cn } from '@/ui/cn'
import { loadBriefing, minutes, type Attention, type Briefing } from '@/core/today'
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

// Today is a morning briefing, then the day's work: what needs you first, today's numbers next to a usual day,
// the quest log, and a short look at money and yesterday. Looking back further lives on Progress (/character).

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

  const payments = await upcomingPayments(user, now)
  const [agenda, trackers, b, steps, streak, xp, quests, system] = await Promise.all([
    dayAgenda(user, today, now),
    trackerDays(user, today, today),
    loadBriefing(user, payments, now),
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
          unit: s.unit ?? '', step: meta.step ?? Math.max(1, Math.round(s.target / 8)), area: s.category,
          // Water reads as water: the capsule blue rather than its area's colour.
          color: meta.trackerSlug === 'water' ? 'var(--pill)' : CATEGORY[s.category].color,
          next: agenda.filter((x) => x.schedule.id === s.id && x.occurrence > now).map((x) => formatTime(x.occurrence, user.timezone))[0],
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
      // Medicines: the dose and how many are left (amber when it's time to refill). Routines: their note.
      chips: s.kind === 'medicine'
        ? [...(meta.dose ? [{ text: meta.dose }] : []), ...(typeof meta.stock === 'number' ? [{ text: `${meta.stock} left`, warn: meta.stock <= (meta.refillAt ?? 7) }] : [])]
        : undefined,
      detail: s.kind === 'medicine' ? undefined : meta.notes,
      status: i.status,
    })
  }

  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, { done: 0, total: 0 }]))
  for (const r of rows) { const c = catOf.get(r.scheduleId)!; byCat[c].total++; if (r.status === 'done' || r.status === 'skipped') byCat[c].done++ }
  for (const g of goals) { const c = catOf.get(g.scheduleId)!; byCat[c].total++; if (g.value >= g.target) byCat[c].done++ }
  const total = rows.length + goals.length
  // Each routine's share of today's 100 plan XP, shown as its quest reward.
  for (const r of rows) r.xp = Math.round(100 / total)
  // Skipped counts as handled, the same rule as `todayLeft` (core/schedules.ts), so this and the rail's Today number match.
  const done = Object.values(byCat).reduce((s, c) => s + c.done, 0)
  const left = total - done
  const dueSoon = payments.filter((p) => p.daysLeft <= 7)
  const overdue = rows.filter((r) => r.status === 'missed')
  const next = rows.find((r) => r.status === 'pending')
  const attention: Attention[] = [
    ...(overdue.length ? [{ key: 'overdue', tone: 'warn' as const, kind: 'routine' as const, href: '#quest-log', title: `${overdue.length} routine${overdue.length === 1 ? '' : 's'} overdue`, detail: overdue.slice(0, 3).map((r) => r.name).join(', ') }] : []),
    ...b.attention,
  ].sort((x, y) => TONE_RANK[x.tone] - TONE_RANK[y.tone])
  const money = (v: number) => formatMoney(v, user.baseCurrency, { decimals: 0 })

  const hour = localHour(now, user.timezone)
  const { greet, Icon } = PHASE(hour)
  const firstName = user.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-6">
      <CharacterBanner
        s={xp} heading={`${greet}, ${firstName}.`}
        eyebrow={<span className="inline-flex items-center gap-1.5"><Icon className="size-3.5 text-pill-ink" strokeWidth={2} aria-hidden />{formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span>}
        streak={streak} freezes={quests.freezes} areas={user.profile.areas}
      />

      <PetalBurst complete={total > 0 && done === total} day={today} />

      {attention.length ? <CheckFirst items={attention} /> : null}

      <KpiStrip items={[
        {
          label: 'Today’s plan', value: total ? `${done} / ${total}` : '–',
          sub: !total ? 'Nothing scheduled' : left ? (next ? `Next: ${next.name} · ${next.time}` : `${left} to go`) : 'All done',
          tone: total && !left ? 'good' : undefined,
        },
        b.focus.tracked
          ? { label: 'Deep work', value: minutes(b.focus.work ?? 0), sub: `${minutes(b.focus.distract)} social and entertainment`, tone: b.focus.distract > (b.focus.work ?? 0) && b.focus.distract >= 30 ? 'bad' : undefined }
          : { label: 'Deep work', value: '–', sub: 'Add the browser extension' },
        {
          label: 'Spent today', value: money(b.money.spentToday),
          sub: b.money.usualDay ? `Usual day ${money(b.money.usualDay)}` : `${b.money.countToday} payment${b.money.countToday === 1 ? '' : 's'}`,
          tone: b.money.usualDay && b.money.spentToday > b.money.usualDay * 1.5 ? 'bad' : undefined,
        },
        b.code.tracked
          ? {
              label: 'Shipped', value: `${b.code.commits ?? 0} commit${b.code.commits === 1 ? '' : 's'}`,
              sub: [b.code.prs ? `${b.code.prs} PR${b.code.prs === 1 ? '' : 's'}` : null, b.code.reviews ? `${b.code.reviews} review${b.code.reviews === 1 ? '' : 's'}` : null, b.code.solved ? `${b.code.solved} solved` : null, b.code.learning ? `${minutes(b.code.learning)} learning` : null].filter(Boolean).join(' · ') || 'Nothing else yet',
            }
          : { label: 'Shipped', value: '–', sub: 'Connect GitHub or Codeforces' },
      ]} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card id="quest-log" className="scroll-mt-6 p-5 sm:p-6">
            <CardHeader
              title="Today’s quest log" icon={<ScrollText strokeWidth={2} />} color="var(--pill)"
              description={total ? (left ? `${done} of ${total} done · ${left} to go` : `All ${total} done. Nice.`) : undefined}
              action={<Link href="/routines?new=1" className={buttonClass({ variant: 'ghost', size: 'sm' })}><Plus className="size-4" strokeWidth={2} />Add</Link>}
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
                action={<Link href="/routines?new=1" className={buttonClass({ variant: 'primary' })}>Add a routine</Link>}
              />
            ) : null}
          </Card>
          {/* Money and yesterday sit under the quest log, so both columns end together. */}
          <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2">
            <MoneyToday b={b} dueSoon={dueSoon} money={money} tz={user.timezone} base={user.baseCurrency} />
            <Yesterday b={b} money={money} />
          </div>
        </div>

        <aside className="flex flex-col gap-6 [&>*:last-child]:flex-1" aria-label="Also today">
          <Quests
            system={{
              difficulty: system.difficulty, hasData: system.hasData, timezone: user.timezone,
              quests: system.quests.map((q) => ({
                id: q.id, kind: q.kind, title: q.title, reason: q.reason, rank: q.rank, xp: q.xp, status: q.status,
                progress: q.progress, target: q.target, op: q.op, unit: q.unit, toDate: q.toDate, statId: q.statId, area: q.area,
              })),
            }}
            weekly={quests.weekly.map(questItem)}
            chests={quests.chests.map((c) => ({ id: c.id, rarity: c.rarity, reason: c.reason }))}
            freezes={quests.freezes} frozeOn={quests.frozeOn}
            weekLeft={daysBetween(today, addDays(weekStart(today), 6))}
          />
          {!user.profile.setupHiddenAt && steps.some((s) => !s.done) ? <OnboardingCompact steps={steps} /> : null}
        </aside>
      </div>
    </div>
  )
}


const TONE_RANK = { bad: 0, warn: 1, info: 2 } as const
const TONE_COLOR = { bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--pill)' } as const
const KIND_ICON = { risk: TriangleAlert, money: CalendarClock, medicine: Pill, routine: AlarmClock, nudge: BellRing, sync: Unplug } as const

/** What needs you before anything else: money at risk, charges due, refills, overdue routines, unread nudges. */
function CheckFirst({ items }: { items: Attention[] }) {
  return (
    <section aria-labelledby="check-first" className="rounded-xl bg-surface p-4 shadow-1 sm:p-5">
      <h2 id="check-first" className="mb-3 flex items-center gap-2 px-1 text-[13px] font-semibold text-ink">
        <span aria-hidden className="size-2 rounded-full" style={{ background: TONE_COLOR[items[0].tone] }} />
        Check first
        <span className="font-normal text-ink-3 tabular-nums">{items.length}</span>
      </h2>
      <ul className={cn('grid grid-cols-1 gap-2', items.length > 1 && 'md:grid-cols-2')}>
        {items.map((a) => {
          const Icon = KIND_ICON[a.kind]
          const c = TONE_COLOR[a.tone]
          return (
            <li key={a.key}>
              <Link href={a.href} className="group flex items-center gap-3 rounded-[14px] bg-[color-mix(in_oklch,var(--tone)_7%,transparent)] px-3 py-2.5 transition-[background-color] duration-150 hover:bg-[color-mix(in_oklch,var(--tone)_13%,transparent)] focus-visible:outline-2 focus-visible:outline-pill" style={{ '--tone': c } as React.CSSProperties}>
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px]" style={{ color: c, background: `color-mix(in oklch, ${c} 14%, transparent)` }}>
                  <Icon className="size-[18px]" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{a.title}</span>
                  <span className="block truncate text-[12px] text-ink-3">{a.detail}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-3 transition-[translate,color] duration-150 group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.5} aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Today's payments as they came in, then what renews this week. */
function MoneyToday({ b, dueSoon, money, tz, base }: { b: Briefing; dueSoon: Awaited<ReturnType<typeof upcomingPayments>>; money: (v: number) => string; tz: string; base: string }) {
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz })
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: tz })
  const dd = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: tz })
  return (
    <Card>
      <CardHeader title="Money today" icon={<Wallet strokeWidth={2} />} color="var(--cat-wealth)" action={<Link href="/wealth" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Wealth</Link>} />
      {b.money.paymentsToday.length ? (
        <ul className="-mx-2 flex flex-col">
          {b.money.paymentsToday.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-md px-2 py-2">
              <BrandLogo name={t.merchant ?? t.upiId ?? t.source} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-ink">{t.merchant ?? t.upiId ?? 'Payment'}</p>
                <p className="text-[12px] text-ink-3 tabular-nums">{time.format(t.at)}{t.category && t.category !== 'Uncategorized' ? ` · ${t.category}` : ''}</p>
              </div>
              <span className="text-[13.5px] font-medium text-ink tabular-nums">{money(-t.base)}</span>
            </li>
          ))}
          {b.money.countToday > b.money.paymentsToday.length ? <li className="px-2 pt-1 text-[12px] text-ink-3">and {b.money.countToday - b.money.paymentsToday.length} more</li> : null}
        </ul>
      ) : <p className="text-[13px] text-ink-3">No payments yet today.</p>}

      <div className="mt-4 border-t border-divider pt-4">
        <p className="mb-2 text-[12px] font-medium text-ink-2">Renews this week</p>
        {dueSoon.length ? (
          <ul className="-mx-2 flex flex-col">
            {dueSoon.map((p) => {
              const soon = p.daysLeft <= 1
              return (
                <li key={p.schedule.id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                  <span aria-hidden className={cn('grid size-9 shrink-0 place-content-center rounded-[10px] text-center leading-none', soon ? 'text-warn' : 'text-ink')} style={{ background: soon ? 'color-mix(in oklch, var(--warn) 14%, transparent)' : 'var(--surface-2)' }}>
                    <span className="text-[9px] font-semibold tracking-[0.06em] uppercase opacity-70">{wd.format(p.due)}</span>
                    <span className="mt-0.5 font-display text-[15px] font-bold tabular-nums">{dd.format(p.due)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] text-ink">{p.schedule.name}</div>
                    <div className={cn('text-[12px]', soon ? 'font-medium text-warn' : 'text-ink-3')}>{dueLabel(p.daysLeft)}</div>
                  </div>
                  {p.amount ? <span className="text-[13.5px] font-medium text-ink tabular-nums">{formatMoney(p.amount, p.currency ?? base)}</span> : null}
                </li>
              )
            })}
          </ul>
        ) : <p className="text-[13px] text-ink-3">Nothing renews in the next 7 days.</p>}
      </div>
    </Card>
  )
}

/** Yesterday in four numbers, to start today knowing where you are. */
function Yesterday({ b, money }: { b: Briefing; money: (v: number) => string }) {
  const y = b.yesterday
  const cells = [
    { label: 'Routines', value: y.routines.total ? `${y.routines.done} / ${y.routines.total}` : '–' },
    { label: 'Deep work', value: y.focus == null ? '–' : minutes(y.focus) },
    { label: 'Spent', value: money(y.spent) },
    { label: 'Commits', value: y.commits == null ? '–' : String(y.commits) },
  ]
  return (
    <Card>
      <CardHeader title="Yesterday" icon={<History strokeWidth={2} />} color="var(--pill)" />
      <dl className="grid grid-cols-2 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-[12px] bg-surface-2 px-3 py-2.5">
            <dt className="text-[11.5px] text-ink-3">{c.label}</dt>
            <dd className="mt-0.5 text-[16px] font-semibold text-ink tabular-nums">{c.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
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
