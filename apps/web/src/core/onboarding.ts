import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { CATEGORIES, type Category, type UserProfile } from '@/db/schema'
import { buildRRule, type SimpleRule } from '@/domain/recurrence'
import { slugify } from './quicklog'
import { ensureTracker } from './ingest'
import { localDate } from './time'
import { insertPackGoalDraft } from './packs'
import { lockUser } from './recovery'
import { mergeProfile, profileMerge, type User } from './user'

// One-time setup (/welcome): profile, usual hours, areas, what The System trains first, daily targets,
// tone, goals and starter routines, in one write. Only the name, region and areas are required: anything
// left out keeps its saved value (or its usual default on first setup), so running setup again never
// overwrites a setting the user didn't touch.
// Templates are suggestions only; everything they create is an ordinary routine the user can edit.

import { TEMPLATES, type Template } from '@/domain/templates'
export { TEMPLATES, type Template }

export type OnboardingInput = {
  name: string
  timezone: string
  baseCurrency: string
  areas: Category[]
  focus?: Category
  templates?: string[]
  /** Routines an AI proposed (only the ticked ones are created). */
  generated?: Template[]
  sleepHours?: number
  steps?: number
  waterMl?: number
  goals?: string
  constraints?: string
  tone?: 'gentle' | 'balanced' | 'blunt'
  /** Usual wake and bed times, "HH:MM". Given together, they also set quiet hours. */
  wake?: string
  sleep?: string
  /** Stats The System should train first, in priority order (signal ids from core/patterns). */
  improve: string[]
  /** The starter pack picked on the Start step: it adds one pending goal draft with a check-in measure. */
  pack?: string
}

const TONE_NOTE: Record<NonNullable<OnboardingInput['tone']>, string> = {
  gentle: 'Be gentle and encouraging. Celebrate small wins.',
  balanced: 'Be honest and kind. One clear suggestion at a time.',
  blunt: 'Be blunt. Skip the praise and tell me what to change.',
}

/**
 * Write everything from the flow. Safe to run again: existing routines (same name) are left alone.
 * One transaction under the user lock: a double submit takes turns (the second sees setup done, so it neither wipes
 * XP again nor repeats routines), and a rescoring run waits for the whole fresh start instead of landing in the middle.
 * The profile is read again under the lock and only the changed keys are written, so a concurrent write to another
 * key (payments seen, celebrated level) survives.
 */
export async function completeOnboarding(user: User, input: OnboardingInput, now = new Date()) {
  const areas = CATEGORIES.filter((c) => input.areas.includes(c))
  const today = localDate(now, input.timezone)
  const { added, fresh } = await db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    const [saved] = await tx.select().from(schema.users).where(eq(schema.users.id, user.id))
    const cur = saved ?? user
    const tone = input.tone ?? cur.profile.tone ?? 'balanced'
    // The coach's notes start as the tone's own line. A new tone replaces that line, never words the user wrote.
    const notes = cur.profile.notes?.trim()
    const day = input.wake && input.sleep ? { wake: input.wake, sleep: input.sleep } : undefined
    // Quiet hours follow the usual hours, unless the user switched quiet hours off.
    const quietOff = !!cur.profile.notifications && 'quiet' in cur.profile.notifications && cur.profile.notifications.quiet === null
    // undefined keys are left out of the write, so anything not given keeps its saved value.
    const patch: Partial<UserProfile> = {
      goals: input.goals?.trim() || undefined,
      constraints: input.constraints?.trim() || undefined,
      notes: !notes || Object.values(TONE_NOTE).includes(notes) ? TONE_NOTE[tone] : undefined,
      tone,
      areas,
      focus: input.focus && areas.includes(input.focus) ? input.focus : areas[0],
      onboardedAt: now.toISOString(),
      improve: input.improve.length ? input.improve : undefined,
      // Usual hours, when given: Telegram stays quiet while they sleep; per-category settings are kept.
      ...(day ? { day } : {}),
      ...(day && !quietOff ? { notifications: { categories: {}, ...cur.profile.notifications, quiet: { from: day.sleep, to: day.wake } } } : {}),
    }
    // First time through is a fresh start: earlier XP, achievements, chests and freezes go, and XP counts from today.
    // Running setup again from Settings never resets.
    const fresh = !cur.profile.onboardedAt
    if (fresh) {
      patch.xpSince = today
      patch.paymentsSeenAt = now.toISOString() // payments already on record aren't announced as new
      await tx.delete(schema.xpEvents).where(eq(schema.xpEvents.userId, user.id))
      await tx.delete(schema.achievements).where(eq(schema.achievements.userId, user.id))
      await tx.delete(schema.chests).where(eq(schema.chests.userId, user.id))
      await tx.delete(schema.streakFreezes).where(eq(schema.streakFreezes.userId, user.id))
    }
    await tx.update(schema.users).set({
      name: input.name.trim() || cur.name, timezone: input.timezone, baseCurrency: input.baseCurrency, profile: profileMerge(patch),
    }).where(eq(schema.users.id, user.id))

    const existing = new Set((await tx.select({ name: schema.schedules.name }).from(schema.schedules)
      .where(eq(schema.schedules.userId, user.id))).map((r) => r.name.toLowerCase()))
    // Routine id by template id, for the pack's goal draft: a routine kept because the name already existed is found by name.
    const byName = new Map((await tx.select({ id: schema.schedules.id, name: schema.schedules.name }).from(schema.schedules)
      .where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true), eq(schema.schedules.kind, 'routine')))).map((r) => [r.name.toLowerCase(), r.id]))
    const routineIds = new Map<string, string>()
    let added = 0
    for (const t of [...TEMPLATES, ...(input.generated ?? [])]) {
      if (!input.templates?.includes(t.id) || !areas.includes(t.area) || existing.has(t.name.toLowerCase())) continue
      existing.add(t.name.toLowerCase())
      const trackerSlug = t.quantity ? slugify(t.name) : undefined
      const [row] = await tx.insert(schema.schedules).values({
        userId: user.id, name: t.name, kind: t.kind, category: t.area,
        rrule: buildRRule({ ...t.rule, start: today }),
        target: t.quantity ? input.waterMl ?? null : null, unit: t.quantity?.unit ?? null,
        meta: Object.fromEntries(Object.entries({ notes: t.note, dose: t.dose, doseCount: t.dose ? 1 : undefined, trackerSlug, step: t.quantity?.step })
          .filter(([, v]) => v !== undefined)),
      }).returning({ id: schema.schedules.id })
      routineIds.set(t.id, row.id)
      added++
    }
    if (input.pack) await insertPackGoalDraft(tx, user, input.pack, routineIds, byName, today)
    return { added, fresh }
  })

  // Daily targets. First setup creates the trackers with their usual targets; a target that already
  // exists changes only when one is given, so running setup again never overwrites it.
  const targets: [string, number | undefined, number, Parameters<typeof ensureTracker>[2]][] = [
    ['sleep.hours', input.sleepHours, 7.5, { name: 'Sleep', category: 'health', unit: 'h', aggregate: 'last' }],
    ['steps', input.steps, 8000, { name: 'Steps', category: 'health' }],
  ]
  for (const [slug, given, usual, d] of targets) {
    if (given === undefined && !fresh) continue
    const t = await ensureTracker(user.id, slug, { ...d, target: given ?? usual })
    if (given !== undefined) await db.update(schema.trackers).set({ target: given }).where(and(eq(schema.trackers.id, t.id), eq(schema.trackers.userId, user.id)))
  }
  return { added, fresh }
}

/** "Skip for now": never ask again, change nothing else. */
export async function skipOnboarding(user: User, now = new Date()) {
  await mergeProfile(user.id, { onboardedAt: now.toISOString() })
}
