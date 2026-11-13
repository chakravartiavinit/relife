'use client'

import { useState, useTransition } from 'react'
import { Check, Flag, Info, Pause, Pencil, Target } from 'lucide-react'
import { decideGoalReviewAction, recordGoalCheckInAction } from '@/app/actions'
import { GOAL_FOOTNOTE, applyProposal, goalFields, proposalText, type GoalDecision, type GoalProposal, type GoalSnapshot } from '@/domain/goals'
import { CATEGORY } from '@/ui/tokens'
import { cn } from '@/ui/cn'
import { Button } from '../button'
import { Badge, Card, IconChip, Stat } from '../card'
import { Capsule } from '../capsule'
import { usePeekChanged } from '../peek/peek-context'
import { Field, Input, Textarea } from '../form'
import { GoalStatusBadge } from './goal-card'
import { GoalDialog, Notice, UnitInput, initialFromGoal, type GoalPickerData } from './goal-form'
import { day, target, value, weekday, type GoalViewData } from './format'

// One goal in the weekly review: what you did vs how the outcome moved, then an explicit decision.
// Nothing about the goal changes until the server confirms a choice.

export type ReviewData = {
  id: string; reviewDate: string; snapshot: GoalSnapshot; aiNote: string | null; proposal: GoalProposal | null
  lines: string[]; prompt: string
  /** Set when the review was already decided; the card then opens in its saved state. */
  decision: GoalDecision | null
}

const DECISIONS = [
  { id: 'keep', label: 'Keep', icon: Check, done: 'Kept', hint: 'Nothing changes' },
  { id: 'change', label: 'Change', icon: Pencil, done: 'Changed', hint: 'New date or target' },
  { id: 'pause', label: 'Pause', icon: Pause, done: 'Paused', hint: 'Reviews stop' },
  { id: 'finish', label: 'Finish', icon: Flag, done: 'Finished', hint: 'Ends the goal' },
] as const
export type DecisionId = (typeof DECISIONS)[number]['id']
export const DECISION_DONE: Record<DecisionId, string> = { keep: 'Kept', change: 'Changed', pause: 'Paused', finish: 'Finished' }

export function GoalReviewCard({ g, review, picker, today, onSaved, onNext, last }: {
  g: GoalViewData; review: ReviewData; picker: GoalPickerData; today: string
  /** The flow around the card: told when a choice is saved, and asked to move on (Decide later, Save and next goal). */
  onSaved?: (decision: DecisionId) => void; onNext?: () => void; last?: boolean
}) {
  const color = CATEGORY[g.area].color
  const s = review.snapshot
  const [pending, start] = useTransition()
  const [choice, setChoice] = useState<DecisionId | null>(null)
  const [savedHere, setSaved] = useState<DecisionId | null>(null)
  const saved = savedHere ?? review.decision
  const [error, setError] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)

  const pick = (d: DecisionId) => { setChoice(d); setConfirmFinish(false); setError(null) }
  // Change opens the form (it saves the decision with the edit); Finish asks twice, because a finished goal cannot be resumed.
  const save = () => {
    if (!choice) return
    if (choice === 'change') { setChanging(true); return }
    if (choice === 'finish' && !confirmFinish) { setConfirmFinish(true); return }
    setError(null)
    start(async () => {
      const res = await decideGoalReviewAction({ reviewId: review.id, goalVersion: g.version, decision: choice })
      if (res.ok) { setSaved(choice); onSaved?.(choice); onNext?.() }
      else setError(res.retry ? 'Couldn’t save your choice. Nothing changed. Retry, or pick another option.' : res.error)
    })
  }

  const changeInitial = initialFromGoal(review.proposal ? { ...g, ...applyProposal(goalFields(g), review.proposal) } : g)
  const missing = s.outcome.days?.filter((d) => d.value == null) ?? []

  return (
    <Card as="article" aria-labelledby={`review-${review.id}`}>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconChip color={color}><Target strokeWidth={1.5} /></IconChip>
          <div className="min-w-0">
            <h2 id={`review-${review.id}`} className="text-[16px] leading-7 font-semibold text-ink">{g.title}</h2>
            <p className="-mt-0.5 text-[13px] text-ink-3 tabular-nums">{g.measureKind === 'tracker' ? `${g.measureName} tracker` : `Check-in · ${g.measureName}`} · {day(s.window.from)}–{day(s.window.to)}</p>
          </div>
        </div>
        <GoalStatusBadge g={{ snapshot: s, sensitive: g.sensitive }} />
      </header>

      <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-label="What you did">
          <h3 className="mb-3 font-mono text-[11.5px] font-semibold tracking-[0.08em] text-ink-2 uppercase">What you did</h3>
          <ul className="flex flex-col gap-3">
            {s.actions.map((a) => (
              <li key={`${a.kind}:${a.id}`}>
                <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
                  <span className={cn('min-w-0 truncate', a.available ? 'text-ink' : 'text-ink-3')}>{a.name}</span>
                  <span className="shrink-0 text-[12.5px] text-ink-3 tabular-nums">
                    {!a.available ? 'Not available' : a.kind === 'schedule' ? (a.due ? `${a.done} of ${a.due} days` : 'Nothing due') : a.recordedDays ? `recorded ${a.recordedDays} of ${a.windowDays} days` : 'No record'}
                  </span>
                </div>
                {a.available && a.kind === 'schedule' && a.due ? <Capsule size="sm" className="mt-1.5" value={a.done ?? 0} max={a.due} color={color} label={`${a.name} adherence`} /> : null}
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="How the outcome moved">
          <h3 className="mb-3 font-mono text-[11.5px] font-semibold tracking-[0.08em] text-ink-2 uppercase">How the outcome moved</h3>
          {g.measureKind === 'check_in' && s.outcome.observations === 0 ? (
            <CheckInPanel g={g} today={today} />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="This period" value={s.outcome.current != null ? value(s.outcome.current, g.unit) : '—'} sub={g.measureKind === 'tracker' ? `${s.outcome.observations} of ${s.window.days} days` : `${s.outcome.observations} check-in${s.outcome.observations === 1 ? '' : 's'}`} />
              <Stat label="Baseline" value={value(g.baselineValue, g.unit)} sub={day(g.baselineDate)} />
              <Stat label="Target" value={target(g)} sub={`by ${day(g.targetDate)}`} />
            </div>
          )}
          {s.outcome.days?.length && s.outcome.days.length <= 14 ? (
            <ol className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${s.outcome.days.length}, minmax(0, 1fr))` }} aria-label="Outcome by day">
              {s.outcome.days.map((d) => (
                <li key={d.date} className={cn('flex flex-col items-center rounded-[10px] py-1.5 text-[11.5px] tabular-nums', d.value == null && 'bg-surface-3 shadow-[inset_0_0_0_1px_var(--hairline)] bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--hairline)_4px_5px)]')}
                  style={d.value != null ? { background: `color-mix(in oklch, ${color} 14%, transparent)` } : undefined}>
                  <span className="text-ink-3">{weekday(d.date).slice(0, 2)}</span>
                  <span className="font-semibold text-ink">{d.value == null ? <><span aria-hidden>—</span><span className="sr-only">No data</span></> : value(d.value, null)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {review.lines.filter((l) => l.startsWith('Not enough data')).map((l) => <Notice key={l} tone="warn" icon={Info}>{l}</Notice>)}
        {missing.length && s.outcome.status !== 'not_enough_data' ? <Notice tone="warn" icon={Info}>No data on {missing.length} day{missing.length === 1 ? '' : 's'}. The average uses the {s.outcome.observations} recorded days.</Notice> : null}
        {review.aiNote ? <Notice><span className="font-medium text-ink">Coach note: </span>{review.aiNote}</Notice> : null}
        {review.proposal ? <Notice><span className="font-medium text-ink">Suggested by the coach: </span>{proposalText(review.proposal, g.unit)}</Notice> : null}
        <Notice>{GOAL_FOOTNOTE}</Notice>
      </div>

      <div className="mt-5 border-t border-divider pt-5">
        {saved ? (
          <div role="status" className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
            <Badge color="var(--good)">{DECISIONS.find((d) => d.id === saved)?.done ?? 'Decided'}</Badge>
            <span className="tabular-nums">
              {saved === 'pause' ? 'Paused. Resume it any time on Goals.' : saved === 'finish' ? 'Moved to finished.' : `Next review ${weekday(g.nextReviewOn)}.`}
            </span>
          </div>
        ) : (
          <>
            <p className="mb-3 text-body font-semibold text-pretty text-ink">{review.prompt}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={`Decision for ${g.title}`} aria-busy={pending || undefined}>
              {DECISIONS.map((d) => (
                <button
                  key={d.id} type="button" role="radio" aria-checked={choice === d.id} disabled={pending} onClick={() => pick(d.id)}
                  className="flex min-h-[72px] flex-col items-start gap-1 rounded-md bg-surface-2 p-3 text-start shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color,box-shadow,transform] duration-150 ease-out-quint hover:bg-surface-3 active:scale-[0.96] aria-checked:bg-surface aria-checked:shadow-[inset_0_0_0_2px_var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill disabled:opacity-60"
                >
                  <span className="flex items-center gap-1.5 text-body font-semibold text-ink"><d.icon className="size-4" strokeWidth={1.5} aria-hidden />{d.label}</span>
                  <span className="text-caption text-ink-3">{d.hint}</span>
                </button>
              ))}
            </div>
            {choice ? (
              <div role="status" className="mt-3 rounded-md bg-surface-2 p-3 text-small text-ink-2">
                <span className="mb-1 block font-mono text-label text-ink-3 uppercase">What changes</span>
                {choice === 'keep' ? `Nothing changes. Next review ${weekday(g.nextReviewOn)}.` : null}
                {choice === 'pause' ? 'Reviews and quest links stop. Your routines keep running. Resume any time on Goals.' : null}
                {choice === 'finish' ? `Ends early${s.outcome.current != null ? ` at ${value(s.outcome.current, g.unit)} of ${target(g)}` : ''}. Frees a slot. A finished goal can’t be resumed.` : null}
                {choice === 'change' ? (
                  <>
                    {review.proposal ? `The coach suggests: ${proposalText(review.proposal, g.unit)}. ` : 'Move the target date or the target. '}
                    Your baseline stays locked at {value(g.baselineValue, g.unit)}. <button type="button" onClick={() => setChanging(true)} className="rounded-xs font-medium text-pill-ink underline focus-visible:outline-2 focus-visible:outline-pill">Edit all fields</button>
                  </>
                ) : null}
              </div>
            ) : null}
            {error ? <p role="alert" className="mt-3 rounded-md bg-bad/8 px-3 py-2 text-small text-bad">{error}</p> : null}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {onNext && !last ? <Button variant="ghost" disabled={pending} onClick={onNext}>Decide later</Button> : null}
              <Button variant="primary" size="lg" disabled={!choice || pending} onClick={save}>
                {pending ? 'Saving…' : confirmFinish ? 'Confirm: finish this goal' : choice === 'change' ? 'Edit and save' : last ? 'Save and finish review' : 'Save and next goal'}
              </Button>
            </div>
          </>
        )}
      </div>
      <GoalDialog open={changing} onClose={() => setChanging(false)} picker={picker} today={today} initial={changeInitial}
        mode={{ kind: 'review', goal: g, reviewId: review.id, suggested: review.proposal ? proposalText(review.proposal, g.unit) : undefined }} />
    </Card>
  )
}

/** Record a manual check-in. An empty week stays missing; it is never stored as zero. */
export function CheckInPanel({ g, today, full = false }: { g: GoalViewData; today: string; full?: boolean }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const changed = usePeekChanged()
  const latest = g.snapshot?.outcome.latestCheckIn
  const submit = (form: FormData) => {
    const raw = String(form.get('value') ?? '').trim()
    if (!raw || !Number.isFinite(Number(raw))) { setError('Enter a number.'); return }
    setError(null)
    start(async () => {
      const res = await recordGoalCheckInAction({ goalId: g.id, localDate: String(form.get('date') || today), value: Number(raw), note: String(form.get('note') ?? '') || undefined })
      if (res.ok) { setSaved(true); changed() }
      else setError(res.error)
    })
  }
  return (
    <form action={submit} className={cn('flex flex-col gap-3', !full && 'rounded-md bg-surface-2 p-3')}>
      {!full ? (
        <div>
          <p className="text-[13.5px] font-medium text-ink">No check-in this period yet</p>
          <p className="text-[12.5px] text-ink-3 tabular-nums">{latest ? `Last ${value(latest.value, g.unit)} on ${day(latest.localDate)} · ` : ''}baseline {value(g.baselineValue, g.unit)} · target {target(g)}</p>
        </div>
      ) : null}
      <div className={cn('grid gap-3', full ? 'sm:grid-cols-2' : 'grid-cols-[1fr_auto]')}>
        <Field label={full ? g.measureName : <span className="sr-only">{g.measureName}</span>} htmlFor={`ci-${g.id}`}>
          <UnitInput id={`ci-${g.id}`} name="value" required unit={g.unit ?? undefined} aria-invalid={!!error || undefined} />
        </Field>
        {full ? (
          <Field label="Date" htmlFor={`cid-${g.id}`}><Input id={`cid-${g.id}`} name="date" type="date" max={today} defaultValue={today} /></Field>
        ) : <Button type="submit" className="self-end" disabled={pending}>{pending ? 'Saving…' : 'Save check-in'}</Button>}
      </div>
      {full ? <Field label="Note" htmlFor={`cin-${g.id}`}><Textarea id={`cin-${g.id}`} name="note" maxLength={280} rows={2} placeholder="Optional" /></Field> : null}
      {full ? <div><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Save check-in'}</Button></div> : null}
      {error ? <p role="alert" className="rounded-md bg-bad/8 px-3 py-2 text-[13px] text-bad">{error}</p> : null}
      {saved ? <p role="status" className="text-[12.5px] text-ink-2">Check-in saved.</p> : <p className="text-[12.5px] text-ink-3">Leaving it empty records this period as missing, not as zero.</p>}
    </form>
  )
}
