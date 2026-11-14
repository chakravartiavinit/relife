import { z } from 'zod'

/**
 * relifePack v1: routines, trackers and goals as plain JSON, made to be shared. The built-in starter packs
 * (apps/web/src/packs) use it, and so will the templates gallery. A pack holds no ids, entries, values, baselines or
 * dates, and nothing in it is a number of money: money trackers are not allowed.
 *
 * Categories are copied from apps/web (`CATEGORIES`); a web test keeps the two lists equal.
 */

export const PACK_FORMAT = 'relife.pack'
export const PACK_VERSION = 1
/** Files over this size are refused before they are parsed. */
export const PACK_MAX_BYTES = 64 * 1024

/** How many of each a pack may hold. The schema below and the web app's server action checks both read this. */
export const PACK_LIMITS = { routines: 40, trackers: 20, goals: 3, slug: 40 } as const

export const PACK_CATEGORIES = ['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships'] as const
export const PackCategory = z.enum(PACK_CATEGORIES)

const slug = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/).max(PACK_LIMITS.slug)
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const Weekday = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])

/** Mirrors `SimpleRule` in apps/web/src/domain/recurrence.ts, without the dates. */
export const PackRule = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly']),
  times: z.array(HHMM).min(1).max(8),
  byweekday: z.array(Weekday).max(7).optional(),
  bymonthday: z.number().int().min(1).max(31).optional(),
  interval: z.number().int().min(1).max(12).optional(),
})

export const PackRoutine = z.object({
  key: slug,
  name: z.string().min(1).max(60),
  area: PackCategory,
  kind: z.enum(['routine', 'medicine']),
  rule: PackRule,
  note: z.string().max(120).optional(),
  dose: z.string().max(40).optional(),
  quantity: z.object({ unit: z.string().min(1).max(12), step: z.number().positive(), target: z.number().positive().optional() }).optional(),
})

export const PackTracker = z.object({
  slug,
  name: z.string().min(1).max(60),
  area: PackCategory,
  // No `money`: a pack never carries amounts.
  kind: z.enum(['bool', 'number', 'duration', 'scale']),
  unit: z.string().max(12).optional(),
  target: z.number().finite().optional(),
  direction: z.enum(['up', 'down']).optional(),
  aggregate: z.enum(['sum', 'last']).optional(),
})

export const PackGoal = z.object({
  key: slug,
  title: z.string().min(1).max(80),
  reason: z.string().max(200).optional(),
  area: PackCategory,
  measure: z.union([
    z.object({ tracker: slug }),
    z.object({ checkIn: z.string().min(1).max(80), unit: z.string().max(20).optional() }),
  ]),
  direction: z.enum(['up', 'down', 'range']),
  target: z.number().finite().optional(),
  rangeLow: z.number().finite().optional(),
  rangeHigh: z.number().finite().optional(),
  /** Weeks from the day the pack is applied to the target date. */
  weeks: z.number().int().min(4).max(26),
  cadence: z.enum(['weekly', 'fortnightly', 'monthly']),
  /** Routine keys or tracker slugs from this same pack: at most three. */
  actions: z.array(z.string().max(40)).max(3).optional(),
})

export const Pack = z.object({
  format: z.literal(PACK_FORMAT),
  version: z.literal(PACK_VERSION, { error: 'Made by a newer version' }),
  id: slug,
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(280),
  author: z.string().max(60).optional(),
  homepage: z.url({ protocol: /^https$/ }).optional(),
  areas: z.array(PackCategory).max(6).optional(),
  /** Signal ids from the web app's patterns (`tracker:steps`, `spend`…). Unknown ids are dropped on import. */
  improve: z.array(z.string().max(60)).max(3).optional(),
  routines: z.array(PackRoutine).max(PACK_LIMITS.routines),
  trackers: z.array(PackTracker).max(PACK_LIMITS.trackers),
  goals: z.array(PackGoal).max(PACK_LIMITS.goals),
  /**
   * Setup extras of the built-in starter packs (not part of a shared pack's effect): daily targets for the
   * Routines step, and connector ids to suggest on the Connect step.
   */
  targets: z.object({
    sleepHours: z.number().min(4).max(12).optional(),
    steps: z.number().int().min(500).max(50_000).optional(),
    waterMl: z.number().int().min(500).max(6_000).optional(),
  }).optional(),
  sources: z.array(z.string().max(40)).max(8).optional(),
})
export type Pack = z.infer<typeof Pack>
export type PackRoutine = z.infer<typeof PackRoutine>
export type PackTracker = z.infer<typeof PackTracker>
export type PackGoal = z.infer<typeof PackGoal>

/** Parse the text of a pack file: size first, then JSON, then the schema. The message is meant for the user. */
export function parsePack(text: string): { ok: true; pack: Pack } | { ok: false; error: string } {
  if (new TextEncoder().encode(text).length > PACK_MAX_BYTES) return { ok: false, error: 'This pack is larger than 64 KB.' }
  let json: unknown
  try { json = JSON.parse(text) } catch { return { ok: false, error: 'This is not a pack file (not valid JSON).' } }
  const r = Pack.safeParse(json)
  if (r.success) return { ok: true, pack: r.data }
  const issue = r.error.issues[0]
  return { ok: false, error: issue.path[0] === 'version' ? issue.message : `This pack is not valid: ${issue.path.join('.') || 'file'} ${issue.message}` }
}
