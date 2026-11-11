import { addDays, daysBetween, formatDay } from '@/core/time'
import { medicationOrDose } from '@/ai/tool-policy'
import type { Category } from '@/db/schema'
import { adherenceRate, type DayStatus } from './adherence'
import { formatValue } from './patterns'

// Outcome goals: one outcome measure with a baseline, 1–3 linked actions, and a review that compares
// action adherence with outcome change. Pure: callers pass local-date keyed maps (no DB, no React).

export type GoalDirection = 'increase' | 'decrease' | 'range'
export type GoalStatus = 'active' | 'paused' | 'finished'
export type GoalCadence = 'weekly' | 'fortnightly' | 'monthly'
export type GoalMeasureKind = 'tracker' | 'check_in'
export type GoalActionLink = { kind: 'schedule' | 'tracker'; id: string }
export type GoalDecision = 'keep' | 'change' | 'pause' | 'finish' | 'resume'
export type OutcomeStatus = 'met' | 'toward' | 'flat' | 'away' | 'not_enough_data'

export const BASELINE_DAYS = 28
export const MIN_BASELINE_OBS = 7
export const MAX_ACTIVE = 3
export const MAX_ACTIONS = 3
export const MAX_TARGET_DAYS = 730
export const CADENCE_DAYS: Record<GoalCadence, number> = { weekly: 7, fortnightly: 14, monthly: 28 }
export const CADENCES = ['weekly', 'fortnightly', 'monthly'] as const
export const DIRECTIONS = ['increase', 'decrease', 'range'] as const
export const GOAL_FOOTNOTE = 'Actions and outcome moving together does not show that one caused the other.'
export const CAP_MESSAGE = `You have ${MAX_ACTIVE} active goals. Pause or finish one first.`

/** Editable after activation. The measure and baseline are locked. */
export type GoalFields = {
  title: string; reason: string
  target: number | null; rangeLow: number | null; rangeHigh: number | null
  targetDate: string; cadence: GoalCadence; actions: GoalActionLink[]
}
/** The editable fields of a goal (or anything shaped like one). */
export const goalFields = (g: GoalFields): GoalFields => ({
  title: g.title, reason: g.reason, target: g.target, rangeLow: g.rangeLow, rangeHigh: g.rangeHigh,
  targetDate: g.targetDate, cadence: g.cadence, actions: g.actions,
})
export type GoalProposalField = 'target' | 'rangeLow' | 'rangeHigh' | 'targetDate' | 'cadence'
export type GoalProposal = { field: GoalProposalField; value: number | string; why: string }

/** What the pure rules need from a stored goal. */
export type GoalLike = {
  title: string; measureKind: GoalMeasureKind; measureName: string; unit: string | null
  direction: GoalDirection; target: number | null; rangeLow: number | null; rangeHigh: number | null
  baselineValue: number; targetDate: string; cadence: GoalCadence
}

export type ActionSnapshot = {
  kind: GoalActionLink['kind']; id: string; name: string; available: boolean
  /** Schedules: due and fully done days in the window (skips excluded from both). */
  due: number | null; done: number | null; rate: number | null
  /** Trackers: days with a record, and days that met the tracker's own target. Unrecorded days are unknown. */
  recordedDays: number | null; metDays: number | null
  windowDays: number
}
export type GoalSnapshot = {
  window: { from: string; to: string; days: number }
  outcome: {
    baseline: number; current: number | null; observations: number; needed: number
    status: OutcomeStatus; progressShare: number | null
    latestCheckIn: { localDate: string; value: number } | null
    /** Tracker goals: each day of the period, null when nothing was recorded (never zero). */
    days?: { date: string; value: number | null }[]
  }
  actions: ActionSnapshot[]
  adherence: number | null
  /** Whether the target was satisfied when this was computed. Finishing never implies success. */
  met: boolean
  sensitive: boolean
  computedAt: string
}

/** An AI suggestion for a new goal. Never active until the user saves it in the form. No baseline: code owns it. */
export type GoalDraft = {
  title: string; reason: string; area: Category
  measure: { tracker: string } | { checkIn: string; unit?: string; how?: string }
  direction: GoalDirection; target?: number; rangeLow?: number; rangeHigh?: number
  targetDate: string; cadence: GoalCadence; actions: GoalActionLink[]
}

/** One goal inside a weekly review insight. Lines are deterministic; the coach note is separate. */
export type GoalReviewPoint = { goalId: string; reviewId: string; title: string; lines: string[]; prompt: string; note?: string; proposal?: string }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const observed = (days: Map<string, number>, from: string, to: string) =>
  [...days].filter(([d, v]) => d >= from && d <= to && Number.isFinite(v)).map(([, v]) => v)

/** Records needed in a window before an outcome is judged: 3 of 7, 6 of 14, 12 of 28. */
export const minObservations = (windowDays: number) => Math.ceil((3 / 7) * windowDays)

/** Mean of recorded days in the 28 complete days before `startDate`. Missing days are skipped, never zero. */
export function trackerBaseline(days: Map<string, number>, startDate: string) {
  const from = addDays(startDate, -BASELINE_DAYS), to = addDays(startDate, -1)
  const xs = observed(days, from, to)
  if (xs.length < MIN_BASELINE_OBS) return { value: null, observations: xs.length, from, to, how: null }
  return {
    value: mean(xs)!, observations: xs.length, from, to,
    how: `Average of ${xs.length} recorded days, ${formatDay(from, { day: 'numeric', month: 'short' })} – ${formatDay(to, { day: 'numeric', month: 'short' })}`,
  }
}

export type OutcomeInput = { days?: Map<string, number>; checkIns?: { localDate: string; value: number }[] }

/** The outcome for the review period ending the day before `reviewDate` (check-ins: up to `reviewDate`). */
export function outcomeNow(goal: Pick<GoalLike, 'measureKind' | 'cadence'>, input: OutcomeInput, reviewDate: string) {
  const windowDays = CADENCE_DAYS[goal.cadence]
  const from = addDays(reviewDate, -windowDays)
  if (goal.measureKind === 'check_in') {
    const inWindow = (input.checkIns ?? []).filter((c) => c.localDate > from && c.localDate <= reviewDate && Number.isFinite(c.value))
      .sort((a, b) => b.localDate.localeCompare(a.localDate))
    const latest = inWindow[0] ?? null
    return { value: latest?.value ?? null, observations: inWindow.length, needed: 1, latestCheckIn: latest }
  }
  const xs = observed(input.days ?? new Map(), from, addDays(reviewDate, -1))
  return { value: mean(xs), observations: xs.length, needed: minObservations(windowDays), latestCheckIn: null }
}

/** Distance from a value to the range; 0 inside it. */
const rangeDistance = (v: number, low: number, high: number) => (v < low ? low - v : v > high ? v - high : 0)

export function targetMet(goal: Pick<GoalLike, 'direction' | 'target' | 'rangeLow' | 'rangeHigh'>, value: number) {
  if (goal.direction === 'range') return goal.rangeLow != null && goal.rangeHigh != null && value >= goal.rangeLow && value <= goal.rangeHigh
  if (goal.target == null) return false
  return goal.direction === 'increase' ? value >= goal.target : value <= goal.target
}

/**
 * Status of the outcome against baseline and target. Movement of at least 10% of the gap from baseline to target
 * counts as toward (or away); less is flat. Too few records is its own state, never a miss.
 */
export function outcomeStatus(
  goal: Pick<GoalLike, 'direction' | 'target' | 'rangeLow' | 'rangeHigh' | 'baselineValue'>,
  current: { value: number | null; observations: number; needed: number },
): { status: OutcomeStatus; progressShare: number | null } {
  if (current.value == null || current.observations < current.needed) return { status: 'not_enough_data', progressShare: null }
  const v = current.value, b = goal.baselineValue
  if (targetMet(goal, v)) return { status: 'met', progressShare: 1 }
  let gap: number, movement: number
  if (goal.direction === 'range') {
    const low = goal.rangeLow ?? -Infinity, high = goal.rangeHigh ?? Infinity
    gap = rangeDistance(b, low, high)
    // In range at baseline and out of it now: moved away, whatever the size.
    if (gap === 0) return { status: 'away', progressShare: -1 }
    movement = gap - rangeDistance(v, low, high)
  } else {
    const t = goal.target ?? b
    gap = goal.direction === 'increase' ? t - b : b - t
    movement = goal.direction === 'increase' ? v - b : b - v
  }
  if (!(gap > 0)) return { status: 'flat', progressShare: 0 }
  const share = Math.max(-1, Math.min(1.5, movement / gap))
  return { status: share >= 0.1 ? 'toward' : share <= -0.1 ? 'away' : 'flat', progressShare: share }
}

export type ActionSource =
  | { kind: 'schedule'; name: string; statuses: DayStatus[] }
  | { kind: 'tracker'; name: string; days: Map<string, number>; target: number | null; direction: 'up' | 'down' }

/** How a linked action went in [from, to]. A missing source is reported as unavailable, not as a miss. */
export function actionAdherence(link: GoalActionLink, source: ActionSource | null, window: { from: string; to: string }): ActionSnapshot {
  const windowDays = daysBetween(window.from, window.to) + 1
  const base = { kind: link.kind, id: link.id, windowDays, due: null, done: null, rate: null, recordedDays: null, metDays: null }
  if (!source || source.kind !== link.kind) return { ...base, name: source?.name ?? 'Action no longer available', available: false }
  if (source.kind === 'schedule') {
    const due = source.statuses.filter((s) => s === 'done' || s === 'partial' || s === 'missed')
    return { ...base, name: source.name, available: true, due: due.length, done: due.filter((s) => s === 'done').length, rate: adherenceRate(source.statuses) }
  }
  const xs = observed(source.days, window.from, window.to)
  const t = source.target
  return {
    ...base, name: source.name, available: true, recordedDays: xs.length,
    metDays: t == null ? null : xs.filter((v) => (source.direction === 'down' ? v <= t : v >= t)).length,
  }
}

/** Mean of the schedule rates that had due days. Tracker actions have no due days, so they don't count. */
export function overallAdherence(actions: ActionSnapshot[]) {
  return mean(actions.filter((a) => a.kind === 'schedule' && a.rate != null).map((a) => a.rate!))
}

export function goalSnapshot(
  goal: GoalLike, input: OutcomeInput, actions: { link: GoalActionLink; source: ActionSource | null }[],
  reviewDate: string, sensitive: boolean, now = new Date(),
): GoalSnapshot {
  const days = CADENCE_DAYS[goal.cadence]
  const window = { from: addDays(reviewDate, -days), to: addDays(reviewDate, -1), days }
  const current = outcomeNow(goal, input, reviewDate)
  const { status, progressShare } = outcomeStatus(goal, current)
  const acts = actions.map((a) => actionAdherence(a.link, a.source, window))
  return {
    window,
    outcome: {
      baseline: goal.baselineValue, current: current.value, observations: current.observations, needed: current.needed, status, progressShare, latestCheckIn: current.latestCheckIn,
      ...(goal.measureKind === 'tracker' ? { days: Array.from({ length: days }, (_, i) => {
        const date = addDays(window.from, i), v = input.days?.get(date)
        return { date, value: v != null && Number.isFinite(v) ? v : null }
      }) } : {}),
    },
    actions: acts, adherence: overallAdherence(acts),
    met: current.value != null && targetMet(goal, current.value),
    sensitive, computedAt: now.toISOString(),
  }
}

export function targetText(goal: Pick<GoalLike, 'direction' | 'target' | 'rangeLow' | 'rangeHigh' | 'unit'>) {
  if (goal.direction === 'range') return `${formatValue(goal.rangeLow ?? 0)}–${formatValue(goal.rangeHigh ?? 0, goal.unit)}`
  return `${goal.direction === 'increase' ? '' : '≤ '}${formatValue(goal.target ?? 0, goal.unit)}`
}

function actionLine(a: ActionSnapshot) {
  if (!a.available) return `${a.name}: Action no longer available.`
  if (a.kind === 'schedule') return a.due ? `${a.name}: done on ${a.done} of ${a.due} due days.` : `${a.name}: nothing due this period.`
  if (!a.recordedDays) return `${a.name}: no record this period.`
  return `${a.name}: recorded on ${a.recordedDays} of ${a.windowDays} days${a.metDays != null ? `, target met on ${a.metDays}` : ''}.`
}

/** One fixed question from adherence × outcome. Never "because", never blame. */
export function reviewPrompt(adherence: number | null, status: OutcomeStatus, measureKind: GoalMeasureKind) {
  if (status === 'met') return 'The outcome reached the target. Finish this goal, or keep it to hold the result?'
  if (status === 'not_enough_data') {
    return measureKind === 'check_in'
      ? 'No check-in for this period yet. Add one, or keep for another period?'
      : 'There is not enough outcome data yet. Keep for another period, or change how you record it?'
  }
  const moving = status === 'toward'
  if (adherence == null) return moving ? 'The outcome moved the right way. Keep for another period?' : 'The outcome has not moved yet. Keep for another period, or change the action?'
  if (adherence >= 0.7) return moving ? 'You kept the actions and the outcome moved the right way. Keep for another period?' : 'You kept the actions, but the outcome has not moved yet. Keep for another period, or change the action?'
  if (adherence >= 0.5) return 'You did the actions on about half the due days. Keep, or make the action smaller?'
  return 'The actions were hard to fit in this period. Change the action, or pause the goal?'
}

/** The non-AI review: plain lines, one question, and the footnote. */
export function reviewLines(goal: GoalLike, s: GoalSnapshot): { lines: string[]; prompt: string } {
  const o = s.outcome
  const unitWord = goal.measureKind === 'check_in' ? 'check-in' : 'recording'
  const plural = (n: number) => `${n} ${unitWord}${n === 1 ? '' : 's'}`
  const by = formatDay(goal.targetDate, { day: 'numeric', month: 'short', year: 'numeric' })
  const outcome = o.status === 'not_enough_data'
    ? goal.measureKind === 'check_in' && o.observations === 0
      ? `Outcome: no check-in for this period. Baseline ${formatValue(o.baseline, goal.unit)}. Target ${targetText(goal)} by ${by}.`
      : `Not enough data: ${plural(o.observations)}, ${o.needed} needed. Baseline ${formatValue(o.baseline, goal.unit)}.`
    : `Outcome: ${formatValue(o.current!, goal.unit)} (${plural(o.observations)}) vs ${formatValue(o.baseline, goal.unit)} at baseline. Target ${targetText(goal)} by ${by}.`
  return {
    lines: [...s.actions.map((a) => `Actions: ${actionLine(a)}`), outcome, GOAL_FOOTNOTE],
    prompt: reviewPrompt(s.adherence, o.status, goal.measureKind),
  }
}

export type GoalInput = {
  title: string; reason: string; area: Category
  measureKind: GoalMeasureKind; trackerId: string | null; measureName: string; unit: string | null
  direction: GoalDirection; target: number | null; rangeLow: number | null; rangeHigh: number | null
  baselineValue: number | null; baselineDate: string; baselineHow: string
  targetDate: string; cadence: GoalCadence; actions: GoalActionLink[]
}
export type GoalContext = {
  today: string
  /** Whether saving makes this goal active (new goal, or resuming). */
  activating: boolean
  /** Active goals other than this one. */
  activeCount: number
  schedules: { id: string; kind: string; active: boolean }[]
  /** Non-archived trackers. */
  trackers: { id: string }[]
}
export type GoalErrors = Partial<Record<keyof GoalInput | 'form', string>>

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

export function validateGoal(g: GoalInput, ctx: GoalContext): GoalErrors {
  const e: GoalErrors = {}
  if (!g.title.trim()) e.title = 'Add a title.'
  else if (g.title.length > 120) e.title = 'Keep the title under 120 characters.'
  if (!g.reason.trim()) e.reason = 'Say why this goal matters.'
  else if (g.reason.length > 500) e.reason = 'Keep the reason under 500 characters.'
  if (g.measureKind === 'tracker' && (!g.trackerId || !ctx.trackers.some((t) => t.id === g.trackerId))) e.trackerId = 'Choose a tracker that is still recorded.'
  if (!g.measureName.trim()) e.measureName = 'Name what you will measure.'
  if (g.baselineValue == null || !Number.isFinite(g.baselineValue)) e.baselineValue = 'Add a baseline value.'
  if (!isDate(g.baselineDate)) e.baselineDate = 'Add the baseline date.'
  else if (g.baselineDate > ctx.today) e.baselineDate = 'The baseline date cannot be in the future.'
  if (!g.baselineHow.trim()) e.baselineHow = 'Say how the baseline was measured.'
  if (!isDate(g.targetDate)) e.targetDate = 'Add a target date.'
  else if (g.targetDate <= ctx.today) e.targetDate = 'The target date must be after today.'
  else if (daysBetween(ctx.today, g.targetDate) > MAX_TARGET_DAYS) e.targetDate = 'Pick a target date within 2 years.'
  const b = g.baselineValue
  if (g.direction === 'range') {
    if (g.rangeLow == null || g.rangeHigh == null || !Number.isFinite(g.rangeLow) || !Number.isFinite(g.rangeHigh)) e.rangeLow = 'Add both ends of the range.'
    else if (g.rangeLow >= g.rangeHigh) e.rangeLow = 'The low end must be below the high end.'
  } else if (g.target == null || !Number.isFinite(g.target)) e.target = 'Add a target.'
  else if (b != null && g.direction === 'increase' && g.target <= b) e.target = 'To increase, the target must be above the baseline.'
  else if (b != null && g.direction === 'decrease' && g.target >= b) e.target = 'To decrease, the target must be below the baseline.'
  const keys = g.actions.map((a) => `${a.kind}:${a.id}`)
  if (!g.actions.length) e.actions = 'Link at least one action.'
  else if (g.actions.length > MAX_ACTIONS) e.actions = `Link at most ${MAX_ACTIONS} actions.`
  else if (new Set(keys).size !== keys.length) e.actions = 'Each action can be linked once.'
  else if (g.actions.some((a) => a.kind === 'tracker' && a.id === g.trackerId)) e.actions = 'The outcome tracker cannot also be an action.'
  else if (g.actions.some((a) => a.kind === 'schedule'
    ? !ctx.schedules.some((s) => s.id === a.id && s.active && s.kind === 'routine')
    : !ctx.trackers.some((t) => t.id === a.id))) e.actions = 'Link only active routines and current trackers.'
  if (ctx.activating && ctx.activeCount >= MAX_ACTIVE) e.form = CAP_MESSAGE
  return e
}

/** Activity counts (time, commits, lessons): good actions, weak proof of an outcome. Warn, never block. */
export function isActivityMeasure(t: { slug: string; kind: string }) {
  return t.kind === 'duration' || /^(github|screen|duolingo)\./.test(t.slug) || /\.minutes$|-minutes$/.test(t.slug)
}

const SENSITIVE = /medicin|medicat|dosage|supplement|calori|weight|bmi|glucose|blood|pressure|symptom|pain|mood|anxiety|depress|heart|hrv|sleep|fasting|temperature|oxygen/
/** Measures ReLife never coaches automatically (no quests, no AI changes). */
export function isSensitiveMeasure(text: string) {
  return SENSITIVE.test(text.toLowerCase())
}

const BODY = /\b(?:weight|bmi|calori\w*|body\s*fat|waist)\b/i
/** A goal is sensitive when its measure looks medical or bodily. */
export function goalIsSensitive(...text: (string | null | undefined)[]) {
  const s = text.filter(Boolean).join(' ')
  return isSensitiveMeasure(s) || medicationOrDose.test(s) || BODY.test(s)
}

/** The first Sunday on or after `from + cadenceDays − 3`, so a weekly goal has at least 4 days before review. */
export function nextReviewOn(from: string, cadence: GoalCadence) {
  let d = addDays(from, CADENCE_DAYS[cadence] - 3)
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) d = addDays(d, 1)
  return d
}

export type DraftContext = {
  today: string
  trackers: { id: string; slug: string; name: string; unit: string | null; category: Category }[]
  routines: { id: string; name: string; category: Category }[]
}
export type RawGoalDraft = {
  title: string; reason: string; area: Category
  measure: { tracker?: string; checkIn?: string; unit?: string; how?: string }
  direction: GoalDirection; target?: number; rangeLow?: number; rangeHigh?: number
  targetDate: string; cadence: GoalCadence
  actions: { routine?: string; tracker?: string }[]
}

/** Check an AI draft against the lists it was given and the safety rules. Rejections are discarded. */
export function checkGoalDraft(raw: RawGoalDraft, ctx: DraftContext): { ok: true; draft: GoalDraft } | { ok: false; reason: string } {
  const no = (reason: string) => ({ ok: false as const, reason })
  const outcomeTracker = raw.measure.tracker ? ctx.trackers.find((t) => t.slug === raw.measure.tracker) : undefined
  if (raw.measure.tracker && !outcomeTracker) return no('unknown tracker')
  if (!outcomeTracker && !raw.measure.checkIn?.trim()) return no('no measure')
  const actions: GoalActionLink[] = []
  const linkedText: string[] = []
  for (const a of raw.actions.slice(0, MAX_ACTIONS + 1)) {
    if (a.routine) {
      const r = ctx.routines.find((x) => x.id === a.routine)
      if (!r) return no('unknown routine')
      actions.push({ kind: 'schedule', id: r.id }); linkedText.push(r.name)
    } else if (a.tracker) {
      const t = ctx.trackers.find((x) => x.slug === a.tracker)
      if (!t) return no('unknown tracker action')
      if (t.id === outcomeTracker?.id) return no('outcome is also an action')
      actions.push({ kind: 'tracker', id: t.id }); linkedText.push(t.slug, t.name)
    } else return no('empty action')
  }
  if (!actions.length || actions.length > MAX_ACTIONS) return no('needs 1–3 actions')
  const text = [raw.title, raw.reason, raw.measure.checkIn, raw.measure.unit, raw.measure.how, outcomeTracker?.slug, outcomeTracker?.name, outcomeTracker?.unit, ...linkedText]
  if (goalIsSensitive(...text)) return no('sensitive')
  const measureText = `${outcomeTracker?.slug ?? ''} ${outcomeTracker?.name ?? ''} ${raw.measure.checkIn ?? ''}`
  if (raw.area === 'health' && !/\bsteps?\b/i.test(measureText)) return no('health outcome other than steps')
  if (!isDate(raw.targetDate) || raw.targetDate <= ctx.today || daysBetween(ctx.today, raw.targetDate) > MAX_TARGET_DAYS) return no('target date out of range')
  if (raw.direction === 'range' ? !(raw.rangeLow != null && raw.rangeHigh != null && raw.rangeLow < raw.rangeHigh) : raw.target == null || !Number.isFinite(raw.target)) return no('no target')
  const title = raw.title.trim().slice(0, 120), reason = raw.reason.trim().slice(0, 500)
  if (!title || !reason) return no('missing text')
  return {
    ok: true,
    draft: {
      title, reason, area: raw.area,
      measure: outcomeTracker ? { tracker: outcomeTracker.slug } : { checkIn: raw.measure.checkIn!.trim().slice(0, 80), unit: raw.measure.unit?.trim().slice(0, 20) || undefined, how: raw.measure.how?.trim().slice(0, 200) || undefined },
      direction: raw.direction,
      ...(raw.direction === 'range' ? { rangeLow: raw.rangeLow, rangeHigh: raw.rangeHigh } : { target: raw.target }),
      targetDate: raw.targetDate, cadence: raw.cadence, actions,
    },
  }
}

/**
 * Quest signal IDs to rank first, mapped to the goal title: active goals' tracker actions, and routine actions
 * that log into a tracker (quantity routines). Plain checkbox routines have no quest signal.
 */
export function goalStatIds(
  goals: { status: GoalStatus; title: string; actions: GoalActionLink[]; trackerId?: string | null; measureName?: string; unit?: string | null }[],
  schedules: { id: string; meta: { trackerSlug?: string } | Record<string, unknown> }[],
  trackers: { id: string; slug: string; name?: string }[],
) {
  const out = new Map<string, string>()
  for (const g of goals) {
    if (g.status !== 'active') continue
    for (const a of g.actions) {
      const slug = a.kind === 'tracker'
        ? trackers.find((t) => t.id === a.id)?.slug
        : (schedules.find((s) => s.id === a.id)?.meta as { trackerSlug?: string } | undefined)?.trackerSlug
      if (slug && !out.has(`tracker:${slug}`)) out.set(`tracker:${slug}`, g.title)
    }
  }
  return out
}

/** Apply a proposal to editable fields. The result still goes through validateGoal and the user's save. */
export function applyProposal(f: GoalFields, p: GoalProposal): GoalFields {
  if (p.field === 'targetDate' || p.field === 'cadence') return { ...f, [p.field]: String(p.value) }
  return { ...f, [p.field]: Number(p.value) }
}

export function proposalText(p: GoalProposal, unit: string | null) {
  const label = { target: 'Target', rangeLow: 'Range low', rangeHigh: 'Range high', targetDate: 'Target date', cadence: 'Review cadence' }[p.field]
  const value = typeof p.value === 'number' ? formatValue(p.value, unit) : p.field === 'targetDate' ? formatDay(String(p.value), { day: 'numeric', month: 'short', year: 'numeric' }) : String(p.value)
  return `${label}: ${value}. ${p.why}`
}
