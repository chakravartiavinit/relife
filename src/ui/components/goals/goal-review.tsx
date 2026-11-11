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
  { id: 'keep', label: 'Keep', icon: Check, done: 'Kept' },
  { id: 'change', label: 'Change', icon: Pencil, done: 'Changed' },
  { id: 'pause', label: 'Pause', icon: Pause, done: 'Paused' },
  { id: 'finish', label: 'Finish', icon: Flag, done: 'Finished' },
] as const
type DecisionId = (typeof DECISIONS)[number]['id']

export function GoalReviewCard({ g, review, picker, today }: { g: GoalViewData; review: ReviewData; picker: GoalPickerData; today: string }) {
  const color = CATEGORY[g.area].color
  const s = review.snapshot
  const [pending, start] = useTransition()
  const [choice, setChoice] = useState<DecisionId | null>(null)
  const [savedHere, setSaved] = useState<DecisionId | null>(null)
  const saved = savedHere ?? review.decision
  const [error, setError] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)

  const decide = (decision: DecisionId) => {
    if (decision === 'change') { setChanging(true); return }
    setChoice(decision); setError(null)
    start(async () => {
      const res = await decideGoalReviewAction({ reviewId: review.id, goalVersion: g.version, decision })
      if (res.ok) setSaved(decision)
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
            <p className="mb-3 text-[14px] font-semibold text-pretty text-ink">{review.prompt}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={`Decision for ${g.title}`} aria-busy={pending || undefined}>
              {DECISIONS.map((d) => (
                <Button key={d.id} size="lg" disabled={pending} onClick={() => decide(d.id)}>
                  <d.icon className="size-4" strokeWidth={1.5} />{pending && choice === d.id ? 'Saving…' : d.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-ink-3">Change opens the goal form. Pause stops reviews and quest links until you resume. Finish moves it to finished.</p>
            {error ? <p role="alert" className="mt-3 rounded-md bg-bad/8 px-3 py-2 text-[13px] text-bad">{error}</p> : null}
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
  const latest = g.snapshot?.outcome.latestCheckIn
  const submit = (form: FormData) => {
    const raw = String(form.get('value') ?? '').trim()
    if (!raw || !Number.isFinite(Number(raw))) { setError('Enter a number.'); return }
    setError(null)
    start(async () => {
      const res = await recordGoalCheckInAction({ goalId: g.id, localDate: String(form.get('date') || today), value: Number(raw), note: String(form.get('note') ?? '') || undefined })
      if (res.ok) setSaved(true)
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
