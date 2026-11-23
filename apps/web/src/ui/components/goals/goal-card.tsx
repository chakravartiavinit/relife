'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck, CalendarClock, CircleDashed, Flag, History, Pause, Pencil, Play, Repeat, ChartLine, Target } from 'lucide-react'
import { dismissGoalDraftAction, draftGoalAction, reviewGoalNowAction, setGoalStatusAction } from '@/app/actions'
import { CAP_MESSAGE, MAX_ACTIVE, type GoalDraft, type OutcomeStatus } from '@/domain/goals'
import { goalPace, type Pace } from '@/domain/day-plan'
import { CATEGORY } from '@/ui/tokens'
import { cn } from '@/ui/cn'
import { Button, buttonClass } from '../button'
import { Badge, Card, CardHeader, IconChip, Skeleton } from '../card'
import { LevelBar } from '../capsule'
import { RowMenu } from '../row-menu'
import { useToast } from '../toast'
import { usePeekChanged } from '../peek/peek-context'
import { PeekLink } from '../peek/peek-link'
import { GoalDialog, GoalFormButton, initialFromDraft, initialFromGoal, type GoalPickerData } from './goal-form'
import { formatDay } from '@/core/time'
import { STATUS_LABEL, actionNumbers, coverageLine, day, directionLabel, fill, measureLine, movement, statusColor, target, value, weekday, type GoalViewData } from './format'

const PACE_COLOR: Record<Pace['tone'], string | undefined> = { good: 'var(--good)', pill: 'var(--pill)', warn: 'var(--warn)', neutral: undefined }

export function GoalStatusBadge({ g }: { g: Pick<GoalViewData, 'snapshot' | 'sensitive'> }) {
  if (!g.snapshot) return null
  const s = g.snapshot.outcome.status
  return <Badge color={statusColor(s, g.sensitive)}>{STATUS_LABEL[s]}</Badge>
}

/** Pause / resume / finish outside a review (the server's answer shown in a toast), and "Review now". */
export function useGoalActions(g: GoalViewData) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const router = useRouter()
  const changed = usePeekChanged()
  // One change at a time: a second tap while saving would only hit a stale version.
  const set = (status: 'active' | 'paused' | 'finished') => !pending && start(async () => {
    const res = await setGoalStatusAction({ goalId: g.id, version: g.version, status })
    toast(res.ok ? { active: 'Goal resumed', paused: 'Goal paused', finished: 'Goal finished' }[status] : res.error, res.ok ? 'good' : 'bad')
    if (res.ok) changed()
  })
  const reviewNow = () => !pending && start(async () => { await reviewGoalNowAction(g.id); router.push('/plan/review') })
  return { pending, set, reviewNow }
}

/** Names the board in one line: how many of the goals are behind, ahead or too new to judge. */
function boardSummary(paces: (Pace | null)[]) {
  const n = paces.length
  const behind = paces.filter((p) => p?.label === 'Behind').length
  if (behind) return `${behind} of ${n} ${behind === 1 ? 'goal is' : 'goals are'} behind pace.`
  if (paces.some((p) => !p || p.label === 'Too early')) return 'Some goals are too new to judge pace.'
  const all = n === 1 ? 'This goal is' : n === 2 ? 'Both goals are' : 'All goals are'
  return paces.every((p) => p!.label === 'Ahead' || p!.label === 'Reached') ? `${all} ahead of pace.` : `${all} on or ahead of pace.`
}

/** The pace board: every active goal as a row (Now, a bar from baseline to target, linked actions), then the free-slot well in `children`. */
export function GoalsBoard({ goals, picker, today, children }: { goals: GoalViewData[]; picker: GoalPickerData; today: string; children?: React.ReactNode }) {
  const paces = goals.map((g) => paceOf(g, today))
  return (
    <Card className="flex flex-1 flex-col p-0" aria-labelledby="active-goals">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-6 pt-5 pb-4">
        <div className="min-w-0">
          <h2 id="active-goals" className="text-heading text-ink">Active goals <span className="ml-1 font-normal text-ink-3 tabular-nums">{goals.length} of {MAX_ACTIVE}</span></h2>
          <p className="mt-0.5 text-small text-ink-3">{boardSummary(paces)}</p>
        </div>
        <ul aria-label="How to read the bars" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-3">
          <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-4 rounded-xs bg-ink-2" />Baseline to target</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-0.5 rounded-full bg-ink" />Where you should be by now</li>
        </ul>
      </header>
      {goals.map((g, i) => <OutcomeGoalRow key={g.id} g={g} pace={paces[i]} picker={picker} today={today} />)}
      {children ? <div className="mx-6 mt-1 mb-6">{children}</div> : <div className="pb-1" />}
    </Card>
  )
}

const paceOf = (g: GoalViewData, today: string) =>
  g.snapshot ? goalPace({ share: g.snapshot.outcome.progressShare ?? null, met: !!g.snapshot.met, startedOn: g.startedOn, targetDate: g.targetDate }, today) : null

/** An active goal: where it started, where it is, where it is going, and how this week's linked actions went. */
function OutcomeGoalRow({ g, pace, picker, today }: { g: GoalViewData; pace: Pace | null; picker: GoalPickerData; today: string }) {
  const color = CATEGORY[g.area].color
  const o = g.snapshot?.outcome
  const move = movement(g)
  const { pending, set, reviewNow } = useGoalActions(g)
  const [editing, setEditing] = useState(false)
  const showTick = pace && pace.label !== 'Reached' && pace.label !== 'Too early'
  return (
    <article aria-labelledby={`goal-${g.id}`} aria-busy={pending || undefined} className="@container border-t border-divider px-6 py-5">
      <header className="flex items-start gap-2.5">
        <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full" style={{ background: color }} />
        <h3 id={`goal-${g.id}`} className="min-w-0 flex-1 text-heading text-ink text-pretty @xl:truncate">
          <PeekLink to={{ type: 'goal', id: g.id }} className="rounded-sm hover-fine:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">{g.title}</PeekLink>
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          {pending ? <span role="status" className="text-caption text-ink-3">Saving…</span> : pace && pace.label !== 'Too early' ? <Badge color={PACE_COLOR[pace.tone]}>{pace.label === 'Behind' ? 'Behind pace' : pace.label}</Badge> : <GoalStatusBadge g={g} />}
          <RowMenu label={g.title} items={[
            { label: 'Edit', icon: Pencil, onSelect: () => setEditing(true) },
            { label: 'Review now', icon: CalendarCheck, onSelect: reviewNow },
            { label: 'Pause', icon: Pause, onSelect: () => set('paused') },
            { label: 'Finish', icon: Flag, onSelect: () => set('finished'), danger: true },
          ]} />
        </div>
      </header>
      <p className="mt-0.5 pl-[18px] text-small text-ink-3">{measureLine(g)}</p>
      <GoalDialog open={editing} onClose={() => setEditing(false)} mode={{ kind: 'edit', goal: g }} initial={initialFromGoal(g)} picker={picker} today={today} />

      <div className="mt-4 grid gap-x-6 gap-y-4 @xl:grid-cols-[11rem_minmax(0,1fr)] @xl:items-center">
        <PeekLink to={{ type: 'goal', id: g.id }} aria-label={`${g.title}: open trend`} className="-m-1.5 block min-w-0 rounded-md p-1.5 transition-[background-color] duration-150 hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill">
          <span className="block text-small text-ink-3">Now</span>
          <span className="mt-1 block num text-title text-ink">{o?.current != null ? value(o.current, g.unit) : '—'}</span>
          <span className="mt-1 block text-small text-ink-3 tabular-nums">{g.measureKind === 'tracker' ? `Last ${g.snapshot?.window.days ?? 7} days` : o?.latestCheckIn ? `Check-in ${day(o.latestCheckIn.localDate)}` : 'No check-in yet'}</span>
        </PeekLink>
        <div className="min-w-0">
          {/* The ink tick is where the pace says you should be today: past it is ahead, short of it is behind. */}
          <div className="relative">
            <LevelBar value={fill(g.snapshot)} color={color} size="lg" segments={20} label={`Progress toward ${g.title}`} />
            {showTick ? <span aria-hidden className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${pace.elapsed * 100}%` }} /> : null}
          </div>
          <div className="mt-2.5 flex justify-between gap-3 text-small text-ink-3 tabular-nums">
            <span>Baseline <b className="font-medium text-ink">{value(g.baselineValue, g.unit)}</b> · {day(g.baselineDate)}</span>
            <span>Target <b className="font-medium text-ink">{target(g)}</b></span>
          </div>
          <p className="mt-1 text-small text-ink-2 tabular-nums">{move ? `${move.since} · ${move.left}` : 'No current value yet'}</p>
        </div>

        <div className="flex flex-col gap-1.5 text-small text-ink-3 tabular-nums @xl:self-start">
          {g.trackerArchived ? <span className="text-ink-2">Tracker archived. Change the measure or finish the goal.</span> : null}
          <span className="flex items-center gap-2">
            {o?.status === 'not_enough_data' ? <CircleDashed className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden /> : <CalendarCheck className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />}
            {coverageLine(g)}
          </span>
          <span className="flex items-center gap-2"><CalendarClock className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />Next review {weekday(g.nextReviewOn)}</span>
        </div>
        {g.actions.length ? (
          <ul aria-label="Linked actions" className="min-w-0 border-t border-divider">
            {g.actions.map((a, i) => {
              const snap = g.snapshot?.actions[i]
              const gone = snap && !snap.available
              return (
                <li key={`${a.kind}:${a.id}`} className="flex min-h-10 flex-wrap items-center gap-x-2 border-b border-divider py-1.5 text-body text-ink @xl:flex-nowrap">
                  {a.kind === 'schedule' ? <Repeat className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden /> : <ChartLine className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />}
                  <span className={cn('min-w-0 truncate', gone && 'text-ink-3')}>{gone ? <s>{g.actionNames[i]}</s> : g.actionNames[i]}</span>
                  <span className="shrink-0 text-caption text-ink-3">{a.kind === 'schedule' ? 'Routine' : 'Tracker'}</span>
                  {snap ? <span className="w-full pb-1 pl-[22px] text-small text-ink-3 tabular-nums @xl:ml-auto @xl:w-auto @xl:min-w-0 @xl:pb-0 @xl:pl-0 @xl:text-right">{actionNumbers(snap)}</span> : null}
                </li>
              )
            })}
          </ul>
        ) : <p className="text-small text-ink-3 @xl:self-start">No linked actions. Edit the goal to link a routine or tracker.</p>}
      </div>
    </article>
  )
}

/** The weekly review in the rail: the week's numbers per goal, the coach's note, and one way in. The cards live on /plan/review. */
export type ReviewDueGoal = {
  id: string; title: string; status: OutcomeStatus | null; sensitive: boolean
  /** Tracker goals: the week's days, null where nothing was recorded. */
  days?: { date: string; value: number | null }[]
  note?: string | null
}
export function ReviewDueCard({ goals, date, today, window }: { goals: ReviewDueGoal[]; date: string; today?: string; window?: { from: string; to: string } }) {
  const count = goals.length
  const from = window ? formatDay(window.from, { day: 'numeric', month: 'short' }) : null
  return (
    <Card as="section" aria-labelledby="weekly-review" className="flex flex-col">
      <CardHeader className="mb-3"
        title={<span id="weekly-review">Weekly review</span>}
        description={`${window ? `${from}–${formatDay(window.to, { day: 'numeric', month: 'short' })} · ` : ''}${count} ${count === 1 ? 'goal' : 'goals'} to review`}
        action={<Badge color="var(--pill)">{today === undefined || date === today ? 'Due today' : `Due ${weekday(date)}`}</Badge>} />
      <ul className="flex flex-col gap-4">
        {goals.map((g) => {
          const days = g.days && g.days.length <= 7 ? g.days : null
          const missing = days?.filter((d) => d.value == null).length ?? 0
          return (
            <li key={g.id} className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 text-body text-ink">
                <PeekLink to={{ type: 'goal', id: g.id }} className="min-w-0 truncate rounded-xs font-medium hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">{g.title}</PeekLink>
                {g.status ? <span className="ml-auto shrink-0 text-small text-ink-3">{STATUS_LABEL[g.status]}</span> : null}
              </div>
              {days ? (
                <ol aria-label="By day" className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                  {days.map((d) => (
                    <li key={d.date} className={cn('flex h-12 flex-col items-center justify-center rounded-md tabular-nums', d.value == null ? 'shadow-[inset_0_0_0_1px_var(--divider)]' : 'bg-surface-2')}>
                      <span className="text-caption text-ink-3">{formatDay(d.date, { weekday: 'short' }).slice(0, 2)}</span>
                      <span className={cn('text-body', d.value == null ? 'text-ink-3' : 'font-medium text-ink')}>{d.value == null ? '—' : value(d.value)}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
              {days && missing && missing < days.length ? <p className="mt-2 text-small text-ink-3">No data on {missing} {missing === 1 ? 'day' : 'days'}. The average uses the {days.length - missing} recorded.</p> : null}
              {g.note ? <p className="mt-2 text-small text-ink-2"><span className="font-medium text-ink">Coach note: </span>{g.note}</p> : null}
            </li>
          )
        })}
      </ul>
      <div className="mt-auto pt-4">
        <Link href="/plan/review" className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}>Start review</Link>
        <p className="mt-2 text-center text-caption text-ink-3">About 2 minutes. Nothing changes until you choose.</p>
      </div>
    </Card>
  )
}

/** The rail card for the free slot: the coach's drafts and the ask for one more. */
export function CoachDraftsCard({ freeSlots, children }: { freeSlots: number; children: React.ReactNode }) {
  return (
    <Card as="section" aria-labelledby="coach-drafts" className="flex flex-col">
      <CardHeader className="mb-3" title={<span id="coach-drafts">Suggested by the coach</span>}
        description={freeSlots > 0 ? `${freeSlots === 1 ? 'A draft' : 'Drafts'} for the free ${freeSlots === 1 ? 'slot' : 'slots'}` : 'Drafts wait for a free slot'} />
      <div className="flex flex-col gap-5 divide-y divide-divider [&>*+*]:pt-5">{children}</div>
    </Card>
  )
}

/** Ask the coach for one draft from the goals text in Settings. Hidden without a model. */
export function SuggestDraftCard({ profileGoals, atCap }: { profileGoals: string | null; atCap: boolean }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <div aria-busy={pending || undefined}>
      <h3 className="text-body font-medium text-ink">Draft from your profile</h3>
      <p className="mt-1 text-small text-ink-2">Your coach can turn your profile goals into a goal draft. Nothing starts until you approve it.</p>
      {profileGoals ? <p className="mt-2 line-clamp-2 text-small text-ink-3">From your profile: “{profileGoals}”</p>
        : <p className="mt-2 text-small text-ink-3">Add your goals in <Link href="/you/settings" className="underline">Settings</Link> first.</p>}
      {pending ? (
        <div className="mt-4 flex flex-col gap-2" role="status">
          <span className="text-caption text-ink-3">Drafting a goal from your profile…</span>
          <Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" />
        </div>
      ) : null}
      {message ? <p role="status" className={cn('mt-3 rounded-md px-3 py-2 text-small', message.ok ? 'bg-good/10 text-ink-2' : 'bg-warn/10 text-ink-2')}>{message.text}</p> : null}
      <Button className="mt-4" size="sm" disabled={pending || !profileGoals || atCap} aria-describedby={atCap ? 'goal-cap-note' : undefined}
        onClick={() => start(async () => { const r = await draftGoalAction(); setMessage({ ok: r.ok, text: r.message }) })}>
        {pending ? 'Drafting…' : 'Suggest a draft'}
      </Button>
    </div>
  )
}

/** A pending AI draft: review it in the form (saving approves it) or dismiss it. */
export function GoalDraftCard({ insightId, draft, picker, today, activeCount }: { insightId: string; draft: GoalDraft; picker: GoalPickerData; today: string; activeCount: number }) {
  const [pending, start] = useTransition()
  const m = draft.measure
  const tracker = 'tracker' in m ? picker.trackers.find((t) => t.slug === m.tracker) : undefined
  const measure = 'tracker' in m ? tracker?.name ?? 'Tracker' : `Check-in · ${m.checkIn}`
  const unit = 'tracker' in m ? tracker?.unit ?? null : m.unit ?? null
  const atCap = activeCount >= MAX_ACTIVE
  return (
    <div>
      <h3 className="text-body font-medium text-ink">{draft.title}</h3>
      <p className="mt-1 text-small text-ink-2">{draft.reason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <GoalFormButton variant="primary" size="sm" mode={{ kind: 'draft', activeCount, insightId, packName: draft.origin ? draft.origin.name ?? 'starter' : undefined }} initial={initialFromDraft(draft, picker, today)} picker={picker} today={today} disabled={atCap} describedBy={atCap ? 'goal-cap-note' : undefined}>Review draft</GoalFormButton>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await dismissGoalDraftAction(insightId) })}>Dismiss</Button>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small tabular-nums">
        <dt className="text-ink-3">Measure</dt><dd className="text-ink">{measure}</dd>
        <dt className="text-ink-3">Target</dt><dd className="text-ink">{target({ direction: draft.direction, target: draft.target ?? null, rangeLow: draft.rangeLow ?? null, rangeHigh: draft.rangeHigh ?? null, unit })} by {day(draft.targetDate)}</dd>
        <dt className="text-ink-3">Baseline</dt><dd className="text-ink">You set it when you review the draft</dd>
      </dl>
    </div>
  )
}

/** Paused and finished goals, newest first. Finished goals are read-only. */
export function PausedFinishedList({ goals, activeCount }: { goals: GoalViewData[]; activeCount: number }) {
  if (!goals.length) return null
  return (
    <Card>
      <CardHeader icon={<History strokeWidth={1.5} />} title="Paused and finished" />
      <ul className="divide-y divide-divider">
        {goals.map((g) => <PausedRow key={g.id} g={g} atCap={activeCount >= MAX_ACTIVE} />)}
      </ul>
    </Card>
  )
}

function PausedRow({ g, atCap }: { g: GoalViewData; atCap: boolean }) {
  const { pending, set } = useGoalActions(g)
  const cur = g.snapshot?.outcome.current
  const when = g.status === 'paused' ? `Paused ${g.pausedOn ? day(g.pausedOn) : ''}` : `Finished ${g.finishedOn ? day(g.finishedOn) : ''}`
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <IconChip color={CATEGORY[g.area].color}><Target strokeWidth={1.5} /></IconChip>
      <div className="min-w-0 flex-1">
        <PeekLink to={{ type: 'goal', id: g.id }} className="block truncate text-body font-medium text-ink hover:underline">{g.title}</PeekLink>
        <p className="truncate text-caption text-ink-3 tabular-nums">{when} · {cur != null ? `latest ${value(cur, g.unit)}, ` : ''}baseline {value(g.baselineValue, g.unit)}, target {target(g)}</p>
      </div>
      {g.status === 'paused' ? (
        <Button variant="ghost" size="sm" disabled={pending || atCap} aria-describedby={atCap ? 'goal-cap-note' : undefined} onClick={() => set('active')}>
          <Play className="size-3.5" strokeWidth={1.5} />Resume
        </Button>
      ) : <Badge color={g.snapshot?.met ? 'var(--good)' : undefined}>{g.snapshot?.met ? 'Reached' : 'Ended early'}</Badge>}
    </li>
  )
}

export function CapNote({ show }: { show: boolean }) {
  if (!show) return null
  return <p id="goal-cap-note" className="rounded-md bg-pill/7 px-3 py-2 text-small text-ink-2">{CAP_MESSAGE}</p>
}

