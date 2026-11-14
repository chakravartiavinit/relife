import type { Pack, PackGoal, PackRoutine, PackTracker } from '@relife/contract'
import { addDays } from '@/core/time'
import type { Category } from './categories'
import { MAX_ACTIVE, checkGoalDraft, type RawGoalDraft } from './goals'
import { buildRRule, describe } from './recurrence'
import type { Template } from './templates'

// Applying a starter pack to the answers of setup (/welcome): pure, so it is tested. `v` is the flow's state (`V` in
// ui/components/onboarding-data.ts); only the fields a pack touches are named here.

export type PackAnswers = {
  areas: string[]
  focus?: string
  improve: string[]
  templates: string[]
  routineMode: 'ai' | 'starter' | null
  starterSeeded: boolean
  sleepHours: number
  sleepTouched: boolean
  steps: number
  waterMl: number
  pack: string | null
}

/**
 * The answers a pack fills in: areas, the "improve first" picks, the starter routines (the pack's routine keys are
 * routine template ids), the daily targets it sets. Switching packs applies the new one over the old; no pack (Custom)
 * keeps today's answers. A rerun passes the saved areas, which the pack adds to. Every later step stays editable.
 */
export function applyPack<V extends PackAnswers>(v: V, pack: Pack | null, saved: string[] = []): V {
  if (!pack) return { ...v, pack: null }
  // `saved`: the areas kept from an earlier setup. A pack adds its areas to them, so running setup again never drops one.
  const areas = pack.areas?.length ? [...saved, ...pack.areas.filter((a) => !saved.includes(a))] : v.areas
  return {
    ...v,
    pack: pack.id,
    areas,
    focus: v.focus && areas.includes(v.focus) ? v.focus : areas[0],
    improve: (pack.improve ?? []).slice(0, 3),
    templates: pack.routines.map((r) => r.key),
    routineMode: 'starter',
    starterSeeded: true,
    ...(pack.targets?.sleepHours ? { sleepHours: pack.targets.sleepHours, sleepTouched: true } : {}),
    ...(pack.targets?.steps ? { steps: pack.targets.steps } : {}),
    ...(pack.targets?.waterMl ? { waterMl: pack.targets.waterMl } : {}),
  }
}

/** The goal draft a pack offers, as the line the preview shows: "Draft goal: Two delivery orders a week or fewer". */
export const packGoalLine = (pack: Pack | undefined) => (pack?.goals[0] ? `Goal draft: ${pack.goals[0].title}` : null)

const DIRECTION = { up: 'increase', down: 'decrease', range: 'range' } as const

/**
 * A pack goal as the raw draft `checkGoalDraft` validates (which also enforces the sensitivity rules). `routineId`
 * turns a routine key of the pack into the id of the routine that was created, or undefined when it was not.
 */
export function packGoalToRaw(g: PackGoal, today: string, routineId: (key: string) => string | undefined, trackerId: (slug: string) => string | undefined = () => undefined): RawGoalDraft {
  return {
    title: g.title, reason: g.reason ?? '', area: g.area,
    measure: 'checkIn' in g.measure ? { checkIn: g.measure.checkIn, unit: g.measure.unit } : { tracker: g.measure.tracker },
    direction: DIRECTION[g.direction],
    ...(g.direction === 'range' ? { rangeLow: g.rangeLow, rangeHigh: g.rangeHigh } : { target: g.target }),
    targetDate: addDays(today, g.weeks * 7), cadence: g.cadence,
    // An action is a routine key or a tracker slug of the pack; one that was not created (or found) is left out.
    actions: (g.actions ?? []).flatMap((k): ({ routine: string } | { tracker: string })[] => { const r = routineId(k), t = trackerId(k); return r ? [{ routine: r }] : t ? [{ tracker: t }] : [] }),
  }
}

// ─── The templates gallery: what adding a pack would do. Pure, so the server (preview and apply) and the browser (the
// "turn on the areas" switch) work out the same answer. The queries that fill `PackState` are in core/packs.ts. ───

/** A setup template as a pack routine (the key is the template id): setup and the gallery then share one inserter. */
export function templateToPackRoutine(t: Template): PackRoutine {
  const rule = Object.fromEntries(Object.entries(t.rule).filter(([, v]) => v !== undefined)) as PackRoutine['rule']
  return {
    key: t.id, name: t.name, area: t.area, kind: t.kind, rule,
    ...(t.note ? { note: t.note } : {}), ...(t.dose ? { dose: t.dose } : {}), ...(t.quantity ? { quantity: { unit: t.quantity.unit, step: t.quantity.step } } : {}),
  }
}

export type PackState = {
  /** Names of every schedule, lowercased: a routine of the same name already exists (setup's rule). */
  routineNames: Set<string>
  /** Active routines by lowercased name, so a goal can link a routine the user already had. */
  routineIds: Map<string, string>
  trackers: Map<string, { id: string; name: string; unit: string | null; category: Category; target: number | null }>
  /** Titles of active and paused goals, lowercased. */
  goalTitles: Set<string>
  activeGoals: number
  /** The areas the user turned on; empty means all of them. */
  areas: Category[]
}

/** `PackState` as plain JSON (Sets and Maps do not cross the server action), and back: the browser re-plans when the areas switch changes. */
export type PackStateJson = { routineNames: string[]; routineIds: [string, string][]; trackers: [string, PackState['trackers'] extends Map<string, infer V> ? V : never][]; goalTitles: string[]; activeGoals: number; areas: Category[] }
export const stateToJson = (s: PackState): PackStateJson => ({ ...s, routineNames: [...s.routineNames], routineIds: [...s.routineIds], trackers: [...s.trackers], goalTitles: [...s.goalTitles] })
export const stateFromJson = (j: PackStateJson): PackState => ({ ...j, routineNames: new Set(j.routineNames), routineIds: new Map(j.routineIds), trackers: new Map(j.trackers), goalTitles: new Set(j.goalTitles) })

/** Why an item is left out. `exists`, `area_off`, `goal_slots` and `unknown_tracker` are the main four; the others keep a bad pack from making a bad goal. */
export type SkipReason = 'exists' | 'area_off' | 'goal_slots' | 'unknown_tracker' | 'no_action' | 'not_allowed'
export type SkipItem = { kind: 'routine' | 'tracker' | 'goal'; key: string; name: string; reason: SkipReason }
export const SKIP_TEXT: Record<SkipReason, string> = {
  exists: 'Already there',
  area_off: 'Its area is off',
  goal_slots: 'You already have 3 active goals',
  unknown_tracker: 'Needs a tracker you do not have',
  no_action: 'Needs a routine it could link',
  not_allowed: 'Goals like this are set up in Plan',
}

/** A goal needs a reason: a pack that gives none says where the goal came from. */
export const goalReason = (pack: Pick<Pack, 'name'>, g: Pick<PackGoal, 'reason'>) => g.reason?.trim() || `From the ${pack.name} pack`

export type PackChoices = { routineKeys?: string[]; trackerSlugs?: string[]; goalKeys?: string[]; addAreas?: boolean }
export type PackPlan = {
  routines: PackRoutine[]
  /** Trackers to create. */
  trackers: PackTracker[]
  /** Trackers that exist without a target: only the target is set. */
  targets: PackTracker[]
  goals: PackGoal[]
  skip: SkipItem[]
  /** Areas the pack needs that the user has off; they are turned on when `addAreas` is true. */
  areasToAdd: Category[]
}

/**
 * What adding `pack` does to someone with `state`. Everything is added unless `choices` narrows it. An existing routine
 * (same name), tracker (same slug) or goal (same title) is skipped, so running a pack twice adds nothing. An item in an
 * area the user has off is added only with `addAreas` (default true), which also turns that area on. A goal needs a free
 * slot, a tracker it can measure and a routine or tracker to link, and passes `checkGoalDraft` (the sensitivity rules).
 */
export function planPack(pack: Pack, state: PackState, today: string, choices: PackChoices = {}): PackPlan {
  const addAreas = choices.addAreas ?? true
  const picked = (list: string[] | undefined, key: string) => !list || list.includes(key)
  const off = (a: Category) => state.areas.length > 0 && !state.areas.includes(a)
  const plan: PackPlan = { routines: [], trackers: [], targets: [], goals: [], skip: [], areasToAdd: [] }
  const needArea = (a: Category) => { if (!plan.areasToAdd.includes(a)) plan.areasToAdd.push(a) }
  const names = new Set(state.routineNames)

  for (const r of pack.routines) {
    if (!picked(choices.routineKeys, r.key)) continue
    if (names.has(r.name.toLowerCase())) plan.skip.push({ kind: 'routine', key: r.key, name: r.name, reason: 'exists' })
    else if (off(r.area) && !addAreas) plan.skip.push({ kind: 'routine', key: r.key, name: r.name, reason: 'area_off' })
    else { names.add(r.name.toLowerCase()); plan.routines.push(r); if (off(r.area)) needArea(r.area) }
  }

  const known = new Map<string, { id: string; slug: string; name: string; unit: string | null; category: Category }>()
  for (const [slug, t] of state.trackers) known.set(slug, { id: slug, slug, name: t.name, unit: t.unit, category: t.category })
  for (const t of pack.trackers) {
    if (!picked(choices.trackerSlugs, t.slug)) continue
    const have = state.trackers.get(t.slug)
    if (have) {
      // The target is set only when the tracker has none; otherwise there is nothing to do.
      if (have.target == null && t.target != null) plan.targets.push(t)
      else plan.skip.push({ kind: 'tracker', key: t.slug, name: t.name, reason: 'exists' })
    } else if (off(t.area) && !addAreas) plan.skip.push({ kind: 'tracker', key: t.slug, name: t.name, reason: 'area_off' })
    else { plan.trackers.push(t); known.set(t.slug, { id: t.slug, slug: t.slug, name: t.name, unit: t.unit ?? null, category: t.area }); if (off(t.area)) needArea(t.area) }
  }

  // Goal actions: a routine the pack adds or one the user already has under that name, and the trackers above.
  const routineOf = (key: string) => {
    const r = pack.routines.find((x) => x.key === key)
    return r && (plan.routines.includes(r) || state.routineIds.has(r.name.toLowerCase())) ? key : undefined
  }
  const routines = pack.routines.flatMap((r) => (routineOf(r.key) ? [{ id: r.key, name: r.name, category: r.area }] : []))
  let slots = MAX_ACTIVE - state.activeGoals
  for (const g of pack.goals) {
    if (!picked(choices.goalKeys, g.key)) continue
    const skip = (reason: SkipReason) => plan.skip.push({ kind: 'goal', key: g.key, name: g.title, reason })
    if (state.goalTitles.has(g.title.toLowerCase())) { skip('exists'); continue }
    if (off(g.area) && !addAreas) { skip('area_off'); continue }
    if (slots <= 0) { skip('goal_slots'); continue }
    if ('tracker' in g.measure && !known.has(g.measure.tracker)) { skip('unknown_tracker'); continue }
    const checked = checkGoalDraft(packGoalToRaw({ ...g, reason: goalReason(pack, g) }, today, routineOf, (k) => (known.has(k) ? k : undefined)), { today, trackers: [...known.values()], routines })
    if (!checked.ok) { skip(checked.reason.startsWith('needs 1') ? 'no_action' : 'not_allowed'); continue }
    slots--; plan.goals.push(g)
    if (off(g.area)) needArea(g.area)
  }
  return plan
}

/** "Added 4 routines, 1 goal": the toast after adding a pack. Zero counts are left out. */
export function addedLine(n: { routines: number; trackers: number; goals: number }) {
  const part = (c: number, one: string) => (c ? [`${c} ${c === 1 ? one : `${one}s`}`] : [])
  const parts = [...part(n.routines, 'routine'), ...part(n.trackers, 'tracker'), ...part(n.goals, 'goal')]
  return parts.length ? `Added ${parts.join(', ')}` : 'Nothing new to add'
}

/** "Daily · 07:00": a pack routine's rule in words, the way the Routines list says it. */
export const describePackRule = (rule: PackRoutine['rule']) => describe(buildRRule({ ...rule, start: '2026-01-01' }))

/** "4 routines · 1 goal": what a pack holds, for its card. */
export function countsLine(pack: Pick<Pack, 'routines' | 'trackers' | 'goals'>) {
  const part = (c: number, one: string) => (c ? [`${c} ${c === 1 ? one : `${one}s`}`] : [])
  return [...part(pack.routines.length, 'routine'), ...part(pack.trackers.length, 'tracker'), ...part(pack.goals.length, 'goal')].join(' · ')
}
