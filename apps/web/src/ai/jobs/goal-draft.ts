import { Output } from 'ai'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/db'
import { CATEGORIES } from '@/db/schema'
import { lockUser } from '@/core/recovery'
import { localDate } from '@/core/time'
import type { User } from '@/core/user'
import { CADENCES, DIRECTIONS, MAX_PENDING_DRAFTS, checkGoalDraft, goalIsSensitive, type GoalDraft } from '@/domain/goals'
import { aiEnabled, model } from '../models'
import { generate } from '../run'
import { COACH_SYSTEM } from '../context'
import { mask } from '../mask'

// One outcome goal draft from the user's own goals text. It is a pending insight; only the Goals form can turn it
// into a goal (core/goals.ts saveGoal). The model never supplies a baseline.

export const MAX_PENDING = MAX_PENDING_DRAFTS

const draftSchema = z.object({
  title: z.string().max(120),
  reason: z.string().max(500).describe('why it matters, in the user’s own terms'),
  area: z.enum(CATEGORIES),
  measure: z.object({
    tracker: z.string().max(80).optional().describe('slug from the trackers list, when one measures the outcome'),
    checkIn: z.string().max(80).optional().describe('a periodic check-in name when no tracker measures the outcome'),
    unit: z.string().max(20).optional(),
    how: z.string().max(200).optional().describe('how the check-in is measured'),
  }),
  direction: z.enum(DIRECTIONS),
  target: z.number().finite().optional(),
  rangeLow: z.number().finite().optional(),
  rangeHigh: z.number().finite().optional(),
  targetDate: z.string().describe('YYYY-MM-DD, after today, within 2 years'),
  cadence: z.enum(CADENCES),
  actions: z.array(z.object({
    routine: z.string().max(60).optional().describe('id from the routines list'),
    tracker: z.string().max(80).optional().describe('slug from the trackers list'),
  })).min(1).max(3),
})

async function pendingDrafts(userId: string, q: Pick<typeof db, 'select'> = db) {
  const [{ n }] = await q.select({ n: sql<number>`count(*)::int` }).from(schema.insights)
    .where(and(eq(schema.insights.userId, userId), eq(schema.insights.status, 'pending'), sql`${schema.insights.payload} ? 'goalDraft'`))
  return n
}

export type DraftResult = { status: 'created'; id: string } | { status: 'unavailable' | 'no_goals_text' | 'limit' | 'unsafe' | 'failed' }

export async function draftGoal(user: User, now = new Date()): Promise<DraftResult> {
  if (!aiEnabled('plan')) return { status: 'unavailable' }
  const goalsText = user.profile.goals?.trim()
  if (!goalsText) return { status: 'no_goals_text' }
  if (await pendingDrafts(user.id) >= MAX_PENDING) return { status: 'limit' }
  const today = localDate(now, user.timezone)
  const [trackers, routines] = await Promise.all([
    db.select({ id: schema.trackers.id, slug: schema.trackers.slug, name: schema.trackers.name, unit: schema.trackers.unit, category: schema.trackers.category, kind: schema.trackers.kind })
      .from(schema.trackers).where(and(eq(schema.trackers.userId, user.id), isNull(schema.trackers.archivedAt))),
    db.select({ id: schema.schedules.id, name: schema.schedules.name, category: schema.schedules.category }).from(schema.schedules)
      .where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true), eq(schema.schedules.kind, 'routine'))),
  ])
  // Sensitive measures are never offered to the model.
  const safeTrackers = trackers.filter((t) => !goalIsSensitive(t.slug, t.name, t.unit)).slice(0, 60)
  const safeRoutines = routines.filter((r) => !goalIsSensitive(r.name)).slice(0, 40)
  let raw: z.infer<typeof draftSchema> | undefined
  try {
    const res = await generate('plan', 'goals.draft', {
      model: model('plan'),
      output: Output.object({ schema: draftSchema }),
      system: `${COACH_SYSTEM}\nDraft ONE outcome goal from the user's goals text. The outcome measures a result, not activity time. Link 1-3 existing routines or trackers as actions. Use only IDs and slugs from the lists. Never draft medical, body weight, calorie, medication or symptom goals. Do not invent a baseline. The user reviews and decides.`,
      prompt: mask(JSON.stringify({
        today,
        goalsText: { untrusted: true, text: goalsText.slice(0, 1_000) },
        trackers: safeTrackers.map((t) => ({ slug: t.slug, name: t.name, unit: t.unit, kind: t.kind, area: t.category })),
        routines: safeRoutines.map((r) => ({ id: r.id, name: r.name, area: r.category })),
      })),
    })
    raw = res.output ?? undefined
  } catch {
    return { status: 'failed' }
  }
  if (!raw) return { status: 'failed' }
  const checked = checkGoalDraft(raw, { today, trackers: safeTrackers, routines: safeRoutines })
  if (!checked.ok) return { status: 'unsafe' }
  const draft: GoalDraft = checked.draft
  // Recount and insert under the user-row lock: two quick requests can't pass the limit together.
  const row = await db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    if (await pendingDrafts(user.id, tx) >= MAX_PENDING) return null
    const [inserted] = await tx.insert(schema.insights).values({
      userId: user.id, kind: 'plan', status: 'pending', title: `Goal draft: ${draft.title}`.slice(0, 140), body: draft.reason,
      payload: { goalDraft: draft, dedupeKey: `goal-draft:${today}:${now.getTime()}` },
    }).returning({ id: schema.insights.id })
    return inserted
  })
  return row ? { status: 'created', id: row.id } : { status: 'limit' }
}
