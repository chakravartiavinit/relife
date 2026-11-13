import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { CATEGORIES, type Category, type UserProfile } from '@/db/schema'
import { buildRRule, type SimpleRule } from '@/domain/recurrence'
import { slugify } from './quicklog'
import { ensureTracker } from './ingest'
import { localDate } from './time'
import { lockUser } from './recovery'
import { mergeProfile, profileMerge, type User } from './user'

// One-time setup (/welcome): profile, usual hours, areas, what The System trains first, daily targets,
// tone, goals and starter routines, in one write. Only the name, region and areas are required: anything
// left out keeps its saved value (or its usual default on first setup), so running setup again never
// overwrites a setting the user didn't touch.
// Templates are suggestions only; everything they create is an ordinary routine the user can edit.

export type Template = {
  id: string
  area: Category
  name: string
  kind: 'routine' | 'medicine'
  rule: Omit<SimpleRule, 'start'>
  note?: string
  /** Quantity routine (water): the target comes from the goals step. */
  quantity?: { unit: string; step: number }
  dose?: string
  suggested?: boolean
}

const daily = (...times: string[]): Omit<SimpleRule, 'start'> => ({ freq: 'daily', times })
const weekly = (byweekday: SimpleRule['byweekday'], time: string): Omit<SimpleRule, 'start'> => ({ freq: 'weekly', times: [time], byweekday })

export const TEMPLATES: Template[] = [
  { id: 'water', area: 'health', name: 'Drink water', kind: 'routine', rule: daily('10:00', '13:00', '16:00', '19:00'), quantity: { unit: 'ml', step: 250 }, suggested: true },
  { id: 'morning-skincare', area: 'health', name: 'Morning skincare', kind: 'routine', rule: daily('08:00'), note: 'Cleanser · serum · sunscreen' },
  { id: 'night-skincare', area: 'health', name: 'Night skincare', kind: 'routine', rule: daily('22:30') },
  { id: 'workout', area: 'health', name: 'Workout', kind: 'routine', rule: weekly(['MO', 'WE', 'FR'], '07:00'), suggested: true },
  { id: 'vitamin', area: 'health', name: 'Vitamin D3', kind: 'medicine', rule: daily('09:00'), dose: '1 capsule' },
  { id: 'lights-out', area: 'health', name: 'Lights out', kind: 'routine', rule: daily('23:00') },
  { id: 'journal', area: 'mind', name: 'Journal', kind: 'routine', rule: daily('22:00'), note: 'Three lines', suggested: true },
  { id: 'meditate', area: 'mind', name: 'Meditate', kind: 'routine', rule: daily('07:30'), note: '10 minutes' },
  { id: 'no-phone', area: 'mind', name: 'No phone after 11', kind: 'routine', rule: daily('23:00') },
  { id: 'practice', area: 'skills', name: 'Practice coding', kind: 'routine', rule: daily('19:00'), note: 'One problem', suggested: true },
  { id: 'read', area: 'skills', name: 'Read 20 pages', kind: 'routine', rule: daily('21:30') },
  { id: 'course', area: 'skills', name: 'Course session', kind: 'routine', rule: weekly(['TU', 'TH', 'SA'], '20:00'), note: '30 minutes' },
  { id: 'budget', area: 'wealth', name: 'Review budget', kind: 'routine', rule: weekly(['SU'], '10:00'), suggested: true },
  { id: 'log-spends', area: 'wealth', name: 'Log today’s spends', kind: 'routine', rule: daily('21:00') },
  { id: 'save', area: 'wealth', name: 'Move money to savings', kind: 'routine', rule: { freq: 'monthly', times: ['10:00'], bymonthday: 1 } },
  { id: 'hobby-practice', area: 'hobbies', name: 'Practise your hobby', kind: 'routine', rule: daily('20:00'), note: '20 minutes', suggested: true },
  { id: 'hobby-weekend', area: 'hobbies', name: 'Weekend project', kind: 'routine', rule: weekly(['SA', 'SU'], '11:00'), note: 'An hour on something you make' },
  { id: 'call-parents', area: 'relationships', name: 'Call parents', kind: 'routine', rule: weekly(['WE', 'SU'], '18:00'), suggested: true },
  { id: 'friend', area: 'relationships', name: 'Catch up with a friend', kind: 'routine', rule: weekly(['SA'], '17:00') },
  { id: 'reach-out', area: 'relationships', name: 'Message someone you miss', kind: 'routine', rule: weekly(['TH'], '20:00') },
]

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
    let added = 0
    for (const t of [...TEMPLATES, ...(input.generated ?? [])]) {
      if (!input.templates?.includes(t.id) || !areas.includes(t.area) || existing.has(t.name.toLowerCase())) continue
      existing.add(t.name.toLowerCase())
      const trackerSlug = t.quantity ? slugify(t.name) : undefined
      await tx.insert(schema.schedules).values({
        userId: user.id, name: t.name, kind: t.kind, category: t.area,
        rrule: buildRRule({ ...t.rule, start: today }),
        target: t.quantity ? input.waterMl ?? null : null, unit: t.quantity?.unit ?? null,
        meta: Object.fromEntries(Object.entries({ notes: t.note, dose: t.dose, doseCount: t.dose ? 1 : undefined, trackerSlug, step: t.quantity?.step })
          .filter(([, v]) => v !== undefined)),
      })
      added++
    }
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
