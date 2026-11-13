import { z } from 'zod'
import { ActivityKind } from './common'

/** What the extension and the Mac app show for "Today": the character, quests, routines and goals, in one request. */

const RoutineStatus = z.enum(['done', 'skipped', 'pending', 'missed'])

export const TodayView = z.object({
  /** The user's local date, YYYY-MM-DD. */
  today: z.string(),
  /** First name. */
  name: z.string(),
  character: z.object({
    level: z.number(), title: z.string(), total: z.number(), floor: z.number(), next: z.number(), progress: z.number(),
    todayXp: z.number(), streak: z.number(), best: z.number(), doneToday: z.boolean(), freezes: z.number(),
  }),
  /** System quests (the coach's daily challenges). */
  quests: z.array(z.object({
    id: z.string(), title: z.string(), area: z.string(),
    rank: z.enum(['E', 'D', 'C', 'B', 'A', 'S']), xp: z.number(),
    status: z.enum(['active', 'cleared', 'failed', 'unverified', 'cancelled']),
    progress: z.number().nullable(), target: z.number(), unit: z.string().nullable(), op: z.enum(['gte', 'lte']),
  })),
  /** Checkable routines. `occurrence` is an ISO instant; `time` is it formatted in the user's zone. */
  routines: z.array(z.object({
    scheduleId: z.string(), occurrence: z.iso.datetime(), time: z.string(), name: z.string(), kind: z.string(), area: z.string(),
    status: RoutineStatus, xp: z.number(),
  })),
  /** Quantity routines (water): `value` of `target` so far, `step` is the quick-add amount. */
  goals: z.array(z.object({
    scheduleId: z.string(), name: z.string(), area: z.string(), value: z.number(), target: z.number(),
    unit: z.string(), step: z.number(), trackerSlug: z.string(),
  })),
  done: z.number(),
  total: z.number(),
  /** What the toolbar badge counts: routines and goals still open plus quests not yet cleared. */
  left: z.number(),
  focus: z.object({
    seconds: z.number(),
    byKind: z.array(z.object({ kind: ActivityKind, seconds: z.number() })),
  }),
})
export type TodayView = z.infer<typeof TodayView>

/** GET /api/v1/today (and the older GET /api/companion): the view plus `ok`. */
export const TodayResponse = TodayView.extend({ ok: z.literal(true) })
export type TodayResponse = z.infer<typeof TodayResponse>

const logValue = z.number().finite().min(-1_000_000).max(1_000_000)

/** POST /api/v1/today/actions (send an `Idempotency-Key` header): check a routine, add to a goal, or quick-log. */
export const TodayAction = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('check'), scheduleId: z.string().uuid(),
    occurrence: z.iso.datetime(),
    /** null undoes the check. */
    status: z.enum(['done', 'skipped']).nullable(),
  }),
  z.object({ action: z.literal('add'), scheduleId: z.string().uuid(), amount: logValue }),
  z.object({ action: z.literal('log'), text: z.string().trim().min(1).max(200) }),
])
export type TodayAction = z.infer<typeof TodayAction>

/** What a log just changed, for toasts and celebrations. */
export const XpNews = z.object({
  levelUp: z.object({ level: z.number(), title: z.string(), from: z.number(), newTitle: z.boolean() }).optional(),
  unlocked: z.array(z.object({ key: z.string(), name: z.string(), tier: z.enum(['bronze', 'silver', 'gold']), xp: z.number() })),
  chests: z.number().optional(),
})
export type XpNews = z.infer<typeof XpNews>

export const TodayActionResult = z.object({
  ok: z.literal(true),
  message: z.string(),
  news: XpNews,
  view: TodayView,
})
export type TodayActionResult = z.infer<typeof TodayActionResult>
