import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { CATEGORIES, type Category, type UserProfile } from '@/db/schema'
import { buildRRule, type SimpleRule } from '@/domain/recurrence'
import { slugify } from './quicklog'
import { ensureTracker } from './ingest'
import { localDate } from './time'
import type { User } from './user'

// One-time setup (/welcome): profile, areas, starter routines and daily targets in one write.
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
  templates: string[]
  /** Routines the AI proposed on the routines step (only the ticked ones are created). */
  generated?: Template[]
  sleepHours: number
  steps: number
  waterMl: number
  goals: string
  constraints: string
  tone: 'gentle' | 'balanced' | 'blunt'
}

const TONE_NOTE: Record<OnboardingInput['tone'], string> = {
  gentle: 'Be gentle and encouraging. Celebrate small wins.',
  balanced: 'Be honest and kind. One clear suggestion at a time.',
  blunt: 'Be blunt. Skip the praise and tell me what to change.',
}

/** Write everything from the flow. Safe to run again: existing routines (same name) are left alone. */
export async function completeOnboarding(user: User, input: OnboardingInput, now = new Date()) {
  const areas = CATEGORIES.filter((c) => input.areas.includes(c))
  const today = localDate(now, input.timezone)
  const profile: UserProfile = {
    ...user.profile,
    goals: input.goals.trim() || user.profile.goals,
    constraints: input.constraints.trim() || user.profile.constraints,
    notes: user.profile.notes?.trim() ? user.profile.notes : TONE_NOTE[input.tone],
    tone: input.tone,
    areas,
    focus: input.focus && areas.includes(input.focus) ? input.focus : areas[0],
    onboardedAt: now.toISOString(),
  }
  // First time through is a fresh start: earlier XP, achievements, chests and freezes go, and XP counts from today.
  // Running setup again from Settings never resets.
  const fresh = !user.profile.onboardedAt
  if (fresh) {
    profile.xpSince = today
    await db.delete(schema.xpEvents).where(eq(schema.xpEvents.userId, user.id))
    await db.delete(schema.achievements).where(eq(schema.achievements.userId, user.id))
    await db.delete(schema.chests).where(eq(schema.chests.userId, user.id))
    await db.delete(schema.streakFreezes).where(eq(schema.streakFreezes.userId, user.id))
  }
  await db.update(schema.users).set({
    name: input.name.trim() || user.name, timezone: input.timezone, baseCurrency: input.baseCurrency, profile,
  }).where(eq(schema.users.id, user.id))

  const existing = new Set((await db.select({ name: schema.schedules.name }).from(schema.schedules)
    .where(eq(schema.schedules.userId, user.id))).map((r) => r.name.toLowerCase()))
  let added = 0
  for (const t of [...TEMPLATES, ...(input.generated ?? [])]) {
    if (!input.templates.includes(t.id) || !areas.includes(t.area) || existing.has(t.name.toLowerCase())) continue
    const trackerSlug = t.quantity ? slugify(t.name) : undefined
    await db.insert(schema.schedules).values({
      userId: user.id, name: t.name, kind: t.kind, category: t.area,
      rrule: buildRRule({ ...t.rule, start: today }),
      target: t.quantity ? input.waterMl : null, unit: t.quantity?.unit ?? null,
      meta: Object.fromEntries(Object.entries({ notes: t.note, dose: t.dose, doseCount: t.dose ? 1 : undefined, trackerSlug, step: t.quantity?.step })
        .filter(([, v]) => v !== undefined)),
    })
    added++
  }

  // Daily targets: create the trackers if needed, then set the target.
  const targets: [string, number, Parameters<typeof ensureTracker>[2]][] = [
    ['sleep.hours', input.sleepHours, { name: 'Sleep', category: 'health', unit: 'h', aggregate: 'last' }],
    ['steps', input.steps, { name: 'Steps', category: 'health' }],
  ]
  for (const [slug, target, d] of targets) {
    const t = await ensureTracker(user.id, slug, { ...d, target })
    await db.update(schema.trackers).set({ target }).where(and(eq(schema.trackers.id, t.id), eq(schema.trackers.userId, user.id)))
  }
  return { added, fresh }
}

/** "Skip for now": never ask again, change nothing else. */
export async function skipOnboarding(user: User, now = new Date()) {
  await db.update(schema.users).set({ profile: { ...user.profile, onboardedAt: now.toISOString() } }).where(eq(schema.users.id, user.id))
}
