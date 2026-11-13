import type { Pack, PackGoal } from '@relife/contract'
import { addDays } from '@/core/time'
import type { RawGoalDraft } from './goals'

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
 * keeps today's answers. Every later step stays editable.
 */
export function applyPack<V extends PackAnswers>(v: V, pack: Pack | null): V {
  if (!pack) return { ...v, pack: null }
  const areas = pack.areas?.length ? [...pack.areas] : v.areas
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
export function packGoalToRaw(g: PackGoal, today: string, routineId: (key: string) => string | undefined): RawGoalDraft {
  return {
    title: g.title, reason: g.reason ?? '', area: g.area,
    measure: 'checkIn' in g.measure ? { checkIn: g.measure.checkIn, unit: g.measure.unit } : { tracker: g.measure.tracker },
    direction: DIRECTION[g.direction],
    ...(g.direction === 'range' ? { rangeLow: g.rangeLow, rangeHigh: g.rangeHigh } : { target: g.target }),
    targetDate: addDays(today, g.weeks * 7), cadence: g.cadence,
    actions: (g.actions ?? []).flatMap((k) => { const id = routineId(k); return id ? [{ routine: id }] : [] }),
  }
}
