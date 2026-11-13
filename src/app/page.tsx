import Link from 'next/link'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { cache, Suspense } from 'react'
import { Plus, Sunrise } from 'lucide-react'
import { getUser, type User } from '@/core/user'
import { loadDayPlan, loadTomorrow } from '@/core/day-plan'
import { loadShellStatus } from '@/core/shell'
import { loadPulse } from '@/core/pulse'
import { loadTodayBriefing, moneyView } from '@/core/today'
import { latestBrief } from '@/core/briefs'
import { addDays, daysBetween, formatDay, formatTime, localDate, localHour } from '@/core/time'
import { dayState, greeting, planLine, recapLine } from '@/domain/day-plan'
import { weekStart } from '@/domain/quests'
import { questBoard, type QuestView } from '@/core/quests'
import { systemBoard } from '@/core/system'
import { xpSummary } from '@/core/xp'
import { OnboardingCompact, onboardingSteps } from '@/ui/components/onboarding'
import { Agenda, Goals } from '@/ui/components/agenda'
import { Card, CardHeader, Skeleton } from '@/ui/components/card'
import { Capsule } from '@/ui/components/capsule'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { showUpStreak } from '@/ui/components/life-kpis'
import { TodayGoals } from '@/ui/components/goals/goals-summary'
import { Quests, type QuestItem } from '@/ui/components/quests'
import { TodayHeader } from '@/ui/components/today/today-header'
import { AttentionStrip, type AttentionCard } from '@/ui/components/today/attention-strip'
import { PulseRow } from '@/ui/components/today/pulse-row'
import { MoneyToday } from '@/ui/components/today/money-today'
import { SetupCard } from '@/ui/components/today/setup-card'
import { DayComplete } from '@/ui/components/today/day-complete'
import { TomorrowCard } from '@/ui/components/today/tomorrow-card'
import { CaptureButton } from '@/ui/components/today/capture-button'

// Today: a light header (greeting, one line from the brief, streak), what needs you first, the Life pulse, then the
// day's plan next to the rail (quests, goals, money). The game is a light layer here; the full character sheet is You.
// Every section is its own Suspense island with a skeleton of its final size; they share cached loaders.

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <Today />
    </Suspense>
  )
}

/** The level, streak, quests and System board: read once per request by the header and the rail. */
const loadGame = cache(async (user: User) => {
  const now = new Date()
  const today = localDate(now, user.timezone)
  const [xp, streak, quests, system] = await Promise.all([xpSummary(user, now), showUpStreak(user, today), questBoard(user, now), systemBoard(user, now)])
  return { xp, streak, quests, system, today }
})
const loadSetup = cache((user: User) => onboardingSteps(user))
const loadTomorrowRows = cache((user: User) => loadTomorrow(user))

/** Day one: nothing earned yet and setup still open. The setup card then replaces the sections with nothing to show. */
async function isFirstDay(user: User) {
  const [{ xp }, steps] = await Promise.all([loadGame(user), loadSetup(user)])
  return !user.profile.setupHiddenAt && xp.total === 0 && steps.some((s) => !s.done)
}

async function Today() {
  await connection()
  const user = await getUser()
  if (!user.profile.onboardedAt) redirect('/welcome')
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<HeaderSkeleton />}><Header user={user} /></Suspense>
      <Suspense fallback={null}><Attention user={user} /></Suspense>
      <Suspense fallback={null}><Setup user={user} /></Suspense>
      <Suspense fallback={<Skeleton className="h-[170px] rounded-lg xl:h-[148px]" />}><Pulse user={user} /></Suspense>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <Suspense fallback={null}><DayEnd user={user} /></Suspense>
          <Suspense fallback={<Skeleton className="h-[520px] rounded-lg" />}><Plan user={user} /></Suspense>
        </div>
        <aside className="flex flex-col gap-6" aria-label="Also today">
          <Suspense fallback={<Skeleton className="h-[320px] rounded-lg" />}><Rail user={user} /></Suspense>
          <Suspense fallback={null}><Goal user={user} /></Suspense>
          <Suspense fallback={<Skeleton className="h-[420px] rounded-lg" />}><Money user={user} /></Suspense>
          <Suspense fallback={null}><SetupCompact user={user} /></Suspense>
        </aside>
      </div>
    </div>
  )
}

async function Header({ user }: { user: User }) {
  await connection()
  const [plan, { xp, streak, quests, today }, firstDay, brief] = await Promise.all([loadDayPlan(user), loadGame(user), isFirstDay(user), latestBrief(user, 'today')])
  const state = dayState(plan.total, plan.done)
  const complete = state === 'complete'
  const tomorrow = complete ? (await loadTomorrowRows(user))[0] : undefined
  const stored = brief && brief.localDate === today ? brief.text : null
  const hour = localHour(new Date(), user.timezone)
  return (
    <TodayHeader d={{
      date: `${formatDay(today, { weekday: 'long' })} · ${formatDay(today, { day: 'numeric', month: 'long' })}`,
      greeting: greeting(hour), name: user.name.split(' ')[0],
      line: complete ? recapLine({ total: plan.total, tomorrow }) : stored ?? (firstDay ? 'Day one. Check things off as you go and ReLife learns your rhythm; connect a source or two to fill in the rest.' : planLine({ total: plan.total, done: plan.done, next: plan.next })),
      why: !complete && !!stored,
      streak, freezes: quests.freezes, xpToday: xp.today, firstDay, complete,
    }} />
  )
}

/** "Check first": the time-sensitive items from the briefing plus one chip for what waits in Coach. */
async function Attention({ user }: { user: User }) {
  await connection()
  if (await isFirstDay(user)) return null
  const [{ briefing }, shell] = await Promise.all([loadTodayBriefing(user), loadShellStatus(user)])
  const rank = { bad: 0, warn: 1, info: 2 } as const
  // Nudges are part of Coach's count, so they are not listed twice; overdue routines stay in the timeline.
  const cards: AttentionCard[] = briefing.attention
    .filter((a): a is typeof a & { kind: AttentionCard['kind'] } => a.kind !== 'nudge')
    .sort((a, b) => rank[a.tone] - rank[b.tone])
  return <AttentionStrip cards={cards} coach={shell.needsYou.total} />
}

async function Setup({ user }: { user: User }) {
  await connection()
  if (!(await isFirstDay(user))) return null
  return <SetupCard steps={await loadSetup(user)} />
}

async function Pulse({ user }: { user: User }) {
  await connection()
  if (await isFirstDay(user)) return null
  return <PulseRow tiles={await loadPulse(user)} />
}

/** The end of the day: the Day complete card (with the chest it earned) and tomorrow's first rows. */
async function DayEnd({ user }: { user: User }) {
  await connection()
  const plan = await loadDayPlan(user)
  if (dayState(plan.total, plan.done) !== 'complete') return null
  const [{ xp, streak, quests }, tomorrow, { payments }] = await Promise.all([loadGame(user), loadTomorrowRows(user), loadTodayBriefing(user)])
  const next = payments.find((p) => p.daysLeft >= 1 && p.daysLeft <= 7)
  return (
    <>
      <DayComplete done={plan.done} total={plan.total} streak={streak.current} xp={xp.today} chests={quests.chests.map((c) => ({ id: c.id, rarity: c.rarity, reason: c.reason }))} />
      <TomorrowCard
        date={formatDay(addDays(plan.today, 1), { weekday: 'short', day: 'numeric', month: 'short' })} rows={tomorrow}
        renewal={next ? { name: next.schedule.name, when: next.daysLeft === 1 ? 'tomorrow' : formatDay(addDays(plan.today, next.daysLeft), { weekday: 'short' }), amount: next.amount ? `${next.currency ?? user.baseCurrency} ${next.amount.toLocaleString('en-IN')}` : undefined } : undefined}
      />
    </>
  )
}

async function Plan({ user }: { user: User }) {
  await connection()
  const plan = await loadDayPlan(user)
  const { rows, goals, total, done } = plan
  const left = total - done
  const now = formatTime(new Date(), user.timezone)
  return (
    <Card id="quest-log" className="scroll-mt-6 p-5 sm:p-6">
      <CardHeader
        title={<>Today’s plan{total ? <span className="ms-2 inline-flex h-6 items-center rounded-full bg-surface-2 px-2 align-middle text-caption font-medium text-ink-2 tabular-nums">{done} of {total}</span> : null}</>}
        description={total ? (left ? `${left} to go` : `All ${total} done. Nice.`) : undefined}
        action={<Link href="/plan/routines" className="inline-flex h-10 items-center rounded-md px-2 text-small font-medium text-pill-ink hover:underline">Edit in Plan</Link>}
      />
      {total ? <Capsule value={done} max={total} size="sm" color="var(--pill)" label="Done today" className="-mt-2 mb-5" /> : null}
      {goals.length ? (
        <div className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 px-1 font-mono text-label text-ink-3 uppercase">All day<span aria-hidden className="h-px flex-1 bg-divider" /></h3>
          <Goals rows={goals} compact />
        </div>
      ) : null}
      {rows.length ? (
        <Agenda rows={rows} timeline={{ now }} />
      ) : !goals.length ? (
        <EmptyState
          title="Nothing planned today" icon={Sunrise} color="var(--pill)"
          description="Add routines like skincare or medicines and they’ll show up here, with reminders on Telegram. Or log something you did."
          action={<div className="flex flex-wrap justify-center gap-2"><Link href="/plan/routines?new=1" className={buttonClass({ variant: 'primary', size: 'lg' })}><Plus className="size-4" strokeWidth={2} aria-hidden />Add a routine</Link><CaptureButton /></div>}
        />
      ) : null}
    </Card>
  )
}

const questItem = (q: QuestView): QuestItem => ({ key: q.key, title: q.title, area: q.area, measure: q.measure, target: q.target, progress: q.progress, done: q.done, rarity: q.rarity })

async function Rail({ user }: { user: User }) {
  await connection()
  const { quests, system, today } = await loadGame(user)
  return (
    <Quests
      system={{
        difficulty: system.difficulty, hasData: system.hasData, timezone: user.timezone, recovery: system.recovery,
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
  )
}

/** Goals' pace. Renders nothing without active goals, except on day one, where it says how to start one. */
async function Goal({ user }: { user: User }) {
  await connection()
  return <TodayGoals showEmpty={await isFirstDay(user)} />
}

async function Money({ user }: { user: User }) {
  await connection()
  if (await isFirstDay(user)) return null
  const { briefing, payments } = await loadTodayBriefing(user)
  return <MoneyToday v={moneyView(user, briefing, payments)} />
}

/** Past day one the setup steps stay in the rail until done or hidden. The tour's last stop points here. */
async function SetupCompact({ user }: { user: User }) {
  await connection()
  if (user.profile.setupHiddenAt || (await isFirstDay(user))) return null
  const steps = await loadSetup(user)
  return steps.some((s) => !s.done) ? <OnboardingCompact steps={steps} /> : null
}

function HeaderSkeleton() {
  return (
    <div aria-busy className="grid gap-1">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="mt-1 h-8 w-72 sm:h-10 sm:w-96" />
      <Skeleton className="mt-1 h-10 w-full max-w-[64ch]" />
    </div>
  )
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <HeaderSkeleton />
      <Skeleton className="h-[170px] rounded-lg xl:h-[148px]" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[520px] rounded-lg" />
        <div className="flex flex-col gap-6"><Skeleton className="h-[320px] rounded-lg" /><Skeleton className="h-[200px] rounded-lg" /></div>
      </div>
    </div>
  )
}
