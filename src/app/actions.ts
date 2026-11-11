'use server'

import { and, eq, inArray, sql } from 'drizzle-orm'
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
import type { XpNews } from '@/core/xp'

// Local single-user app: the server binds to 127.0.0.1 / Tailscale, and every action scopes
// writes to getUser(). When multi-user lands, getUser() becomes the session check.
// Server actions are plain POST endpoints, so arguments are checked here, not only in the forms.

/** A logged amount: finite and within a sane range, so NaN or 1e308 never reaches a tracker. */
const logValue = z.number().finite().min(-1_000_000).max(1_000_000)
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Invalid date')
const isoTime = z.string().max(40).refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid time')
const slugArg = z.string().trim().min(1).max(80)

/** Rescore today's XP after a log. Never lets a scoring problem block the log itself. */
async function xpAfterLog(user: Awaited<ReturnType<typeof getUser>>): Promise<XpNews> {
  try {
    const { refreshXp } = await import('@/core/xp')
    return await refreshXp(user)
  } catch (e) {
    console.error('[xp]', e instanceof Error ? e.message : e)
    return { unlocked: [] }
  }
}

export async function toggleCheck(scheduleId: string, occurrenceIso: string, status: 'done' | 'skipped' | null, value?: number): Promise<XpNews> {
  isoTime.parse(occurrenceIso)
  z.enum(['done', 'skipped']).nullable().parse(status)
  logValue.optional().parse(value)
  const user = await getUser()
  await setCheck(user, scheduleId, new Date(occurrenceIso), status, value)
  const news = await xpAfterLog(user)
  refresh()
  return news
}

export async function addToGoal(scheduleId: string, amount: number): Promise<XpNews> {
  const n = logValue.parse(amount)
  const user = await getUser()
  await addGoalProgress(user, scheduleId, n)
  const news = await xpAfterLog(user)
  refresh()
  return news
}

/** A quantity goal's daily target (water: 3,000 ml). Scoped to the user; refreshes Today. */
export async function setGoalTarget(scheduleId: string, target: number) {
  const t = z.number().positive().max(1_000_000).parse(target)
  const user = await getUser()
  await db.update(schema.schedules).set({ target: t })
    .where(and(eq(schema.schedules.id, scheduleId), eq(schema.schedules.userId, user.id)))
  refresh()
}

export async function quickLog(text: string): Promise<{ ok: boolean; message: string; news?: XpNews }> {
  const q = parseQuickLog(text)
  if (!q) return { ok: false, message: 'Try “water 250”, “mood 4” or “spent 120 chai”' }
  const user = await getUser()
  const message = await applyQuickLog(user, q)
  const news = await xpAfterLog(user)
  refresh()
  return { ok: true, message, news }
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
  // A new or changed subscription is money data: let the nudges look at it now.
  if (f.kind !== 'routine' && f.kind !== 'medicine') await (await import('@/jobs')).emit('data.changed')
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

const hobbyForm = z.object({
  name: z.string().trim().min(1, 'Name your hobby.').max(40),
  weekly: z.coerce.number().int().min(10, 'Aim for at least 10 minutes a week.').max(3000).default(150),
})

/** Hobbies → Add a hobby: a minutes tracker in the Hobbies area. The weekly goal is stored as a daily target. */
export async function createHobby(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = hobbyForm.safeParse(Object.fromEntries(form.entries()))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message }
  const user = await getUser()
  const { name, weekly } = parsed.data
  const slug = slugify(name)
  if (!slug) return { ok: false, error: 'Use letters or numbers in the name.' }
  const values = { category: 'hobbies' as const, kind: 'duration' as const, unit: 'min', target: Math.round((weekly / 7) * 10) / 10, direction: 'up' as const, aggregate: 'sum' as const, archivedAt: null }
  // A tracker with this name may exist already (e.g. "guitar 30" typed before): move it into Hobbies.
  await db.insert(schema.trackers).values({ userId: user.id, slug, name, ...values })
    .onConflictDoUpdate({ target: [schema.trackers.userId, schema.trackers.slug], set: values })
  refresh()
  return { ok: true }
}

/** Log practice minutes for a hobby. Returns XP news for the toast and celebrations. */
export async function logPractice(slug: string, minutes: number) {
  const user = await getUser()
  const m = z.number().int().min(1).max(720).parse(minutes)
  await persist(user, {
    kind: 'entry', tracker: slug, value: m, source: 'manual', mode: 'add', date: localDate(new Date(), user.timezone),
    defaults: { category: 'hobbies', unit: 'min', kind: 'duration' },
  })
  const news = await xpAfterLog(user)
  refresh()
  return news
}

export async function logEntry(slug: string, value: number, date?: string) {
  slugArg.parse(slug)
  logValue.parse(value)
  ymd.optional().parse(date)
  const user = await getUser()
  const scale = slug === 'mood' || slug === 'energy'
  await persist(user, {
    kind: 'entry', tracker: slug, value, source: 'manual', mode: 'set',
    date: date ?? localDate(new Date(), user.timezone),
    defaults: scale ? { kind: 'scale', aggregate: 'last', category: 'mind', target: 5 } : undefined,
  })
  const news = await xpAfterLog(user)
  refresh()
  return news
}

export async function archiveTracker(id: string) {
  const user = await getUser()
  await db.update(schema.trackers).set({ archivedAt: new Date() })
    .where(and(eq(schema.trackers.id, id), eq(schema.trackers.userId, user.id)))
  refresh()
}

/** Re-categorize a transaction and remember the rule for that merchant / UPI id. */
export async function recategorize(transactionId: string, category: string, remember: boolean) {
  category = z.string().trim().min(1).max(60).parse(category)
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

/** Re-read raw messages. Returns how they came out, so the Inbox can say "Saved" or "Still waiting". */
export async function retryRawEvents(ids: string[]) {
  const user = await getUser()
  const rows = ids.length ? await db.select().from(schema.rawEvents)
    .where(and(inArray(schema.rawEvents.id, ids.slice(0, 200)), eq(schema.rawEvents.userId, user.id))) : []
  const out = { parsed: 0, ignored: 0, failed: 0 }
  for (const row of rows) out[await processOne(user, row)]++
  refresh()
  return out
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

export async function updateLearningProgress(id: string, input: { done?: number; minutes?: number; status?: 'active' | 'paused' | 'done' }) {
  const delta = z.object({
    done: z.number().int().min(-1000).max(1000).optional(),
    minutes: z.number().int().min(1).max(720).optional(),
    status: z.enum(['active', 'paused', 'done']).optional(),
  }).parse(input)
  const user = await getUser()
  const [item] = await db.select().from(schema.learningItems)
    .where(and(eq(schema.learningItems.id, id), eq(schema.learningItems.userId, user.id)))
  if (!item) return
  const progressDone = Math.max(0, item.progressDone + (delta.done ?? 0))
  const meta = (item.meta ?? {}) as { manualMinutes?: number }
  await db.update(schema.learningItems).set({
    progressDone: item.progressTotal ? Math.min(item.progressTotal, progressDone) : progressDone,
    minutesLogged: item.minutesLogged + (delta.minutes ?? 0),
    // Kept apart from tracked time, which the extension recomputes from your activity.
    meta: { ...meta, manualMinutes: (meta.manualMinutes ?? 0) + (delta.minutes ?? 0) },
    status: delta.status ?? (item.progressTotal && progressDone >= item.progressTotal ? 'done' : item.status),
  }).where(eq(schema.learningItems.id, id))
  if (delta.minutes) {
    await persist(user, {
      kind: 'entry', tracker: 'learning.minutes', date: localDate(new Date(), user.timezone), value: delta.minutes,
      source: 'manual', mode: 'add', defaults: { name: 'Learning', category: 'skills', unit: 'min', kind: 'duration' },
    })
  }
  const news = await xpAfterLog(user)
  refresh()
  return news
}

const libraryEdit = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['course', 'book', 'show', 'video', 'other']),
  progressTotal: z.number().int().min(1).max(10_000).nullable(),
  status: z.enum(['planned', 'active', 'paused', 'done']),
})

/** Library card ⋯ → Edit: name, type, total lessons or episodes, status. */
export async function updateLibraryItem(id: string, input: unknown) {
  const user = await getUser()
  const v = libraryEdit.parse(input)
  await db.update(schema.learningItems).set({ ...v, updatedAt: new Date() })
    .where(and(eq(schema.learningItems.id, id), eq(schema.learningItems.userId, user.id)))
  refresh()
}

export async function removeLibraryItem(id: string) {
  const user = await getUser()
  await db.delete(schema.learningItems).where(and(eq(schema.learningItems.id, id), eq(schema.learningItems.userId, user.id)))
  refresh()
}

/** Activity → a site's "counts as". null goes back to the built-in rule. */
export async function setSiteKindAction(domain: string, kind: string | null) {
  const { ACTIVITY_KINDS } = await import('@/domain/activity')
  const k = kind == null ? null : z.enum(ACTIVITY_KINDS).parse(kind)
  const user = await getUser()
  const { setSiteKind } = await import('@/core/activity')
  const changed = await setSiteKind(user, z.string().min(1).max(200).parse(domain), k)
  refresh()
  return { changed }
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
  const news = await xpAfterLog(user)
  refresh()
  return news
}

export async function saveProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser()
  const get = (k: string) => String(form.get(k) ?? '').trim().slice(0, 4000)
  const tz = get('timezone') || user.timezone
  try { new Intl.DateTimeFormat('en', { timeZone: tz }) } catch { return { ok: false, error: `“${tz}” isn’t a time zone. Pick one from the list, like Asia/Kolkata.` } }
  const cur = (get('baseCurrency') || user.baseCurrency).toUpperCase()
  const { isIsoCurrency } = await import('@/domain/money')
  if (!isIsoCurrency(cur)) return { ok: false, error: `“${cur}” isn’t a currency code. Use three letters, like INR or USD.` }
  await db.update(schema.users).set({
    name: get('name') || user.name,
    timezone: tz,
    baseCurrency: cur,
    // Merge into the saved profile: replacing it would drop setup, areas, XP start and notification choices.
    profile: { ...(await freshProfile(user.id)), goals: get('goals'), constraints: get('constraints'), notes: get('notes') },
  }).where(eq(schema.users.id, user.id))
  const { clearUserCache } = await import('@/core/user')
  clearUserCache()
  refresh()
  return { ok: true }
}

async function freshProfile(userId: string) {
  const [u] = await db.select({ profile: schema.users.profile }).from(schema.users).where(eq(schema.users.id, userId))
  return u?.profile ?? {}
}

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const deliverySchema = z.object({
  mode: z.enum(['off', 'once', 'repeat']),
  everyMin: z.number().int().min(5).max(24 * 60),
  times: z.number().int().min(0).max(10),
  quiet: z.boolean(),
  maxPerDay: z.number().int().min(1).max(50).nullable(),
}).partial()

/** Today: ask the System for today's quests now (normally the worker does it just after midnight). */
export async function summonSystem() {
  const { systemTick } = await import('@/core/system')
  await systemTick(await getUser())
  refresh()
}

/** Today: explicitly choose a recovery response; the server owns the exact preview and target. */
export async function chooseQuestRecovery(input: unknown) {
  const parsed = z.object({ insightId: z.string().uuid(), version: z.number().int().positive(), choice: z.enum(['smaller', 'rest', 'priorities']) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'This recovery choice is invalid. Refresh and try again.' }
  try {
    const { chooseRecovery } = await import('@/core/recovery')
    const result = await chooseRecovery(await getUser(), parsed.data)
    refresh()
    if (result.status === 'accepted' || result.status === 'already_chosen') return { ok: true as const, choice: result.view.choice }
    return { ok: false as const, retryOnly: false, error: result.status === 'stale' ? 'This preview changed or expired. Review the current choices before trying again.' : result.status === 'unavailable' ? 'This smaller step is no longer available. Rest or review your priorities instead.' : 'This recovery choice is no longer available. Refresh Today.' }
  } catch {
    return { ok: false as const, retryOnly: true, error: 'Could not confirm your choice. Retry to check and save it safely.' }
  }
}

/** Settings → The System: which stats to train first. */
export async function saveSystemFocus(ids: string[]) {
  const user = await getUser()
  const improve = z.array(z.string().max(80)).max(20).parse(ids)
  await db.update(schema.users).set({ profile: { ...(await freshProfile(user.id)), improve } }).where(eq(schema.users.id, user.id))
  const { clearUserCache } = await import('@/core/user')
  clearUserCache()
  return { ok: true as const }
}

/** Settings → Notifications: quiet hours and per-category delivery. The worker reads it each minute. */
export async function saveNotifications(input: unknown) {
  const { NOTIFY_CATEGORIES } = await import('@/domain/notify')
  const parsed = z.object({
    quiet: z.object({ from: HHMM, to: HHMM }).nullable(),
    categories: z.partialRecord(z.enum(NOTIFY_CATEGORIES), deliverySchema),
  }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'Those settings look wrong. Reload and try again.' }
  const user = await getUser()
  await db.update(schema.users).set({ profile: { ...(await freshProfile(user.id)), notifications: parsed.data } }).where(eq(schema.users.id, user.id))
  const { clearUserCache } = await import('@/core/user')
  clearUserCache()
  return { ok: true as const }
}

/** "Sync now": the same job the worker runs on its schedule, so two syncs of one app never overlap. */
export async function syncNow(connectorId: string): Promise<{ ok: boolean; events: number; error?: string }> {
  const { runNow, parseNow } = await import('@/jobs')
  const r = await runNow(`sync:${connectorId}`)
  if (!r) return { ok: false, events: 0, error: 'Already syncing. It finishes on its own; check back in a minute.' }
  if (r.ok) await parseNow() // show the new data right away
  refresh()
  return r.ok ? { ok: true, events: Number.parseInt(r.result) || 0 } : { ok: false, events: 0, error: r.result }
}

/** Connect dialog submit. Only the fields the integration declares are read. */
export async function connectIntegration(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser()
  // Shopping apps: pressing Connect means the login is done, so end the login window and keep its session.
  const { SHOP_IDS } = await import('@/connectors/shop')
  if (SHOP_IDS.has(id)) await (await import('@/connectors/shop/browser')).closeLoginWindow(id)
  const { connect } = await import('@/core/secrets')
  const r = await connect(user.id, id, Object.fromEntries(form.entries()))
  // Connected: sync it now (the worker picks this up within seconds), then on its schedule.
  if (r?.ok) await (await import('@/jobs')).emit(`connector.connected:${id}`)
  refresh()
  return r
}

/** Opens a Chrome window on a shopping app's login page. The session is saved for background syncs. */
export async function openAppLogin(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { PLATFORMS } = await import('@/connectors/shop')
  const p = PLATFORMS.find((x) => x.id === id)
  if (!p) return { ok: false, error: 'Unknown app' }
  try {
    const { openLoginWindow } = await import('@/connectors/shop/browser')
    await openLoginWindow(p.id, p.login)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: /executable|chrome/i.test(msg) ? 'Google Chrome wasn’t found. Install it, or set CHROME_PATH in .env.' : msg.slice(0, 200) }
  }
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

const onboardingInput = z.object({
  name: z.string().trim().min(1, 'Add your name').max(60),
  timezone: z.string().trim().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }, 'Pick a time zone from the list'),
  baseCurrency: z.string().trim().toUpperCase().refine((c) => Intl.supportedValuesOf('currency').includes(c), 'Use a currency code like INR or USD'),
  areas: z.array(z.enum(CATEGORIES)).min(1, 'Pick at least one area'),
  focus: z.enum(CATEGORIES).optional(),
  // Setup asks for the fields above and `improve`. The rest is optional: left out, it keeps its saved value.
  templates: z.array(z.string().max(40)).max(40).optional(),
  generated: z.array(z.object({
    id: z.string().max(40), area: z.enum(CATEGORIES), name: z.string().trim().min(1).max(60), kind: z.enum(['routine', 'medicine']),
    rule: z.object({
      freq: z.enum(['daily', 'weekly']),
      times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(6),
      byweekday: z.array(z.enum(WEEKDAYS)).max(7).optional(),
    }),
    note: z.string().max(60).optional(), dose: z.string().max(40).optional(),
  })).max(10).optional(),
  sleepHours: z.number().min(5).max(10).optional(),
  steps: z.number().int().min(1000).max(30000).optional(),
  waterMl: z.number().int().min(500).max(6000).optional(),
  goals: z.string().max(2000).optional(),
  constraints: z.string().max(2000).optional(),
  wake: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a wake-up time').optional(),
  sleep: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a bedtime').optional(),
  improve: z.array(z.string().max(80)).max(3).default([]),
  tone: z.enum(['gentle', 'balanced', 'blunt']).optional(),
})

/** Finish the one-time setup on /welcome. */
export async function finishOnboarding(input: unknown): Promise<
  { ok: true; added: number; level: { level: number; title: string; progress: number } } | { ok: false; error: string }
> {
  const parsed = onboardingInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your answers' }
  const user = await getUser()
  const { completeOnboarding } = await import('@/core/onboarding')
  const r = await completeOnboarding(user, parsed.data)
  const { clearUserCache } = await import('@/core/user')
  clearUserCache()
  const [{ totalXp }, { levelFor, titleFor }] = await Promise.all([import('@/core/xp'), import('@/domain/xp')])
  const lv = levelFor(await totalXp(user))
  refresh()
  return { ok: true, added: r.added, level: { level: lv.level, title: titleFor(lv.level), progress: lv.progress } }
}

/** Setup's routines step: routines the AI proposes from the user's own description. */
export async function suggestOnboardingRoutines(input: { prompt: string; areas: string[]; focus?: string; goals?: string }): Promise<
  { ok: true; routines: import('@/ai/routines').SuggestedRoutine[] } | { ok: false; error: string; noModel?: boolean }
> {
  const parsed = z.object({
    prompt: z.string().trim().min(8, 'Say a little more about your day').max(1500),
    areas: z.array(z.enum(CATEGORIES)).min(1),
    focus: z.enum(CATEGORIES).optional(),
    goals: z.string().max(2000).optional(),
  }).safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your answers' }
  const { aiEnabled } = await import('@/ai')
  if (!aiEnabled('plan')) return { ok: false, error: 'Connect an AI model first.', noModel: true }
  const user = await getUser()
  const existing = (await db.select({ name: schema.schedules.name }).from(schema.schedules).where(eq(schema.schedules.userId, user.id))).map((r) => r.name)
  try {
    const { suggestRoutines } = await import('@/ai/routines')
    const routines = await suggestRoutines({ ...parsed.data, existing })
    return routines.length ? { ok: true, routines } : { ok: false, error: 'The model came back empty. Add a bit more detail and try again.' }
  } catch (err) {
    return { ok: false, error: `The AI model didn’t answer: ${String(err instanceof Error ? err.message : err).slice(0, 140)}` }
  }
}

/** Whether a model is connected, for the routines step (it can connect one inline). */
export async function aiReady() {
  await getUser() // loads saved keys
  const { aiEnabled, modelId } = await import('@/ai')
  return { ready: aiEnabled('plan'), model: modelId('plan') ?? null }
}

/** Today → Finish setting up → Hide: the checklist stays away for good. */
export async function hideSetupChecklist() {
  const user = await getUser()
  await db.update(schema.users).set({ profile: { ...(await freshProfile(user.id)), setupHiddenAt: new Date().toISOString() } }).where(eq(schema.users.id, user.id))
  const { clearUserCache } = await import('@/core/user')
  clearUserCache()
  refresh()
}

export async function skipOnboardingAction() {
  const user = await getUser()
  const { skipOnboarding } = await import('@/core/onboarding')
  await skipOnboarding(user)
  const { clearUserCache } = await import('@/core/user')
  clearUserCache()
  refresh()
}

/** Open one chest: pays its XP and keeps (or converts) its streak freeze. Safe to call twice. */
export async function openChestAction(id: string): Promise<
  | { ok: true; rarity: 'common' | 'rare' | 'epic'; xp: number; freeze: boolean; converted: boolean; reason: string; levelUp?: { level: number; title: string; from: number; newTitle: boolean } }
  | { ok: false; error: string }
> {
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { ok: false, error: 'Chest not found' }
  const user = await getUser()
  const [{ openChest }, { titleFor }] = await Promise.all([import('@/core/quests'), import('@/domain/xp')])
  const r = await openChest(user, parsed.data)
  if (!r) return { ok: false, error: 'That chest is already open' }
  refresh()
  const { after, before } = r.level
  return { ok: true, ...r.opened, levelUp: after > before ? { level: after, title: titleFor(after), from: before, newTitle: titleFor(after) !== titleFor(before) } : undefined }
}

/** Bank credits and debits recorded since the dashboard last showed them. */
export async function newPayments() {
  const { newPaymentsFor } = await import('@/core/payment-alerts')
  return newPaymentsFor(await getUser())
}

/** The dashboard showed everything recorded up to `upTo`. */
export async function paymentsSeen(upTo: string) {
  const { markPaymentsSeen } = await import('@/core/payment-alerts')
  await markPaymentsSeen(await getUser(), z.string().datetime().parse(upTo))
}

/**
 * The latest change anywhere in the data the dashboard shows: syncs (raw events), money, trackers, checks, quests,
 * XP and insights. Open pages compare it to refresh themselves when something new lands.
 */
export async function dataVersion() {
  const user = await getUser()
  const [r] = await db.execute<{ v: string | null }>(sql`select greatest(
    (select max(updated_at) from raw_events where user_id = ${user.id}),
    (select max(updated_at) from transactions where user_id = ${user.id}),
    (select max(updated_at) from entries where user_id = ${user.id}),
    (select max(updated_at) from trades where user_id = ${user.id}),
    (select max(updated_at) from crypto_flows where user_id = ${user.id}),
    (select max(updated_at) from accounts where user_id = ${user.id}),
    (select max(at) from holdings where user_id = ${user.id}),
    (select max(c.at) from checks c join schedules s on s.id = c.schedule_id where s.user_id = ${user.id}),
    (select max(updated_at) from schedules where user_id = ${user.id}),
    (select max(updated_at) from insights where user_id = ${user.id}),
    (select max(created_at) from system_quests where user_id = ${user.id}),
    (select max(created_at) from xp_events where user_id = ${user.id})
  )::text as v`)
  return r?.v ?? null
}

// ── Outcome goals (src/core/goals.ts) ────────────────────────────────────────────────────────────

export type GoalFormState = { ok: boolean; error?: string; errors?: Partial<Record<string, string>>; id?: string } | null

const goalError = (status: string) =>
  status === 'stale' ? 'This goal changed in another window. Reload to see the latest version.'
    : status === 'already_decided' ? 'This review already has a decision.'
      : status === 'not_found' ? 'This goal is no longer available.' : 'Could not save. Try again.'

/** Goals: create or edit an outcome goal. A recorded baseline is recomputed on the server. */
export async function saveGoal(_prev: GoalFormState, form: FormData): Promise<GoalFormState> {
  const { parseGoalForm } = await import('@/core/goal-form')
  const parsed = parseGoalForm(form)
  if (!parsed) return { ok: false, error: 'Some fields are invalid. Check the form and try again.' }
  const { fields: f, actions } = parsed
  const user = await getUser()
  const { saveGoal: save } = await import('@/core/goals')
  const today = localDate(new Date(), user.timezone)
  try {
    const result = await save(user, {
      id: f.id, version: f.version, draftInsightId: f.draftInsightId,
      title: f.title, reason: f.reason, area: f.area, measureKind: f.measureKind, trackerId: f.measureKind === 'tracker' ? f.trackerId ?? null : null,
      measureName: f.measureName, unit: f.unit || null, direction: f.direction,
      target: f.direction === 'range' ? null : f.target, rangeLow: f.direction === 'range' ? f.rangeLow : null, rangeHigh: f.direction === 'range' ? f.rangeHigh : null,
      useRecorded: f.measureKind === 'tracker' && f.baselineMode === 'recorded',
      baselineValue: f.baselineValue, baselineDate: f.baselineDate || today, baselineHow: f.baselineHow,
      targetDate: f.targetDate, cadence: f.cadence, actions,
    })
    if (result.status === 'saved') { refresh(); return { ok: true, id: result.id } }
    if (result.status === 'invalid') return { ok: false, errors: result.errors, error: result.errors.form }
    return { ok: false, error: goalError(result.status) }
  } catch {
    return { ok: false, error: 'Could not save. Try again.' }
  }
}

/** Goals: pause, resume or finish outside a review. */
export async function setGoalStatusAction(input: unknown) {
  const parsed = z.object({ goalId: z.string().uuid(), version: z.number().int().positive(), status: z.enum(['active', 'paused', 'finished']) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'This change is invalid. Reload and try again.' }
  const { setGoalStatus } = await import('@/core/goals')
  const result = await setGoalStatus(await getUser(), parsed.data)
  refresh()
  if (result.status === 'saved') return { ok: true as const }
  return { ok: false as const, error: result.status === 'invalid' ? result.errors.form ?? 'Could not save.' : goalError(result.status) }
}

const goalChange = z.object({
  title: z.string().trim().min(1).max(120), reason: z.string().trim().min(1).max(500),
  target: z.number().finite().nullable(), rangeLow: z.number().finite().nullable(), rangeHigh: z.number().finite().nullable(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cadence: z.enum(['weekly', 'fortnightly', 'monthly']),
  actions: z.array(z.object({ kind: z.enum(['schedule', 'tracker']), id: z.string().uuid() })).max(3),
}).partial()

/** Goals: record a Keep / Change / Pause / Finish decision on a review. */
export async function decideGoalReviewAction(input: unknown) {
  const parsed = z.object({
    reviewId: z.string().uuid(), goalVersion: z.number().int().positive(),
    decision: z.enum(['keep', 'change', 'pause', 'finish']), change: goalChange.optional(), note: z.string().max(280).optional(),
  }).safeParse(input)
  if (!parsed.success) return { ok: false as const, retry: false, error: 'This decision is invalid. Reload and try again.' }
  try {
    const { decideReview } = await import('@/core/goals')
    const result = await decideReview(await getUser(), parsed.data)
    refresh()
    if (result.status === 'saved') return { ok: true as const }
    if (result.status === 'invalid') return { ok: false as const, retry: false, error: Object.values(result.errors)[0] ?? 'Check the change and try again.', errors: result.errors }
    return { ok: false as const, retry: false, error: goalError(result.status) }
  } catch {
    return { ok: false as const, retry: true, error: 'Could not save your decision. Retry to save it safely.' }
  }
}

/** Goals: record a manual check-in value. */
export async function recordGoalCheckInAction(input: unknown) {
  const parsed = z.object({
    goalId: z.string().uuid(), localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), value: z.number().finite(), note: z.string().max(280).optional(),
  }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'Enter a number and a date.' }
  const { recordCheckIn } = await import('@/core/goals')
  let result
  try {
    result = await recordCheckIn(await getUser(), parsed.data)
  } catch {
    return { ok: false as const, error: 'Could not save the check-in. Try again.' }
  }
  refresh()
  if (result.status === 'saved') return { ok: true as const }
  return { ok: false as const, error: result.status === 'invalid' ? result.errors.form ?? 'Could not save.' : goalError(result.status) }
}

/** Goals: start a review for one goal now, instead of waiting for Sunday. */
export async function reviewGoalNowAction(goalId: string) {
  if (!z.string().uuid().safeParse(goalId).success) return { ok: false as const }
  const { prepareGoalReviews } = await import('@/core/goals')
  const rows = await prepareGoalReviews(await getUser(), new Date(), goalId)
  refresh()
  return { ok: rows.length > 0 }
}

/** Goals: ask the AI for one draft from the goals text in Settings. It stays pending until saved in the form. */
export async function draftGoalAction() {
  const { draftGoal } = await import('@/ai/jobs/goal-draft')
  const result = await draftGoal(await getUser())
  refresh()
  const message = {
    created: 'Draft ready. Review it before it becomes a goal.',
    unavailable: 'Connect an AI model in Settings to get drafts.',
    no_goals_text: 'Add your goals in Settings → Profile first.',
    limit: 'You have 3 drafts waiting. Review or dismiss one first.',
    unsafe: 'No safe draft from your goals text. Create one in the form.',
    failed: 'The draft did not finish. Try again.',
  }[result.status]
  return { ok: result.status === 'created', status: result.status, message }
}

export async function dismissGoalDraftAction(insightId: string) {
  if (!z.string().uuid().safeParse(insightId).success) return { ok: false as const }
  const user = await getUser()
  await db.update(schema.insights).set({ status: 'dismissed' })
    .where(and(eq(schema.insights.id, insightId), eq(schema.insights.userId, user.id), eq(schema.insights.status, 'pending'), sql`${schema.insights.payload} ? 'goalDraft'`))
  refresh()
  return { ok: true as const }
}
