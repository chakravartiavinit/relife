'use client'

import { useActionState, useEffect, useId, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, ChartLine, ClipboardCheck, Info, Plus, Target, TriangleAlert, type LucideIcon } from 'lucide-react'
import { decideGoalReviewAction, saveGoal, type GoalFormState } from '@/app/actions'
import { addDays } from '@/core/time'
import { CATEGORIES, type Category } from '@/db/schema'
import { MAX_ACTIONS, MAX_ACTIVE, type GoalDraft } from '@/domain/goals'
import { CATEGORY } from '@/ui/tokens'
import { cn } from '@/ui/cn'
import { Button } from '../button'
import { Badge } from '../card'
import { Field, Input, Segmented, Select, Textarea } from '../form'
import { useToast } from '../toast'
import { Dialog, FormError } from '../forms/dialog'
import { CADENCE_LABEL, day, directionLabel, type GoalViewData } from './format'

// Create, edit, review-change and draft-approval form for an outcome goal. The server owns the baseline:
// "use recorded" is recomputed there, and the measure and baseline are locked after a goal starts.

export type PickerTracker = {
  id: string; slug: string; name: string; unit: string | null; category: Category; kind: string
  sensitive: boolean; activity: boolean; observations: number; strip: boolean[]
  baseline: { value: number; observations: number; how: string; date: string } | null
}
export type GoalPickerData = { trackers: PickerTracker[]; routines: { id: string; name: string; category: Category }[] }

export type GoalFormInitial = {
  title: string; reason: string; area: Category
  measureKind: 'tracker' | 'check_in'; trackerId: string | null; measureName: string; unit: string
  direction: 'increase' | 'decrease' | 'range'; target: string; rangeLow: string; rangeHigh: string
  baselineValue: string; baselineDate: string; baselineHow: string
  targetDate: string; cadence: 'weekly' | 'fortnightly' | 'monthly'; actions: string[]
}

type Mode =
  | { kind: 'create'; activeCount: number }
  | { kind: 'draft'; activeCount: number; insightId: string }
  | { kind: 'edit'; goal: GoalViewData }
  | { kind: 'review'; goal: GoalViewData; reviewId: string; suggested?: string }

const blank = (today: string): GoalFormInitial => ({
  title: '', reason: '', area: 'skills', measureKind: 'tracker', trackerId: null, measureName: '', unit: '',
  direction: 'increase', target: '', rangeLow: '', rangeHigh: '', baselineValue: '', baselineDate: today, baselineHow: '',
  targetDate: '', cadence: 'weekly', actions: [],
})

const str = (v: number | null | undefined) => (v == null ? '' : String(v))
/** A tracker's recorded 28-day average, rounded for the baseline field, or '' without one. */
const recordedBaseline = (t: PickerTracker | undefined) => (t?.baseline ? String(Math.round(t.baseline.value * 100) / 100) : '')

export function initialFromGoal(g: GoalViewData): GoalFormInitial {
  return {
    title: g.title, reason: g.reason, area: g.area, measureKind: g.measureKind, trackerId: g.trackerId, measureName: g.measureName, unit: g.unit ?? '',
    direction: g.direction, target: str(g.target), rangeLow: str(g.rangeLow), rangeHigh: str(g.rangeHigh),
    baselineValue: str(g.baselineValue), baselineDate: g.baselineDate, baselineHow: g.baselineHow,
    targetDate: g.targetDate, cadence: g.cadence, actions: g.actions.map((a) => `${a.kind}:${a.id}`),
  }
}

export function initialFromDraft(d: GoalDraft, picker: GoalPickerData, today: string): GoalFormInitial {
  const m = d.measure
  const t = 'tracker' in m ? picker.trackers.find((x) => x.slug === m.tracker) : undefined
  const check = 'checkIn' in m ? m : null
  return {
    ...blank(today), title: d.title, reason: d.reason, area: d.area,
    measureKind: t ? 'tracker' : 'check_in', trackerId: t?.id ?? null,
    measureName: t?.name ?? check?.checkIn ?? '', unit: t?.unit ?? check?.unit ?? '', baselineHow: check?.how ?? '',
    direction: d.direction, target: str(d.target), rangeLow: str(d.rangeLow), rangeHigh: str(d.rangeHigh),
    targetDate: d.targetDate, cadence: d.cadence, actions: d.actions.map((a) => `${a.kind}:${a.id}`),
  }
}

export function GoalDialog({ open, onClose, mode, initial, picker, today }: {
  open: boolean; onClose: () => void; mode: Mode; initial: GoalFormInitial; picker: GoalPickerData; today: string
}) {
  const title = { create: 'New goal', draft: 'Review goal draft', edit: 'Edit goal', review: 'Change goal' }[mode.kind]
  return (
    <Dialog open={open} onClose={onClose} title={title} icon={Target} color={CATEGORY[initial.area].color} width="max-w-[600px]"
      description="Say what you’ll measure, where you start and where you want to be.">
      {open ? <GoalForm mode={mode} initial={initial} picker={picker} today={today} onDone={onClose} /> : null}
    </Dialog>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-divider pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="contents">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
      </legend>
      {hint ? <p className="-mt-3 text-[12.5px] text-ink-3">{hint}</p> : null}
      {children}
    </fieldset>
  )
}

export function UnitInput({ unit, error, ...props }: React.ComponentProps<'input'> & { unit?: string; error?: string }) {
  return (
    <div className="relative">
      <Input type="number" step="any" inputMode="decimal" aria-invalid={!!error || undefined} className={cn(unit && 'pr-12', error && 'shadow-[0_0_0_1.5px_var(--bad)]')} {...props} />
      {unit ? <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-ink-3">{unit}</span> : null}
    </div>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-[12.5px] text-bad">{message}</p> : null
}

/** 28 baseline days, oldest first. Recorded days use the area colour; missing days are striped, never zero. */
export function ObservationStrip({ strip, color, from, to }: { strip: boolean[]; color: string; from: string; to: string }) {
  const recorded = strip.filter(Boolean).length
  return (
    <div>
      <div role="img" aria-label={`${recorded} of ${strip.length} days recorded`} className="grid grid-cols-[repeat(28,minmax(0,1fr))] gap-[3px]">
        {strip.map((on, i) => (
          <span key={i} className={cn('h-5 rounded-[4px]', !on && 'bg-surface-3 shadow-[inset_0_0_0_1px_var(--hairline)] bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--hairline)_3px_4px)]')}
            style={on ? { background: `color-mix(in oklch, ${color} 55%, transparent)` } : undefined} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-ink-3 tabular-nums"><span>{day(from)}</span><span>{day(to)}</span></div>
    </div>
  )
}

export function Notice({ tone = 'info', icon: Icon = tone === 'warn' ? TriangleAlert : Info, children }: { tone?: 'info' | 'warn'; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <p className={cn('flex gap-2 rounded-md px-3 py-2 text-[13px] leading-relaxed text-ink-2', tone === 'warn' ? 'bg-warn/10' : 'bg-pill/7')}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} style={{ color: tone === 'warn' ? 'var(--warn)' : 'var(--pill)' }} />
      <span>{children}</span>
    </p>
  )
}

function GoalForm({ mode, initial, picker, today, onDone }: { mode: Mode; initial: GoalFormInitial; picker: GoalPickerData; today: string; onDone: () => void }) {
  const locked = mode.kind === 'edit' || mode.kind === 'review'
  const goal = locked ? mode.goal : null
  const submit = async (prev: GoalFormState, form: FormData): Promise<GoalFormState> => {
    if (mode.kind !== 'review') return saveGoal(prev, form)
    const n = (k: string) => { const v = form.get(k); return v === '' || v == null ? null : Number(v) }
    const res = await decideGoalReviewAction({
      reviewId: mode.reviewId, goalVersion: mode.goal.version, decision: 'change',
      change: {
        title: String(form.get('title') ?? ''), reason: String(form.get('reason') ?? ''),
        target: mode.goal.direction === 'range' ? null : n('target'), rangeLow: mode.goal.direction === 'range' ? n('rangeLow') : null, rangeHigh: mode.goal.direction === 'range' ? n('rangeHigh') : null,
        targetDate: String(form.get('targetDate') ?? ''), cadence: String(form.get('cadence')) as GoalFormInitial['cadence'],
        actions: form.getAll('actions').map(String).map((v) => { const [kind, id] = v.split(':'); return { kind: kind as 'schedule' | 'tracker', id } }),
      },
    })
    if (res.ok) return { ok: true }
    // Field errors show next to their field; only form-level ones go in the banner.
    return 'errors' in res && res.errors ? { ok: false, errors: res.errors, error: res.errors.form } : { ok: false, error: res.error }
  }
  const [state, action, pending] = useActionState(submit, null)
  const [measureKind, setMeasureKind] = useState(initial.measureKind)
  const [trackerId, setTrackerId] = useState(initial.trackerId ?? '')
  const [direction, setDirection] = useState(initial.direction)
  const [area, setArea] = useState(initial.area)
  const [actions, setActions] = useState<string[]>(initial.actions)
  const tracker = picker.trackers.find((t) => t.id === trackerId)
  const [baseline, setBaseline] = useState(() =>
    initial.baselineValue || (!locked && initial.measureKind === 'tracker' ? recordedBaseline(picker.trackers.find((t) => t.id === initial.trackerId)) : ''))
  const suggested = !locked && measureKind === 'tracker' && tracker?.baseline ? recordedBaseline(tracker) : null
  const useRecorded = suggested != null && (baseline === '' || baseline === suggested)
  const toast = useToast()
  const router = useRouter()
  const id = useId()
  const errors = state && !state.ok ? state.errors ?? {} : {}
  const stale = !!state && !state.ok && /changed (in another window|somewhere else)|already has a decision/.test(state.error ?? '')

  useEffect(() => {
    if (state?.ok) {
      toast(mode.kind === 'create' || mode.kind === 'draft' ? 'Goal started' : 'Goal saved', 'good')
      onDone()
    }
  }, [state, mode.kind, onDone, toast])

  // A new tracker brings its own suggested baseline.
  const pickTracker = (v: string) => {
    setTrackerId(v)
    const t = picker.trackers.find((x) => x.id === v)
    setBaseline(recordedBaseline(t))
    setActions((a) => a.filter((x) => x !== `tracker:${v}`))
    if (t) setArea(t.category)
  }

  const unit = measureKind === 'tracker' ? tracker?.unit ?? '' : undefined
  const outcomeTrackerKey = (locked ? goal!.trackerId : measureKind === 'tracker' ? trackerId : null)
  const actionOptions = useMemo(() => [
    ...picker.routines.map((r) => ({ key: `schedule:${r.id}`, label: r.name, measure: false })),
    ...picker.trackers.filter((t) => !t.sensitive).map((t) => ({ key: `tracker:${t.id}`, label: t.name, measure: t.id === outcomeTrackerKey })),
  ], [picker, outcomeTrackerKey])
  const full = actions.length >= MAX_ACTIONS
  const activeAfter = mode.kind === 'create' || mode.kind === 'draft' ? mode.activeCount + 1 : null

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {goal ? (
        <>
          <input type="hidden" name="id" value={goal.id} /><input type="hidden" name="version" value={goal.version} />
          {/* The measure is locked on edits, but the action still validates these fields. */}
          <input type="hidden" name="area" value={goal.area} /><input type="hidden" name="measureKind" value={goal.measureKind} />
          <input type="hidden" name="direction" value={goal.direction} />
        </>
      ) : null}
      {mode.kind === 'draft' ? <input type="hidden" name="draftInsightId" value={mode.insightId} /> : null}
      {mode.kind === 'review' && mode.suggested ? <Notice>Suggested by the coach: {mode.suggested} Nothing changes until you save.</Notice> : null}
      {mode.kind === 'draft' ? <Notice>Suggested by the coach from your profile. Check every field. Nothing starts until you approve it.</Notice> : null}

      <Section title="Outcome">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Goal" htmlFor={`${id}-title`}>
            <Input id={`${id}-title`} name="title" required maxLength={120} defaultValue={initial.title} data-autofocus placeholder="Type 80 words a minute"
              aria-invalid={!!errors.title || undefined} aria-describedby={errors.title ? `${id}-title-e` : undefined} />
            <FieldError id={`${id}-title-e`} message={errors.title} />
          </Field>
          <Field label="Area" htmlFor={`${id}-area`}>
            {locked ? <Input id={`${id}-area`} value={CATEGORY[initial.area].label} readOnly disabled /> : (
              <Select id={`${id}-area`} name="area" value={area} onChange={(e) => setArea(e.target.value as Category)}>
                {CATEGORIES.map((c) => <option key={c} value={c} data-color={CATEGORY[c].color}>{CATEGORY[c].label}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </Section>

      <Section title="Measure" hint={locked ? 'To measure something else, finish this goal and start a new one.' : 'Use a tracker ReLife already fills, or record a check-in yourself.'}>
        {locked ? (
          <p className="text-[13.5px] text-ink-2">{goal!.measureKind === 'tracker' ? `${goal!.measureName} tracker` : `Check-in · ${goal!.measureName}`}{goal!.unit ? ` · ${goal!.unit}` : ''}</p>
        ) : (
          <>
            <Segmented name="measureKind" aria-label="Measure source" value={measureKind} onValueChange={(v) => { setMeasureKind(v as 'tracker' | 'check_in'); setBaseline(v === 'tracker' ? recordedBaseline(tracker) : '') }} className="self-start"
              options={[
                { value: 'tracker', label: <span className="flex items-center gap-1.5"><ChartLine className="size-3.5" strokeWidth={1.5} />From a tracker</span> },
                { value: 'check_in', label: <span className="flex items-center gap-1.5"><ClipboardCheck className="size-3.5" strokeWidth={1.5} />Check-in</span> },
              ]} />
            {measureKind === 'tracker' ? (
              <Field label="Tracker" htmlFor={`${id}-tracker`}>
                <Select id={`${id}-tracker`} name="trackerId" value={trackerId} onChange={(e) => pickTracker(e.target.value)}
                  aria-invalid={!!errors.trackerId || undefined} aria-describedby={errors.trackerId ? `${id}-tracker-e` : undefined}>
                  <option value="">Choose a tracker</option>
                  {picker.trackers.map((t) => <option key={t.id} value={t.id} data-color={CATEGORY[t.category].color}>{t.name}{t.unit ? ` · ${t.unit}` : ''}</option>)}
                </Select>
                <FieldError id={`${id}-tracker-e`} message={errors.trackerId} />
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field label="What you check" htmlFor={`${id}-mname`}>
                  <Input id={`${id}-mname`} name="measureName" maxLength={80} defaultValue={initial.measureName} placeholder="Clean tempo" aria-invalid={!!errors.measureName || undefined} aria-describedby={errors.measureName ? `${id}-mname-e` : undefined} />
                  <FieldError id={`${id}-mname-e`} message={errors.measureName} />
                </Field>
                <Field label="Unit" htmlFor={`${id}-unit`}>
                  <Input id={`${id}-unit`} name="unit" maxLength={20} defaultValue={initial.unit} placeholder="bpm" />
                </Field>
              </div>
            )}
            {measureKind === 'tracker' && tracker?.activity ? <Notice tone="warn">This counts activity. A result measure or a check-in shows progress better.</Notice> : null}
            {measureKind === 'tracker' && tracker?.sensitive ? <Notice>ReLife won’t set quests or suggest changes for this measure.</Notice> : null}
          </>
        )}
      </Section>

      <Section title="Where you start">
        {locked ? (
          <p className="text-[13.5px] text-ink-2 tabular-nums">Baseline {goal!.baselineValue}{goal!.unit ? ` ${goal!.unit}` : ''} · {day(goal!.baselineDate)} · {goal!.baselineHow}</p>
        ) : (
          <>
            <input type="hidden" name="baselineMode" value={useRecorded ? 'recorded' : 'manual'} />
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <Field label="Baseline" htmlFor={`${id}-base`}>
                <UnitInput id={`${id}-base`} name="baselineValue" unit={unit ?? initial.unit} value={baseline} onChange={(e) => setBaseline(e.target.value)}
                  error={errors.baselineValue} aria-describedby={errors.baselineValue ? `${id}-base-e` : undefined} />
              </Field>
              {measureKind === 'tracker' && tracker ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink-2">Recorded</span>
                  <div className="flex h-9 items-center gap-2">
                    <Badge color={tracker.observations >= 7 ? 'var(--good)' : undefined}>{tracker.observations} of 28 days</Badge>
                    <span className="text-[12.5px] text-ink-3">7 or more needed</span>
                  </div>
                </div>
              ) : (
                <Field label="Baseline date" htmlFor={`${id}-bdate`}>
                  <Input id={`${id}-bdate`} type="date" name="baselineDate" max={today} defaultValue={initial.baselineDate} aria-invalid={!!errors.baselineDate || undefined} aria-describedby={errors.baselineDate ? `${id}-bdate-e` : undefined} />
                  <FieldError id={`${id}-bdate-e`} message={errors.baselineDate} />
                </Field>
              )}
            </div>
            <FieldError id={`${id}-base-e`} message={errors.baselineValue} />
            {measureKind === 'tracker' && tracker ? (
              <>
                <ObservationStrip strip={tracker.strip} color={CATEGORY[tracker.category].color} from={addDays(today, -28)} to={addDays(today, -1)} />
                {tracker.baseline ? (
                  <p className="text-[12.5px] leading-relaxed text-ink-3">
                    {useRecorded ? `Auto-filled: the average of ${tracker.baseline.observations} days from your ${tracker.name} tracker in the 28 days before today. Missing days are left out. You can change it.` : 'You changed the recorded average, so this baseline is yours.'}
                  </p>
                ) : <Notice>Only {tracker.observations} days recorded in the 28 days before today. A baseline needs 7, so enter one yourself.</Notice>}
              </>
            ) : null}
            {!useRecorded ? (
              <>
                {measureKind === 'tracker' ? <input type="hidden" name="baselineDate" value={today} /> : null}
                <Field label="How you measured it" htmlFor={`${id}-how`} hint="Say how you measure it, so every check-in is done the same way.">
                  <Input id={`${id}-how`} name="baselineHow" maxLength={200} defaultValue={initial.baselineHow} placeholder="Metronome, best of 3 run-throughs" aria-invalid={!!errors.baselineHow || undefined} aria-describedby={errors.baselineHow ? `${id}-how-e` : undefined} />
                  <FieldError id={`${id}-how-e`} message={errors.baselineHow} />
                </Field>
              </>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Target">
        {locked ? <p className="-mt-1 text-[13px] text-ink-3">{directionLabel(goal!.direction)}</p> : (
          <Segmented name="direction" aria-label="Direction" value={direction} onValueChange={(v) => setDirection(v as GoalFormInitial['direction'])} className="self-start"
            options={[{ value: 'increase', label: 'Increase' }, { value: 'decrease', label: 'Decrease' }, { value: 'range', label: 'Stay in range' }]} />
        )}
        <div className={cn('grid gap-4', direction === 'range' ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          {direction === 'range' ? (
            <>
              <Field label="Low" htmlFor={`${id}-low`}>
                <UnitInput id={`${id}-low`} name="rangeLow" unit={unit ?? initial.unit} defaultValue={initial.rangeLow} error={errors.rangeLow} aria-describedby={errors.rangeLow ? `${id}-low-e` : undefined} />
                <FieldError id={`${id}-low-e`} message={errors.rangeLow} />
              </Field>
              <Field label="High" htmlFor={`${id}-high`}>
                <UnitInput id={`${id}-high`} name="rangeHigh" unit={unit ?? initial.unit} defaultValue={initial.rangeHigh} error={errors.rangeHigh} aria-describedby={errors.rangeHigh ? `${id}-high-e` : undefined} />
                <FieldError id={`${id}-high-e`} message={errors.rangeHigh} />
              </Field>
            </>
          ) : (
            <Field label="Target" htmlFor={`${id}-target`}>
              <UnitInput id={`${id}-target`} name="target" unit={unit ?? initial.unit} defaultValue={initial.target} error={errors.target} aria-describedby={errors.target ? `${id}-target-e` : undefined} />
              <FieldError id={`${id}-target-e`} message={errors.target} />
            </Field>
          )}
          <Field label="By" htmlFor={`${id}-date`}>
            <Input id={`${id}-date`} type="date" name="targetDate" min={addDays(today, 1)} defaultValue={initial.targetDate} aria-invalid={!!errors.targetDate || undefined} aria-describedby={errors.targetDate ? `${id}-date-e` : undefined} />
            <FieldError id={`${id}-date-e`} message={errors.targetDate} />
          </Field>
        </div>
      </Section>

      <Section title="Why it matters">
        <Field label="Reason" htmlFor={`${id}-reason`}>
          <Textarea id={`${id}-reason`} name="reason" maxLength={500} rows={2} defaultValue={initial.reason} placeholder="I want to keep up in meetings without looking down." aria-invalid={!!errors.reason || undefined} aria-describedby={errors.reason ? `${id}-reason-e` : undefined} />
          <FieldError id={`${id}-reason-e`} message={errors.reason} />
        </Field>
      </Section>

      <Section title="Linked actions" hint="1 to 3 routines or trackers you’ll do for this goal. Their quests come first in your dailies.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Linked actions" aria-describedby={errors.actions ? `${id}-actions-e` : undefined}>
          {actionOptions.map((o) => {
            const on = actions.includes(o.key)
            return (
              <label key={o.key} className="relative">
                <input type="checkbox" name="actions" value={o.key} checked={on} disabled={o.measure || (!on && full)} className="peer sr-only"
                  onChange={() => setActions((a) => (on ? a.filter((x) => x !== o.key) : [...a, o.key]))} />
                <span className="flex h-10 cursor-pointer items-center gap-1.5 rounded-md bg-surface-2 px-3 text-[13px] font-medium text-ink-2 transition-[background-color,color,box-shadow] duration-150 select-none peer-checked:bg-ink peer-checked:text-bg peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-focus-visible:shadow-[0_0_0_2px_var(--pill)]">
                  {on ? <Check className="size-3.5" strokeWidth={2} aria-hidden /> : null}
                  {o.label}{o.measure ? ' · measure' : ''}
                </span>
              </label>
            )
          })}
          {!actionOptions.length ? <p className="text-[13px] text-ink-3">Add a routine in Plan › Routines first, then link it here.</p> : null}
        </div>
        <p className="text-[12.5px] text-ink-3 tabular-nums">{actions.length} of {MAX_ACTIONS} selected.{outcomeTrackerKey ? ' The measure can’t also be an action.' : ''}</p>
        <FieldError id={`${id}-actions-e`} message={errors.actions} />
      </Section>

      <Section title="Review">
        <Segmented name="cadence" aria-label="Review cadence" defaultValue={initial.cadence} className="self-start"
          options={Object.entries(CADENCE_LABEL).map(([value, label]) => ({ value, label }))} />
        <p className="-mt-2 text-[12.5px] text-ink-3">Reviews land on a Sunday. You decide to keep, change, pause or finish.</p>
      </Section>

      {stale ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-bad/8 px-3 py-2 text-[13px] text-bad">
          <span>This goal changed somewhere else since you opened it. Nothing was saved.</span>
          <Button size="sm" onClick={() => { router.refresh(); onDone() }}>Reload goal</Button>
        </div>
      ) : <FormError message={state && !state.ok ? state.error ?? (Object.keys(errors).length ? 'Check the highlighted fields.' : undefined) : undefined} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
        <p className="text-[12.5px] text-ink-3 tabular-nums">{activeAfter ? `Saving makes this active goal ${activeAfter} of ${MAX_ACTIVE}.` : ''}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : mode.kind === 'draft' ? 'Approve goal' : locked ? 'Save' : 'Save goal'}</Button>
        </div>
      </div>
    </form>
  )
}

/**
 * "Create goal"; also open while the URL is `/plan?new=1`. Open state comes from the URL, not from state set once,
 * so a page kept alive in the background never comes back with a stale dialog. Disabled at the cap with the reason read out.
 */
export function NewGoalButton({ today, picker, activeCount, listenToUrl = false }: { today: string; picker: GoalPickerData; activeCount: number; listenToUrl?: boolean }) {
  const atCap = activeCount >= MAX_ACTIVE
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const fromUrl = listenToUrl && pathname === '/plan' && params.get('new') === '1'
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} disabled={atCap} aria-describedby={atCap ? 'goal-cap-note' : undefined}>
        <Plus className="size-4" strokeWidth={2} />
        Create goal
      </Button>
      <GoalDialog open={(open || fromUrl) && !atCap} mode={{ kind: 'create', activeCount }} initial={blank(today)} picker={picker} today={today}
        onClose={() => { setOpen(false); if (fromUrl) router.replace(pathname, { scroll: false }) }} />
    </>
  )
}

/** Opens the form for an existing goal (edit), a review change, or an AI draft. */
export function GoalFormButton({ mode, initial, picker, today, children, variant = 'secondary', size = 'md', disabled, className, describedBy }: {
  mode: Mode; initial: GoalFormInitial; picker: GoalPickerData; today: string; children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; className?: string; describedBy?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} disabled={disabled} className={className} aria-describedby={describedBy}>{children}</Button>
      <GoalDialog open={open} onClose={() => setOpen(false)} mode={mode} initial={initial} picker={picker} today={today} />
    </>
  )
}
