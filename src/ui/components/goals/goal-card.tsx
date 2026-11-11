'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck, CalendarClock, CircleDashed, Flag, History, Pause, Pencil, Play, Repeat, Sparkles, ChartLine, Target } from 'lucide-react'
import { dismissGoalDraftAction, draftGoalAction, reviewGoalNowAction, setGoalStatusAction } from '@/app/actions'
import { MAX_ACTIVE, type GoalDraft } from '@/domain/goals'
import { CATEGORY } from '@/ui/tokens'
import { cn } from '@/ui/cn'
import { Button, buttonClass } from '../button'
import { Badge, Card, CardHeader, IconChip, Skeleton, Stat } from '../card'
import { Capsule } from '../capsule'
import { RowMenu } from '../row-menu'
import { useToast } from '../toast'
import { GoalDialog, GoalFormButton, initialFromDraft, initialFromGoal, type GoalPickerData } from './goal-form'
import { STATUS_LABEL, coverageLine, day, directionLabel, fill, measureLine, movement, statusColor, target, value, weekday, type GoalViewData } from './format'

export function GoalStatusBadge({ g }: { g: Pick<GoalViewData, 'snapshot' | 'sensitive'> }) {
  if (!g.snapshot) return null
  const s = g.snapshot.outcome.status
  return <Badge color={statusColor(s, g.sensitive)}>{STATUS_LABEL[s]}</Badge>
}

/** Pause / resume / finish outside a review, with the server's answer shown in a toast. */
function useStatusChange(g: GoalViewData) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const set = (status: 'active' | 'paused' | 'finished') => start(async () => {
    const res = await setGoalStatusAction({ goalId: g.id, version: g.version, status })
    toast(res.ok ? { active: 'Goal resumed', paused: 'Goal paused', finished: 'Goal finished' }[status] : res.error, res.ok ? 'good' : 'bad')
  })
  return { pending, set }
}

/** An active goal: baseline → now → target, progress, coverage, next review and linked actions. */
export function OutcomeGoalCard({ g, picker, today }: { g: GoalViewData; picker: GoalPickerData; today: string }) {
  const color = CATEGORY[g.area].color
  const o = g.snapshot?.outcome
  const move = movement(g)
  const { set } = useStatusChange(g)
  const [editing, setEditing] = useState(false)
  const router = useRouter()
  const [, start] = useTransition()
  const outcomeArchived = g.measureKind === 'tracker' && !g.trackerId
  return (
    <Card as="article" aria-labelledby={`goal-${g.id}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconChip color={color}><Target strokeWidth={1.5} /></IconChip>
          <div className="min-w-0">
            <h3 id={`goal-${g.id}`} className="text-[15px] leading-7 font-semibold tracking-[-0.01em] text-ink">
              <Link href={`/goals/${g.id}`} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">{g.title}</Link>
            </h3>
            <p className="-mt-0.5 text-[13px] text-ink-3">{measureLine(g)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <GoalStatusBadge g={g} />
          <RowMenu label={g.title} items={[
            { label: 'Edit', icon: Pencil, onSelect: () => setEditing(true) },
            { label: 'Review now', icon: CalendarCheck, onSelect: () => start(async () => { await reviewGoalNowAction(g.id); router.push('/goals/review') }) },
            { label: 'Pause', icon: Pause, onSelect: () => set('paused') },
            { label: 'Finish', icon: Flag, onSelect: () => set('finished') },
          ]} />
        </div>
      </header>
      <GoalDialog open={editing} onClose={() => setEditing(false)} mode={{ kind: 'edit', goal: g }} initial={initialFromGoal(g)} picker={picker} today={today} />

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Baseline" value={value(g.baselineValue, g.unit)} sub={`${day(g.baselineDate)}${g.baselineObservations ? ` · ${g.baselineObservations} days` : ''}`} />
        <Stat label="Now" value={o?.current != null ? value(o.current, g.unit) : '—'} sub={g.measureKind === 'tracker' ? `Last ${g.snapshot?.window.days ?? 7} days` : o?.latestCheckIn ? `Check-in ${day(o.latestCheckIn.localDate)}` : 'No check-in yet'} />
        <Stat label="Target" value={target(g)} sub={directionLabel(g.direction)} />
      </div>
      <Capsule className="mt-5" value={fill(g.snapshot)} color={color} label={`Progress toward ${g.title}`} />
      <div className="mt-2 flex justify-between gap-3 text-[12.5px] text-ink-3 tabular-nums">
        <span>{move?.since ?? 'No current value yet'}</span>
        <span>{move?.left ?? ''}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-divider pt-4 text-[12.5px] text-ink-3 tabular-nums">
        {outcomeArchived ? <span className="text-ink-2">Tracker archived. Change the measure or finish the goal.</span> : null}
        <span className="flex items-center gap-1.5">
          {o?.status === 'not_enough_data' ? <CircleDashed className="size-3.5" strokeWidth={1.5} aria-hidden /> : <CalendarCheck className="size-3.5" strokeWidth={1.5} aria-hidden />}
          {coverageLine(g)}
        </span>
        <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5" strokeWidth={1.5} aria-hidden />Next review {weekday(g.nextReviewOn)}</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Linked actions">
        {g.actions.map((a, i) => {
          const snap = g.snapshot?.actions[i]
          const gone = snap && !snap.available
          return (
            <li key={`${a.kind}:${a.id}`} className={cn('flex h-8 items-center gap-1.5 rounded-md bg-surface-2 px-2.5 text-[12.5px] font-medium', gone ? 'text-ink-3' : 'text-ink-2')}>
              {a.kind === 'schedule' ? <Repeat className="size-3.5" strokeWidth={1.5} aria-hidden /> : <ChartLine className="size-3.5" strokeWidth={1.5} aria-hidden />}
              {gone ? <span><s>{g.actionNames[i]}</s> · Action no longer available</span> : g.actionNames[i]}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** "Review due": a count and one way in. The cards themselves live on /goals/review. */
export function ReviewDueCard({ count, date }: { count: number; date: string }) {
  return (
    <Card>
      <CardHeader icon={<CalendarCheck strokeWidth={1.5} />} color="var(--pill)" title="Weekly review" description={weekday(date)} />
      <p className="text-[13.5px] leading-relaxed text-ink-2">Compare what you did with how each outcome moved, then keep, change, pause or finish each goal.</p>
      <Link href="/goals/review" className={buttonClass({ variant: 'secondary', size: 'md', className: 'mt-4' })}>Review {count} {count === 1 ? 'goal' : 'goals'}</Link>
    </Card>
  )
}

/** Ask the coach for one draft from the goals text in Settings. Hidden without a model. */
export function SuggestDraftCard({ profileGoals, atCap }: { profileGoals: string | null; atCap: boolean }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <Card aria-busy={pending || undefined} className="isolate overflow-hidden">
      <div aria-hidden className="halftone inset-y-0 right-0 -z-10 w-1/2 opacity-40" style={{ '--tone': 'var(--pill)' } as React.CSSProperties} />
      <CardHeader icon={<Sparkles strokeWidth={1.5} />} color="var(--pill)" title="Draft from your profile" />
      <p className="text-[13.5px] leading-relaxed text-ink-2">Your coach can turn your profile goals into a goal draft. Nothing starts until you approve it.</p>
      {profileGoals ? <p className="mt-2 line-clamp-2 text-[12.5px] text-ink-3">From your profile: “{profileGoals}”</p>
        : <p className="mt-2 text-[12.5px] text-ink-3">Add your goals in <Link href="/settings" className="underline">Settings</Link> first.</p>}
      {pending ? (
        <div className="mt-4 flex flex-col gap-2" role="status">
          <span className="text-[12.5px] text-ink-3">Drafting a goal from your profile…</span>
          <Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" />
        </div>
      ) : null}
      {message ? <p role="status" className={cn('mt-3 rounded-md px-3 py-2 text-[13px]', message.ok ? 'bg-good/10 text-ink-2' : 'bg-warn/10 text-ink-2')}>{message.text}</p> : null}
      <Button className="mt-4" disabled={pending || !profileGoals || atCap} aria-describedby={atCap ? 'goal-cap-note' : undefined}
        onClick={() => start(async () => { const r = await draftGoalAction(); setMessage({ ok: r.ok, text: r.message }) })}>
        <Sparkles className="size-4" strokeWidth={1.5} />{pending ? 'Drafting…' : 'Suggest a draft'}
      </Button>
    </Card>
  )
}

/** A pending AI draft: review it in the form (saving approves it) or dismiss it. */
export function GoalDraftCard({ insightId, draft, picker, today, activeCount }: { insightId: string; draft: GoalDraft; picker: GoalPickerData; today: string; activeCount: number }) {
  const [pending, start] = useTransition()
  const measure = 'tracker' in draft.measure ? picker.trackers.find((t) => t.slug === (draft.measure as { tracker: string }).tracker)?.name ?? 'Tracker' : `Check-in · ${(draft.measure as { checkIn: string }).checkIn}`
  const unit = 'tracker' in draft.measure ? picker.trackers.find((t) => t.slug === (draft.measure as { tracker: string }).tracker)?.unit ?? null : (draft.measure as { unit?: string }).unit ?? null
  const atCap = activeCount >= MAX_ACTIVE
  return (
    <Card>
      <p className="mb-2 text-[12px] font-semibold text-pill-ink">Suggested by the coach</p>
      <h3 className="text-[15px] font-semibold text-ink">{draft.title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{draft.reason}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px] tabular-nums">
        <dt className="text-ink-3">Measure</dt><dd className="text-ink-2">{measure}</dd>
        <dt className="text-ink-3">Target</dt><dd className="text-ink-2">{target({ direction: draft.direction, target: draft.target ?? null, rangeLow: draft.rangeLow ?? null, rangeHigh: draft.rangeHigh ?? null, unit })} by {day(draft.targetDate)}</dd>
        <dt className="text-ink-3">Baseline</dt><dd className="text-ink-2">You set it when you review the draft</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <GoalFormButton variant="primary" mode={{ kind: 'draft', activeCount, insightId }} initial={initialFromDraft(draft, picker, today)} picker={picker} today={today} disabled={atCap}>Review draft</GoalFormButton>
        <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await dismissGoalDraftAction(insightId) })}>Dismiss</Button>
      </div>
    </Card>
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
  const { pending, set } = useStatusChange(g)
  const cur = g.snapshot?.outcome.current
  const when = g.status === 'paused' ? `Paused ${g.pausedAt ? day(g.pausedAt.toISOString().slice(0, 10)) : ''}` : `Finished ${g.finishedAt ? day(g.finishedAt.toISOString().slice(0, 10)) : ''}`
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <IconChip color={CATEGORY[g.area].color}><Target strokeWidth={1.5} /></IconChip>
      <div className="min-w-0 flex-1">
        <Link href={`/goals/${g.id}`} className="block truncate text-[14px] font-medium text-ink hover:underline">{g.title}</Link>
        <p className="truncate text-[12.5px] text-ink-3 tabular-nums">{when} · {cur != null ? `latest ${value(cur, g.unit)}, ` : ''}baseline {value(g.baselineValue, g.unit)}, target {target(g)}</p>
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
  return <p id="goal-cap-note" className="rounded-md bg-pill/7 px-3 py-2 text-[13px] text-ink-2">You have {MAX_ACTIVE} active goals. Pause or finish one first.</p>
}

