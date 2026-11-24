'use client'

import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck, ChevronRight, Flag, Pause, Pencil, Play } from 'lucide-react'
import { dismissGoalDraftAction, draftGoalAction, reviewGoalNowAction, setGoalStatusAction } from '@/app/actions'
import { actionStatus, CAP_MESSAGE, feedLine, MAX_ACTIVE, type GoalDraft, type OutcomeStatus } from '@/domain/goals'
import type { Pace } from '@/domain/day-plan'
import type { PeekRef } from '@/domain/peek'
import { statusOf, type StatusTone } from '@/domain/status-of'
import { CATEGORY } from '@/ui/tokens'
import type { PictureRef } from '@/ui/picture'
import { cn } from '@/ui/cn'
import { Button, buttonClass, buttonLinkClass } from '../button'
import { Card } from '../card'
import { LevelBar } from '../capsule'
import { Fold } from '../fold'
import { Picture } from '../picture'
import { RowMenu } from '../row-menu'
import { StatusRow } from '../status-row'
import { StatusWord } from '../status-word'
import { useToast } from '../toast'
import { usePeekChanged } from '../peek/peek-context'
import { PeekLink } from '../peek/peek-link'
import { GoalDialog, GoalFormButton, NewGoalButton, initialFromDraft, initialFromGoal, type GoalPickerData } from './goal-form'
import { formatDay } from '@/core/time'
import { STATUS_LABEL, day, feedRowLine, goalLine, goalPicture, paceOf, target, value, weekday, type GoalFeed, type GoalViewData } from './format'

const OUTCOME_TONE: Record<OutcomeStatus, StatusTone> = { met: 'good', toward: 'good', flat: 'neutral', away: 'warn', not_enough_data: 'quiet' }

/** The outcome in words (Toward target, Not enough data) as a status word. Sensitive measures stay neutral whatever the direction. */
export function OutcomeWord({ status, sensitive }: { status: OutcomeStatus; sensitive: boolean }) {
  return <StatusWord tone={sensitive ? 'neutral' : OUTCOME_TONE[status]}>{STATUS_LABEL[status]}</StatusWord>
}

export function GoalStatusBadge({ g }: { g: Pick<GoalViewData, 'snapshot' | 'sensitive'> }) {
  return g.snapshot ? <OutcomeWord status={g.snapshot.outcome.status} sensitive={g.sensitive} /> : null
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


/** The pace board: every active goal with its pace word, the bar from baseline to target and what feeds it, then the free-slot well in `children`. */
export function GoalsBoard({ goals, picker, today, feeds, children }: { goals: GoalViewData[]; picker: GoalPickerData; today: string; feeds?: Record<string, GoalFeed>; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-1 flex-col p-0" aria-labelledby="active-goals">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 pt-6 sm:px-6">
        <h2 id="active-goals" className="font-display text-heading text-ink">Goals on pace</h2>
        <p className="text-small text-ink-3">From where you started to the target</p>
      </header>
      {goals.map((g) => <OutcomeGoalRow key={g.id} g={g} pace={paceOf(g, today)} feed={feeds?.[g.id]} />)}
      {children ? <div className="mx-5 mt-1 mb-5 sm:mx-6 sm:mb-6">{children}</div> : <div className="pb-2" />}
    </Card>
  )
}

/** Two dots joined by a dashed line, in the goal's area colour: the same mark a Connection opens with. */
function PairMark({ color }: { color: string }) {
  return (
    <svg aria-hidden width="30" height="12" viewBox="0 0 30 12" className="shrink-0">
      <circle cx="5" cy="6" r="4" fill={color} />
      <path d="M10 6h10" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3" />
      <circle cx="25" cy="6" r="4" fill={color} />
    </svg>
  )
}

/** An active goal: its picture, pace word, the bar from baseline to target with the pace tick, one line of where it is, and what feeds it. */
function OutcomeGoalRow({ g, pace, feed }: { g: GoalViewData; pace: Pace | null; feed?: GoalFeed }) {
  const color = CATEGORY[g.area].color
  const word = pace && pace.label !== 'Too early' ? statusOf({ from: 'goal', pace }).word : null
  const line = goalLine(g)
  const showTick = pace && pace.label !== 'Reached' && pace.label !== 'Too early'
  return (
    <article aria-labelledby={`goal-${g.id}`} className="flex flex-col gap-3 border-t border-divider px-5 py-5 first-of-type:border-t-0 sm:px-6">
      <h3 id={`goal-${g.id}`} className="m-0 font-normal">
        <PeekLink
          to={{ type: 'goal', id: g.id }}
          aria-label={`${g.title}${word ? `, ${word.toLowerCase()}` : ''}. Open goal`}
          className="-mx-2 -my-1 grid grid-cols-[32px_minmax(0,1fr)_auto_16px] items-center gap-x-3 rounded-md px-2 py-1 transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill"
        >
          <Picture {...goalPicture(g)} size={32} />
          <span className="min-w-0 text-heading text-ink text-pretty">{g.title}</span>
          <span className="justify-self-end">{word ? <StatusWord status={word} /> : <GoalStatusBadge g={g} />}</span>
          <ChevronRight aria-hidden strokeWidth={1.5} className="size-4 text-ink-3" />
        </PeekLink>
      </h3>
      {/* The ink tick is where the pace says you should be today: past it is ahead, short of it is behind. */}
      <div className="relative">
        <LevelBar value={Math.max(0, Math.min(1, g.snapshot?.outcome.progressShare ?? 0))} color={color} size="md" segments={20} label={`Progress toward ${g.title}, from baseline to target`} />
        {showTick ? <span aria-hidden className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${pace.elapsed * 100}%` }} /> : null}
      </div>
      <p className="text-body text-ink-2">
        {line ? <><b className="font-semibold text-ink">{line.figure}</b>{line.rest}</> : g.measureKind === 'check_in' ? 'No check-in yet.' : 'No current value yet.'}
      </p>
      {g.trackerArchived ? <p className="text-small text-ink-2">Tracker archived. Change the measure or finish the goal.</p> : null}
      {g.actions.length ? <FeedWell g={g} feed={feed} color={color} /> : <p className="text-small text-ink-3">No linked actions. Edit the goal to link a routine or tracker.</p>}
    </article>
  )
}

/** "What feeds it": the linked routines and trackers with their week as a status word, then one plain line and where to see the days. */
function FeedWell({ g, feed, color }: { g: GoalViewData; feed?: GoalFeed; color: string }) {
  const s = g.snapshot
  const sentence = feed?.change ? null : s ? feedLine(s.adherence, s.outcome.status) : null
  const seeDays: PeekRef = feed?.change?.peek ?? { type: 'goal', id: g.id }
  return (
    <section aria-label={`What feeds ${g.title}`} className="mt-1 flex flex-col gap-2 rounded-lg bg-surface-2 px-4 py-3.5">
      <p className="flex items-center gap-2 text-label text-ink-2">
        <PairMark color={color} />
        What feeds it
        {s ? <span className="font-normal text-ink-3">· {day(s.window.from)} – {day(s.window.to)}</span> : null}
      </p>
      <div>
        {g.actions.map((a, i) => {
          const snap = s?.actions[i]
          const name = g.actionNames[i]
          const picture: PictureRef = a.kind === 'schedule' ? { of: 'routine', name, area: g.area } : { of: 'tracker', name, area: g.area }
          return (
            <StatusRow
              key={`${a.kind}:${a.id}`} picture={picture} name={name} line={snap ? feedRowLine(snap) : undefined}
              status={snap ? actionStatus(snap) : undefined} peek={feed?.peeks[i] ?? undefined} className="hover-fine:bg-surface-3"
            />
          )
        })}
      </div>
      {feed?.change ? (
        <p className="pt-1 text-body text-ink">{feed.change.parts.map((p, i) => (p.bold ? <b key={i} className="font-semibold">{p.text}</b> : <span key={i}>{p.text}</span>))}</p>
      ) : sentence ? <p className="pt-1 text-body text-ink">{sentence}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-ink-3">{feed?.change ? feed.change.caption : 'Moving together, not proof'}</span>
        <PeekLink to={seeDays} className={buttonLinkClass('text-small', { target: true })}>See the days</PeekLink>
      </div>
    </section>
  )
}

/** The goal's "…" menu: edit, review now, pause or resume, finish. It lives in the goal's Peek, where the rest of the goal is. */
export function GoalMenu({ g, picker, today, activeCount, reviewDue = false }: { g: GoalViewData; picker: GoalPickerData; today: string; activeCount: number; reviewDue?: boolean }) {
  const { set, reviewNow } = useGoalActions(g)
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  if (g.status === 'finished') return null
  const atCap = g.status === 'paused' && activeCount >= MAX_ACTIVE
  return (
    <>
      <RowMenu label={g.title} items={[
        { label: 'Edit', icon: Pencil, onSelect: () => setEditing(true) },
        ...(g.status === 'active'
          ? [{ label: reviewDue ? 'Review' : 'Review now', icon: CalendarCheck, onSelect: reviewDue ? () => router.push('/plan/review') : reviewNow }, { label: 'Pause', icon: Pause, onSelect: () => set('paused') }]
          : atCap ? [] : [{ label: 'Resume', icon: Play, onSelect: () => set('active') }]),
        { label: 'Finish', icon: Flag, onSelect: () => set('finished'), danger: true },
      ]} />
      <GoalDialog open={editing} onClose={() => setEditing(false)} mode={{ kind: 'edit', goal: g }} initial={initialFromGoal(g)} picker={picker} today={today} />
    </>
  )
}

/** The slot well under the goals: how many slots are free and the one New goal button (it also opens on /plan?new=1). */
export function FreeSlot({ slots, today, picker, activeCount, drafts }: { slots: number; today: string; picker: GoalPickerData; activeCount: number; drafts: React.ComponentProps<typeof NewGoalButton>['drafts'] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-lg bg-surface-2 p-4">
      <Picture of="nav" to="/plan" size={40} />
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-body font-medium text-ink">{slots === 1 ? `Slot ${MAX_ACTIVE} is free` : `${slots} slots are free`}</p>
        <p className="text-small text-ink-3">Start from the coach draft or any tracker {brand.name} already fills.</p>
      </div>
      <NewGoalButton variant="secondary" today={today} picker={picker} activeCount={activeCount} listenToUrl drafts={drafts} />
    </div>
  )
}

/** The weekly review in the rail: the week's days per goal, the coach's note, and the one primary action. The cards live on /plan/review. */
export type ReviewDueGoal = {
  id: string; title: string; status: OutcomeStatus | null; sensitive: boolean
  /** The goal's tracker picture and "Typing speed, wpm". */
  picture?: PictureRef; measure?: string
  /** Tracker goals: the week's days, null where nothing was recorded. */
  days?: { date: string; value: number | null }[]
  note?: string | null
}

/** The week as small bars, each scaled between the week's lowest and highest; a day with no record is a hairline, never a zero. */
function WeekBars({ days, label }: { days: { date: string; value: number | null }[]; label: string }) {
  const real = days.flatMap((d) => (d.value == null ? [] : [d.value]))
  const lo = Math.min(...real), span = Math.max(...real) - lo || 1
  const names = days.map((d) => formatDay(d.date, { weekday: 'short' }).slice(0, 2))
  return (
    <div role="img" aria-label={`${label}: ${days.map((d, i) => `${names[i]} ${d.value == null ? 'no record' : value(d.value)}`).join(', ')}`}
      className="grid items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((d, i) => (
        <span key={d.date} className="flex flex-col items-center gap-1.5">
          <span aria-hidden className="flex h-11 w-full items-end">
            <span className={cn('block w-full rounded-xs', d.value == null ? 'h-px bg-ink/25' : 'bg-pill')} style={d.value == null ? undefined : { height: 14 + ((d.value - lo) / span) * 30 }} />
          </span>
          <span aria-hidden className="text-caption text-ink-3">{names[i]}</span>
        </span>
      ))}
    </div>
  )
}

export function ReviewDueCard({ goals, date, today, window }: { goals: ReviewDueGoal[]; date: string; today?: string; window?: { from: string; to: string } }) {
  const range = window ? `${formatDay(window.from, { day: 'numeric', month: 'short' })} – ${formatDay(window.to, { day: 'numeric', month: 'short' })}` : null
  return (
    <Card as="section" aria-labelledby="weekly-review" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <p id="weekly-review" className="text-label text-ink-2">Weekly review{range ? <span className="font-normal text-ink-3"> · {range}</span> : null}</p>
        <StatusWord tone="warn">{today === undefined || date === today ? 'Due today' : `Due ${weekday(date)}`}</StatusWord>
      </div>
      <ul className="flex flex-col gap-5">
        {goals.map((g) => {
          const days = g.days && g.days.length <= 7 && g.days.some((d) => d.value != null) ? g.days : null
          const missing = days?.filter((d) => d.value == null).length ?? 0
          return (
            <li key={g.id} className="flex min-w-0 flex-col gap-3">
              <h3 className="flex min-w-0 items-center gap-2.5 font-display text-heading text-ink">
                {g.picture ? <Picture {...g.picture} size={32} /> : null}
                <PeekLink to={{ type: 'goal', id: g.id }} className="min-w-0 rounded-xs text-pretty hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">{g.title}</PeekLink>
              </h3>
              <div className="flex items-baseline justify-between gap-3 text-small text-ink-3">
                <span className="min-w-0 truncate">{g.measure ?? 'Outcome'}</span>
                {g.status ? <OutcomeWord status={g.status} sensitive={g.sensitive} /> : null}
              </div>
              {days ? <WeekBars days={days} label={g.measure ?? 'This week'} /> : null}
              {days && missing ? <p className="text-caption text-ink-3">No data on {missing} {missing === 1 ? 'day' : 'days'}. The average uses the {days.length - missing} recorded.</p> : null}
              {g.note ? (
                <div className="rounded-lg bg-surface-2 px-4 py-3">
                  <p className="text-label text-ink">Coach note</p>
                  <p className="mt-1 text-small text-ink-2">{g.note}</p>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      <Link href="/plan/review" className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}>Start review</Link>
      <p className="-mt-2 text-center text-caption text-ink-3">About 2 minutes. Nothing changes until you choose.</p>
    </Card>
  )
}

/** The rail card for the free slot: the coach's drafts and the ask for one more. */
export function CoachDraftsCard({ freeSlots, children }: { freeSlots: number; children: React.ReactNode }) {
  return (
    <Card as="section" aria-labelledby="coach-drafts" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <p id="coach-drafts" className="text-label text-ink-2">Suggested by the coach</p>
        <span className="text-small text-ink-3">{freeSlots > 0 ? `For slot ${MAX_ACTIVE - freeSlots + 1}` : 'Waits for a free slot'}</span>
      </div>
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
        : <p className="mt-2 text-small text-ink-3">Add your goals in <Link href="/you/settings" className={buttonLinkClass()}>Settings</Link> first.</p>}
      {pending ? (
        <div className="mt-4 flex flex-col gap-2" role="status">
          <span className="text-caption text-ink-3">Drafting a goal from your profile…</span>
          <span className="h-3 w-3/4 animate-pulse rounded-md bg-ink/[0.05]" /><span className="h-3 w-1/2 animate-pulse rounded-md bg-ink/[0.05]" />
        </div>
      ) : null}
      {message ? <p role="status" className={cn('mt-3 rounded-md px-3 py-2 text-small', message.ok ? 'bg-good/10 text-ink-2' : 'bg-warn/10 text-ink-2')}>{message.text}</p> : null}
      <Button className="mt-4" size="sm" variant="secondary" disabled={pending || !profileGoals || atCap} aria-describedby={atCap ? 'goal-cap-note' : undefined}
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
  const measure = 'tracker' in m ? tracker?.name ?? 'Tracker' : 'Check-in'
  const unit = 'tracker' in m ? tracker?.unit ?? null : m.unit ?? null
  const atCap = activeCount >= MAX_ACTIVE
  const goal = target({ direction: draft.direction, target: draft.target ?? null, rangeLow: draft.rangeLow ?? null, rangeHigh: draft.rangeHigh ?? null, unit })
  return (
    <div>
      <h3 className="flex items-start gap-3 text-body font-medium text-ink">
        <Picture of="tracker" name={tracker?.name ?? draft.title} area={draft.area} size={32} />
        <span className="min-w-0 pt-1 text-pretty">{draft.title}</span>
      </h3>
      <p className="mt-2 text-small text-ink-2">{draft.reason} {measure}, {goal} by {day(draft.targetDate)}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <GoalFormButton variant="secondary" size="sm" mode={{ kind: 'draft', activeCount, insightId, packName: draft.origin ? draft.origin.name ?? 'starter' : undefined }} initial={initialFromDraft(draft, picker, today)} picker={picker} today={today} disabled={atCap} describedBy={atCap ? 'goal-cap-note' : undefined}>Review draft</GoalFormButton>
        <Button variant="quiet" size="sm" disabled={pending} onClick={() => start(async () => { await dismissGoalDraftAction(insightId) })}>Dismiss</Button>
      </div>
    </div>
  )
}

/** The rail's two folds: how pace works, then paused and finished goals (newest first; finished goals are read-only). */
export function GoalFolds({ goals, activeCount }: { goals: GoalViewData[]; activeCount: number }) {
  const paused = goals.filter((g) => g.status === 'paused').length
  const finished = goals.filter((g) => g.status === 'finished').length
  return (
    // A plain wrapper takes the rail's "last card grows" rule, so the card keeps its own height.
    <div className="min-w-0">
    <Card as="section" aria-label="More about goals" className="py-2 [&>details+details]:border-t [&>details+details]:border-divider">
      <Fold title="How pace works" summary="Bar, tick and the words">
        <ul aria-label="How to read the bars" className="flex flex-wrap items-center gap-x-5 gap-y-1 py-1 text-small text-ink-2">
          <li className="flex items-center gap-2"><span aria-hidden className="h-2 w-4 rounded-xs bg-ink-2" />Baseline to target</li>
          <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-0.5 rounded-full bg-ink" />Where you should be by now</li>
        </ul>
        <p className="pt-1 pb-3 text-small text-ink-3">Ahead: more than 10% past the tick. On track: within 10% of it. Behind: more than 10% short. Quiet: too early, not enough records yet.</p>
      </Fold>
      {goals.length ? (
        <Fold title="Paused and finished" summary={[paused ? `${paused} paused` : '', finished ? `${finished} finished` : ''].filter(Boolean).join(', ')}>
          <ul className="pb-2">
            {goals.map((g) => <PausedRow key={g.id} g={g} atCap={activeCount >= MAX_ACTIVE} />)}
          </ul>
        </Fold>
      ) : null}
    </Card>
    </div>
  )
}

function PausedRow({ g, atCap }: { g: GoalViewData; atCap: boolean }) {
  const { pending, set } = useGoalActions(g)
  const cur = g.snapshot?.outcome.current
  const when = g.status === 'paused' ? `Paused ${g.pausedOn ? day(g.pausedOn) : ''}` : `Finished ${g.finishedOn ? day(g.finishedOn) : ''}`
  return (
    <li className="flex items-center gap-3 [&+&]:shadow-[0_-1px_0_var(--divider)]">
      <PeekLink to={{ type: 'goal', id: g.id }} className="-mx-2 grid min-h-14 min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)] items-center gap-x-3 rounded-md px-2 py-2 transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill">
        <Picture {...goalPicture(g)} size={32} />
        <span className="min-w-0">
          <span className="block text-body font-medium text-ink max-sm:line-clamp-2 sm:truncate">{g.title}</span>
          <span className="block text-small text-ink-3 max-sm:line-clamp-2 sm:truncate">{when}{g.status === 'finished' ? (g.snapshot?.met ? ' · target met' : ' · ended early') : cur != null ? ` · latest ${value(cur, g.unit)}` : ''}</span>
        </span>
      </PeekLink>
      {g.status === 'paused' ? (
        <Button variant="quiet" size="sm" disabled={pending || atCap} aria-describedby={atCap ? 'goal-cap-note' : undefined} onClick={() => set('active')}>
          <Play className="size-3.5" strokeWidth={1.5} />Resume
        </Button>
      ) : <StatusWord tone={g.snapshot?.met ? 'good' : 'quiet'}>{g.snapshot?.met ? 'Reached' : 'Ended early'}</StatusWord>}
    </li>
  )
}

export function CapNote({ show }: { show: boolean }) {
  if (!show) return null
  return <p id="goal-cap-note" className="rounded-md bg-pill/7 px-3 py-2 text-small text-ink-2">{CAP_MESSAGE}</p>
}
