'use server'

import { and, eq } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db, schema } from '@/db'
import { CATEGORIES } from '@/db/schema'
import { getUser } from '@/core/user'
import { addGoalProgress, setCheck } from '@/core/schedules'
import { applyQuickLog, parseQuickLog, slugify } from '@/core/quicklog'
import { persist, processOne } from '@/core/ingest'
import { localDate } from '@/core/time'
import { buildRRule, WEEKDAYS } from '@/domain/recurrence'
import { acceptInsight, dismissInsight } from '@/core/insights'

// Local single-user app: the server binds to 127.0.0.1 / Tailscale, and every action scopes
// writes to getUser(). When multi-user lands, getUser() becomes the session check.

export async function toggleCheck(scheduleId: string, occurrenceIso: string, status: 'done' | 'skipped' | null, value?: number) {
  const user = await getUser()
  await setCheck(user, scheduleId, new Date(occurrenceIso), status, value)
  refresh()
}

export async function addToGoal(scheduleId: string, amount: number) {
  await addGoalProgress(await getUser(), scheduleId, amount)
  refresh()
}

export async function quickLog(text: string): Promise<{ ok: boolean; message: string }> {
  const q = parseQuickLog(text)
  if (!q) return { ok: false, message: 'Try “water 250”, “mood 4” or “spent 120 chai”.' }
  const message = await applyQuickLog(await getUser(), q)
  refresh()
  return { ok: true, message }
}

const scheduleForm = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['routine', 'medicine', 'subscription', 'bill', 'renewal']),
  category: z.enum(CATEGORIES),
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.coerce.number().int().min(1).max(365).default(1),
  times: z.string().trim().default('09:00'),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  bymonthday: z.coerce.number().int().min(1).max(31).optional().or(z.literal('').transform(() => undefined)),
  bymonth: z.coerce.number().int().min(1).max(12).optional().or(z.literal('').transform(() => undefined)),
  remindOffsetMin: z.coerce.number().int().min(0).default(0),
  target: z.coerce.number().positive().optional().or(z.literal('').transform(() => undefined)),
  unit: z.string().trim().max(20).optional(),
  amount: z.coerce.number().nonnegative().optional().or(z.literal('').transform(() => undefined)),
  currency: z.string().trim().toUpperCase().max(5).optional(),
  dose: z.string().trim().max(40).optional(),
  stock: z.coerce.number().int().min(0).optional().or(z.literal('').transform(() => undefined)),
  step: z.coerce.number().positive().optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().trim().max(500).optional(),
})

export type FormState = { ok: boolean; error?: string } | null

export async function saveSchedule(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries([...form.entries()].filter(([k]) => k !== 'byweekday'))
  const parsed = scheduleForm.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const f = parsed.data
  const times = f.times.split(/[,\s]+/).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, '0'))
  if (!times.length) return { ok: false, error: 'Add at least one time, like 08:00' }
  const byweekday = form.getAll('byweekday').map(String).filter((d): d is (typeof WEEKDAYS)[number] => (WEEKDAYS as readonly string[]).includes(d))
  const rrule = buildRRule({
    freq: f.freq, interval: f.interval, times, start: f.start, until: f.until,
    byweekday: f.freq === 'weekly' ? byweekday : undefined, bymonthday: f.bymonthday, bymonth: f.bymonth,
  })
  const user = await getUser()
  const trackerSlug = f.target && f.kind === 'routine' ? slugify(f.name) : undefined
  const meta = {
    dose: f.dose || undefined, stock: f.stock, step: f.step, notes: f.notes || undefined,
    doseCount: 1, trackerSlug,
  }
  const values = {
    userId: user.id, name: f.name, kind: f.kind, category: f.category, rrule, remindOffsetMin: f.remindOffsetMin,
    target: f.target ?? null, unit: f.unit || null, amount: f.amount ?? null, currency: f.currency || (f.amount ? user.baseCurrency : null),
    meta: Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)),
  }
  if (f.id) {
    const [existing] = await db.select({ meta: schema.schedules.meta }).from(schema.schedules)
      .where(and(eq(schema.schedules.id, f.id), eq(schema.schedules.userId, user.id)))
    if (!existing) return { ok: false, error: 'Routine not found' }
    // Keep keys the form doesn't show (refillAt, source, ...); a cleared target drops the tracker link.
    const merged = { ...existing.meta, ...values.meta }
    if (!trackerSlug) delete merged.trackerSlug
    await db.update(schema.schedules).set({ ...values, meta: merged })
      .where(and(eq(schema.schedules.id, f.id), eq(schema.schedules.userId, user.id)))
  } else {
    await db.insert(schema.schedules).values(values)
  }
  refresh()
  return { ok: true }
}

export async function setScheduleActive(id: string, active: boolean) {
  const user = await getUser()
  await db.update(schema.schedules).set({ active }).where(and(eq(schema.schedules.id, id), eq(schema.schedules.userId, user.id)))
  refresh()
}

export async function deleteSchedule(id: string) {
  const user = await getUser()
  await db.delete(schema.schedules).where(and(eq(schema.schedules.id, id), eq(schema.schedules.userId, user.id)))
  refresh()
}

const trackerForm = z.object({
  name: z.string().trim().min(1).max(60),
  category: z.enum(CATEGORIES),
  kind: z.enum(['bool', 'number', 'duration', 'money', 'scale']),
  unit: z.string().trim().max(20).optional(),
  target: z.coerce.number().positive().optional().or(z.literal('').transform(() => undefined)),
  direction: z.enum(['up', 'down']).default('up'),
})

export async function createTracker(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = trackerForm.safeParse(Object.fromEntries(form.entries()))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message }
  const user = await getUser()
  const f = parsed.data
  await db.insert(schema.trackers).values({
    userId: user.id, slug: slugify(f.name), name: f.name, category: f.category, kind: f.kind,
    unit: f.unit || null, target: f.target ?? null, direction: f.direction,
    aggregate: f.kind === 'scale' ? 'last' : 'sum',
  }).onConflictDoNothing()
  refresh()
  return { ok: true }
}

export async function logEntry(slug: string, value: number, date?: string) {
  const user = await getUser()
  const scale = slug === 'mood' || slug === 'energy'
  await persist(user, {
    kind: 'entry', tracker: slug, value, source: 'manual', mode: 'set',
    date: date ?? localDate(new Date(), user.timezone),
    defaults: scale ? { kind: 'scale', aggregate: 'last', category: 'mind', target: 5 } : undefined,
  })
  refresh()
}

export async function archiveTracker(id: string) {
  const user = await getUser()
  await db.update(schema.trackers).set({ archivedAt: new Date() })
    .where(and(eq(schema.trackers.id, id), eq(schema.trackers.userId, user.id)))
  refresh()
}

/** Re-categorize a transaction and remember the rule for that merchant / UPI id. */
export async function recategorize(transactionId: string, category: string, remember: boolean) {
  const user = await getUser()
  const [t] = await db.update(schema.transactions).set({ category })
    .where(and(eq(schema.transactions.id, transactionId), eq(schema.transactions.userId, user.id)))
    .returning()
  const pattern = (t?.upiId ?? t?.merchant ?? '').toLowerCase().trim()
  if (t && remember && pattern) {
    await db.insert(schema.merchantRules).values({ userId: user.id, pattern, merchant: t.merchant ?? pattern, category })
      .onConflictDoUpdate({ target: [schema.merchantRules.userId, schema.merchantRules.pattern], set: { category } })
    // Apply to other transactions from the same merchant.
    const same = t.upiId ? eq(schema.transactions.upiId, t.upiId) : eq(schema.transactions.merchant, t.merchant ?? '')
    await db.update(schema.transactions).set({ category }).where(and(eq(schema.transactions.userId, user.id), same))
  }
  refresh()
}

export async function retryRawEvent(id: string) {
  const user = await getUser()
  const [row] = await db.select().from(schema.rawEvents)
    .where(and(eq(schema.rawEvents.id, id), eq(schema.rawEvents.userId, user.id)))
  if (row) await processOne(user, row)
  refresh()
}

export async function ignoreRawEvent(id: string) {
  const user = await getUser()
  await db.update(schema.rawEvents).set({ status: 'ignored' })
    .where(and(eq(schema.rawEvents.id, id), eq(schema.rawEvents.userId, user.id)))
  refresh()
}

export async function resolveInsight(id: string, decision: 'accept' | 'dismiss') {
  const user = await getUser()
  if (decision === 'accept') await acceptInsight(user, id)
  else await dismissInsight(user, id)
  refresh()
}

const learningForm = z.object({
  title: z.string().trim().min(1).max(120),
  provider: z.string().trim().max(60).optional(),
  url: z.string().trim().url().optional().or(z.literal('').transform(() => undefined)),
  cost: z.coerce.number().nonnegative().optional().or(z.literal('').transform(() => undefined)),
  currency: z.string().trim().toUpperCase().max(5).optional(),
  progressTotal: z.coerce.number().int().positive().optional().or(z.literal('').transform(() => undefined)),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
})

export async function createLearningItem(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = learningForm.safeParse(Object.fromEntries(form.entries()))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message }
  const user = await getUser()
  const f = parsed.data
  await db.insert(schema.learningItems).values({
    userId: user.id, title: f.title, provider: f.provider || null, url: f.url ?? null,
    cost: f.cost ?? null, currency: f.currency || (f.cost ? user.baseCurrency : null),
    progressTotal: f.progressTotal ?? null, targetDate: f.targetDate ?? null,
  })
  refresh()
  return { ok: true }
}

export async function updateLearningProgress(id: string, delta: { done?: number; minutes?: number; status?: 'active' | 'paused' | 'done' }) {
  const user = await getUser()
  const [item] = await db.select().from(schema.learningItems)
    .where(and(eq(schema.learningItems.id, id), eq(schema.learningItems.userId, user.id)))
  if (!item) return
  const progressDone = Math.max(0, item.progressDone + (delta.done ?? 0))
  await db.update(schema.learningItems).set({
    progressDone: item.progressTotal ? Math.min(item.progressTotal, progressDone) : progressDone,
    minutesLogged: item.minutesLogged + (delta.minutes ?? 0),
    status: delta.status ?? (item.progressTotal && progressDone >= item.progressTotal ? 'done' : item.status),
  }).where(eq(schema.learningItems.id, id))
  if (delta.minutes) {
    await persist(user, {
      kind: 'entry', tracker: 'learning.minutes', date: localDate(new Date(), user.timezone), value: delta.minutes,
      source: 'manual', mode: 'add', defaults: { name: 'Learning', category: 'skills', unit: 'min', kind: 'duration' },
    })
  }
  refresh()
}

const personForm = z.object({
  name: z.string().trim().min(1).max(80),
  relation: z.string().trim().max(40).optional(),
  contactEveryDays: z.coerce.number().int().positive().optional().or(z.literal('').transform(() => undefined)),
})

export async function createPerson(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = personForm.safeParse(Object.fromEntries(form.entries()))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message }
  const user = await getUser()
  await db.insert(schema.people).values({ userId: user.id, ...parsed.data, relation: parsed.data.relation || null, contactEveryDays: parsed.data.contactEveryDays ?? null })
  refresh()
  return { ok: true }
}

export async function markContacted(id: string) {
  const user = await getUser()
  await db.update(schema.people).set({ lastContactedAt: new Date() })
    .where(and(eq(schema.people.id, id), eq(schema.people.userId, user.id)))
  await persist(user, {
    kind: 'entry', tracker: 'people.contacts', date: localDate(new Date(), user.timezone), value: 1, source: 'manual',
    mode: 'add', defaults: { name: 'People contacted', category: 'relationships' },
  })
  refresh()
}

export async function saveProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser()
  const get = (k: string) => String(form.get(k) ?? '').trim().slice(0, 4000)
  await db.update(schema.users).set({
    name: get('name') || user.name,
    timezone: get('timezone') || user.timezone,
    baseCurrency: (get('baseCurrency') || user.baseCurrency).toUpperCase(),
    profile: { goals: get('goals'), constraints: get('constraints'), notes: get('notes') },
  }).where(eq(schema.users.id, user.id))
  const { clearUserCache } = await import('@/core/user')
  clearUserCache()
  refresh()
  return { ok: true }
}

export async function syncNow(connectorId: string) {
  const { runConnector } = await import('@/worker/sync')
  const r = await runConnector(connectorId)
  refresh()
  return r
}

/** Connect dialog submit. Only the fields the integration declares are read. */
export async function connectIntegration(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser()
  const { connect } = await import('@/core/secrets')
  const r = await connect(user.id, id, Object.fromEntries(form.entries()))
  refresh()
  return r
}

export async function disconnectIntegration(id: string) {
  const user = await getUser()
  const { disconnect } = await import('@/core/secrets')
  await disconnect(user.id, id)
  refresh()
}

export async function ask(question: string): Promise<{ answer: string; error?: string }> {
  const q = question.trim().slice(0, 1000)
  if (!q) return { answer: '', error: 'Ask a question about your data.' }
  const { askData } = await import('@/ai/ask')
  const r = await askData(q)
  refresh()
  return r
}
