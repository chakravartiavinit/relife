import { randomUUID } from 'node:crypto'
import { Pack, PACK_FORMAT, PACK_VERSION, type PackGoal, type PackRoutine, type PackTracker } from '@relife/contract'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { CATEGORIES, type Category } from '@/db/schema'
import { BASELINE_DAYS, MAX_ACTIVE, MAX_PENDING_DRAFTS, checkGoalDraft, trackerBaseline, type GoalInput } from '@/domain/goals'
import { addedLine, goalReason, packGoalToRaw, planPack, type PackChoices, type PackPlan, type PackState, type PackStateJson, type SkipItem, stateToJson } from '@/domain/packs'
import { buildRRule, parseSimple } from '@/domain/recurrence'
import { BUILT_IN_PACKS } from '@/packs'
import { saveGoal } from './goals'
import { slugify } from './quicklog'
import { trackerDays } from './metrics'
import { lockUser, type Tx } from './recovery'
import { addDays, localDate } from './time'
import { profileMerge, type User } from './user'

/** The four starter packs (Fitness, Money, Student / Dev, Recovery), in the order setup shows them. */
export const builtInPacks = (): Pack[] => BUILT_IN_PACKS

export const packById = (id: string | null | undefined) => BUILT_IN_PACKS.find((p) => p.id === id)

/**
 * The pack's goal as a pending coach draft (kind `plan`, key `goal-draft:pack:<id>`), made inside setup's transaction.
 * It is a draft, not a goal: a goal needs a baseline the user doesn't have yet, so they type today's number when they
 * approve it on Plan › Goals or from Coach › Needs you. Nothing starts without a tap. Skipped when the draft already
 * exists, three drafts are waiting, three goals are active, or `checkGoalDraft` refuses it (it enforces the
 * sensitivity rules). Returns whether a draft was added.
 */
export async function insertPackGoalDraft(
  tx: Tx, user: User, packId: string, created: Map<string, string>, existing: Map<string, string>, today: string,
): Promise<boolean> {
  const pack = packById(packId)
  const goal = pack?.goals[0]
  if (!pack || !goal) return false
  const routineId = (key: string) => created.get(key) ?? existing.get(pack.routines.find((r) => r.key === key)?.name.toLowerCase() ?? '')
  const routines = pack.routines.flatMap((r) => { const id = routineId(r.key); return id ? [{ id, name: r.name, category: r.area }] : [] })
  const checked = checkGoalDraft(packGoalToRaw(goal, today, routineId), { today, trackers: [], routines })
  if (!checked.ok) return false
  const I = schema.insights
  const dedupeKey = `goal-draft:pack:${pack.id}`
  const [[dup], [{ pending }], [{ active }]] = await Promise.all([
    tx.select({ id: I.id }).from(I).where(and(eq(I.userId, user.id), sql`${I.payload}->>'dedupeKey' = ${dedupeKey}`)).limit(1).then((r) => [r[0]] as const),
    tx.select({ pending: sql<number>`count(*)::int` }).from(I).where(and(eq(I.userId, user.id), eq(I.status, 'pending'), sql`${I.payload} ? 'goalDraft'`)),
    tx.select({ active: sql<number>`count(*)::int` }).from(schema.goals).where(and(eq(schema.goals.userId, user.id), eq(schema.goals.status, 'active'))),
  ])
  if (dup || pending >= MAX_PENDING_DRAFTS || active >= MAX_ACTIVE) return false
  const draft = { ...checked.draft, origin: { pack: pack.id, name: pack.name } }
  await tx.insert(I).values({
    userId: user.id, kind: 'plan', status: 'pending', title: `Goal draft: ${draft.title}`.slice(0, 140), body: draft.reason,
    payload: { goalDraft: draft, dedupeKey },
  })
  return true
}

type Exec = Tx | typeof db

/** One routine of a pack as a schedule row, the way setup (`completeOnboarding`) and the gallery both write them. */
export type RoutineInsertOptions = {
  /** Lowercased names that already exist; this adds the names it inserts, so a repeat inside one call is skipped too. */
  existing: Set<string>
  /** The target a quantity routine (water) starts with: setup's goals step (null when not given). Left out, the pack's own is used. */
  waterTarget?: number | null
  /** Merged into each row's `meta`, e.g. `{ pack: { id, version, importId } }`. */
  meta?: Record<string, unknown>
}

/** The routine loop that used to live in `completeOnboarding`: skips a name that exists (case-insensitive), returns the ids by key. */
export async function insertRoutines(tx: Tx, user: User, routines: PackRoutine[], today: string, o: RoutineInsertOptions) {
  const ids = new Map<string, string>()
  for (const t of routines) {
    if (o.existing.has(t.name.toLowerCase())) continue
    o.existing.add(t.name.toLowerCase())
    const trackerSlug = t.quantity ? slugify(t.name) : undefined
    const [row] = await tx.insert(schema.schedules).values({
      userId: user.id, name: t.name, kind: t.kind, category: t.area,
      rrule: buildRRule({ ...t.rule, start: today }),
      target: t.quantity ? o.waterTarget !== undefined ? o.waterTarget : t.quantity.target ?? null : null, unit: t.quantity?.unit ?? null,
      meta: {
        ...Object.fromEntries(Object.entries({ notes: t.note, dose: t.dose, doseCount: t.dose ? 1 : undefined, trackerSlug, step: t.quantity?.step }).filter(([, v]) => v !== undefined)),
        ...o.meta,
      },
    }).returning({ id: schema.schedules.id })
    ids.set(t.key, row.id)
  }
  return ids
}

/** What the user already has, for `planPack`. */
export async function packState(user: User, x: Exec = db): Promise<PackState> {
  const [schedules, trackers, goals, [u]] = await Promise.all([
    x.select({ id: schema.schedules.id, name: schema.schedules.name, kind: schema.schedules.kind, active: schema.schedules.active }).from(schema.schedules).where(eq(schema.schedules.userId, user.id)),
    x.select().from(schema.trackers).where(eq(schema.trackers.userId, user.id)),
    x.select({ title: schema.goals.title, status: schema.goals.status }).from(schema.goals).where(and(eq(schema.goals.userId, user.id), inArray(schema.goals.status, ['active', 'paused']))),
    x.select({ profile: schema.users.profile }).from(schema.users).where(eq(schema.users.id, user.id)),
  ])
  return {
    routineNames: new Set(schedules.map((r) => r.name.toLowerCase())),
    routineIds: new Map(schedules.filter((r) => r.active && r.kind === 'routine').map((r) => [r.name.toLowerCase(), r.id])),
    trackers: new Map(trackers.map((t) => [t.slug, { id: t.id, name: t.name, unit: t.unit, category: t.category, target: t.target }])),
    goalTitles: new Set(goals.map((g) => g.title.toLowerCase())),
    activeGoals: goals.filter((g) => g.status === 'active').length,
    areas: (u?.profile.areas ?? user.profile.areas ?? []) as Category[],
  }
}

export type PackPreview = {
  pack: { id: string; name: string; description: string; author?: string; homepage?: string }
  plan: PackPlan
  /** Per goal key: the recorded 28-day value when there are enough days, else null (the goal then needs a baseline typed in). */
  baselines: Record<string, { value: number | null; observations: number }>
  /** The state the plan was made from, so the browser can re-plan when the areas switch changes. */
  state: PackStateJson
  /** The user's local date the plan was made for. */
  today: string
}

/** What adding the pack would do. Writes nothing. */
export async function previewPack(user: User, pack: Pack, now = new Date()): Promise<PackPreview> {
  const today = localDate(now, user.timezone)
  const state = await packState(user)
  const plan = planPack(pack, state, today)
  const baselines: PackPreview['baselines'] = {}
  for (const g of pack.goals) {
    const slug = 'tracker' in g.measure ? g.measure.tracker : null
    const have = slug ? state.trackers.get(slug) : null
    if (!slug || !have) { baselines[g.key] = { value: null, observations: 0 }; continue }
    const [d] = await trackerDays(user, addDays(today, -BASELINE_DAYS), addDays(today, -1), { slugs: [slug] })
    const b = trackerBaseline(d?.days ?? new Map(), today)
    baselines[g.key] = { value: b.value == null ? null : Math.round(b.value * 100) / 100, observations: b.observations }
  }
  return {
    pack: { id: pack.id, name: pack.name, description: pack.description, author: pack.author, homepage: pack.homepage },
    plan, baselines,
    state: stateToJson(state), today,
  }
}

export type ApplyChoices = {
  routineKeys: string[]
  trackerSlugs: string[]
  /** The goals to add; `baselineValue` is the number the user typed, for a goal with no recorded baseline. */
  goals: { key: string; baselineValue?: number }[]
  addAreas: boolean
}
export type PackMark = { id: string; version: number; importId: string }
export type ApplyResult = {
  importId: string
  created: { scheduleIds: string[]; trackerIds: string[]; goalIds: string[] }
  skipped: SkipItem[]
  /** Goals the plan allowed but could not be saved (no baseline, a rule the goal form enforces). */
  failed: { key: string; name: string; message: string }[]
  line: string
}

/**
 * Add a pack: one transaction under the user lock. It plans again from what is stored now, so a double tap (or a second
 * tab) adds nothing the second time. Each row made carries `meta.pack` = { id, version, importId }, which is what Undo
 * finds. A tracker gets its target only when it is new or has none. Goals go through `saveGoal` (validation, recorded
 * baselines) inside the same transaction.
 */
export async function applyPack(user: User, pack: Pack, choices: ApplyChoices, now = new Date()): Promise<ApplyResult> {
  const today = localDate(now, user.timezone)
  const mark: PackMark = { id: pack.id, version: pack.version, importId: randomUUID() }
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    const state = await packState(user, tx)
    const plan = planPack(pack, state, today, {
      routineKeys: choices.routineKeys, trackerSlugs: choices.trackerSlugs, goalKeys: choices.goals.map((g) => g.key), addAreas: choices.addAreas,
    })
    if (choices.addAreas && plan.areasToAdd.length) {
      const areas = CATEGORIES.filter((c) => state.areas.includes(c) || plan.areasToAdd.includes(c))
      await tx.update(schema.users).set({ profile: profileMerge({ areas }) }).where(eq(schema.users.id, user.id))
    }

    const scheduleIds = await insertRoutines(tx, user, plan.routines, today, { existing: new Set(state.routineNames), meta: { pack: mark } })
    const trackerIds = new Map<string, string>()
    for (const t of plan.trackers) {
      const [row] = await tx.insert(schema.trackers).values({
        userId: user.id, slug: t.slug, name: t.name, category: t.area, kind: t.kind, unit: t.unit, target: t.target,
        direction: t.direction ?? 'up', aggregate: t.aggregate ?? 'sum', meta: { pack: mark },
      }).onConflictDoNothing().returning({ id: schema.trackers.id })
      if (row) trackerIds.set(t.slug, row.id)
    }
    // A target on a tracker that has none (Undo clears it again, by `meta.packTarget`).
    for (const t of plan.targets) {
      await tx.update(schema.trackers).set({ target: t.target, meta: sql`${schema.trackers.meta} || ${JSON.stringify({ packTarget: { ...mark, value: t.target } })}::jsonb` })
        .where(and(eq(schema.trackers.userId, user.id), eq(schema.trackers.slug, t.slug), isNull(schema.trackers.target)))
    }

    const goalIds: string[] = [], failed: ApplyResult['failed'] = []
    const trackerOf = (slug: string) => trackerIds.get(slug) ?? state.trackers.get(slug)?.id
    for (const g of plan.goals) {
      const typed = choices.goals.find((c) => c.key === g.key)?.baselineValue
      const input = goalInput(pack, g, today, {
        trackerId: 'tracker' in g.measure ? trackerOf(g.measure.tracker) : undefined,
        trackerName: 'tracker' in g.measure ? (plan.trackers.find((t) => t.slug === (g.measure as { tracker: string }).tracker)?.name ?? state.trackers.get((g.measure as { tracker: string }).tracker)?.name) : undefined,
        routineId: (key) => scheduleIds.get(key) ?? state.routineIds.get(pack.routines.find((r) => r.key === key)?.name.toLowerCase() ?? ''),
        trackerId2: trackerOf,
        typed: typeof typed === 'number' && Number.isFinite(typed) ? typed : undefined,
        recordable: 'tracker' in g.measure && state.trackers.has(g.measure.tracker),
      })
      if (!input.ok) { failed.push({ key: g.key, name: g.title, message: input.message }); continue }
      const saved = await saveGoal(user, input.input, now, tx)
      if (saved.status !== 'saved') {
        failed.push({ key: g.key, name: g.title, message: saved.status === 'invalid' ? Object.values(saved.errors)[0] ?? 'Could not add this goal.' : 'Could not add this goal.' })
        continue
      }
      await tx.update(schema.goals).set({ meta: { pack: mark } }).where(eq(schema.goals.id, saved.id))
      goalIds.push(saved.id)
    }

    const created = { scheduleIds: [...scheduleIds.values()], trackerIds: [...trackerIds.values()], goalIds }
    return {
      importId: mark.importId, created, skipped: plan.skip, failed,
      line: addedLine({ routines: created.scheduleIds.length, trackers: created.trackerIds.length, goals: goalIds.length }),
    }
  })
}

/** A pack goal as the form's input: links resolved, the baseline typed or to be read from the recorded days. */
function goalInput(pack: Pack, g: PackGoal, today: string, o: {
  trackerId?: string; trackerName?: string; routineId: (key: string) => string | undefined; trackerId2: (slug: string) => string | undefined
  typed?: number; recordable: boolean
}): { ok: true; input: GoalInput & { useRecorded: boolean } } | { ok: false; message: string } {
  const tracker = 'tracker' in g.measure
  if (tracker && !o.trackerId) return { ok: false, message: 'The tracker for this goal is missing.' }
  if (o.typed === undefined && !o.recordable) return { ok: false, message: 'Add the number you are at today to start this goal.' }
  const actions = [...new Set((g.actions ?? []).flatMap((k) => {
    const r = o.routineId(k), t = r ? undefined : o.trackerId2(k)
    return r ? [`schedule:${r}`] : t && t !== o.trackerId ? [`tracker:${t}`] : []
  }))].map((a) => ({ kind: a.split(':')[0] as 'schedule' | 'tracker', id: a.split(':')[1] }))
  const raw = packGoalToRaw({ ...g, reason: goalReason(pack, g) }, today, () => undefined)
  return {
    ok: true,
    input: {
      title: g.title, reason: goalReason(pack, g), area: g.area,
      measureKind: tracker ? 'tracker' : 'check_in', trackerId: tracker ? o.trackerId! : null,
      measureName: tracker ? o.trackerName ?? '' : (g.measure as { checkIn: string }).checkIn, unit: tracker ? null : (g.measure as { unit?: string }).unit ?? null,
      direction: raw.direction, target: g.direction === 'range' ? null : g.target ?? null, rangeLow: g.direction === 'range' ? g.rangeLow ?? null : null, rangeHigh: g.direction === 'range' ? g.rangeHigh ?? null : null,
      baselineValue: o.typed ?? null, baselineDate: today, baselineHow: o.typed !== undefined ? `Entered by you when adding the ${pack.name} pack` : '',
      targetDate: raw.targetDate, cadence: g.cadence, actions,
      useRecorded: o.typed === undefined && o.recordable,
    },
  }
}

/**
 * Undo one import: the routines, trackers and goals with that `importId`, and nothing else. Anything the person has used
 * since stays, and stops being marked as the pack's (it is an ordinary row now): a goal with check-ins or a decided
 * review, a routine with check-offs or one a remaining goal links, a tracker with entries or one a goal measures.
 * (Deleting a routine would cascade to its check-offs and reminders.) A target the pack set on an existing tracker is
 * cleared only while it still has the value the pack gave it.
 */
export async function undoPackImport(user: User, importId: string) {
  const mine = (col: typeof schema.goals.meta | typeof schema.schedules.meta | typeof schema.trackers.meta, key = 'pack') => sql`${col}->${key}->>'importId' = ${importId}`
  const unmark = (col: typeof schema.goals.meta | typeof schema.schedules.meta | typeof schema.trackers.meta) => sql`${col} - 'pack'`
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    const G = schema.goals, S = schema.schedules, T = schema.trackers
    const goals = await tx.delete(G).where(and(
      eq(G.userId, user.id), mine(G.meta),
      sql`not exists (select 1 from ${schema.goalCheckIns} c where c.goal_id = ${G.id})`,
      sql`not exists (select 1 from ${schema.goalReviews} r where r.goal_id = ${G.id} and r.decision is not null)`,
    )).returning({ id: G.id })
    const keptGoals = await tx.update(G).set({ meta: unmark(G.meta) }).where(and(eq(G.userId, user.id), mine(G.meta))).returning({ id: G.id })

    // Goals that are left (this pack's kept ones, or anyone's) may link a routine: those routines stay.
    const routines = await tx.delete(S).where(and(
      eq(S.userId, user.id), mine(S.meta),
      sql`not exists (select 1 from ${schema.checks} c where c.schedule_id = ${S.id})`,
      sql`not exists (select 1 from ${G} g where g.user_id = ${user.id} and g.actions @> jsonb_build_array(jsonb_build_object('kind', 'schedule', 'id', ${S.id}::text)))`,
    )).returning({ id: S.id })
    const keptRoutines = await tx.update(S).set({ meta: unmark(S.meta) }).where(and(eq(S.userId, user.id), mine(S.meta))).returning({ id: S.id })

    const trackers = await tx.delete(T).where(and(
      eq(T.userId, user.id), mine(T.meta),
      sql`not exists (select 1 from ${schema.entries} e where e.tracker_id = ${T.id})`,
      sql`not exists (select 1 from ${G} g where g.tracker_id = ${T.id})`,
    )).returning({ id: T.id })
    const keptTrackers = await tx.update(T).set({ meta: unmark(T.meta) }).where(and(eq(T.userId, user.id), mine(T.meta))).returning({ id: T.id })
    await tx.update(T).set({
      target: sql`case when ${T.target} = (${T.meta}->'packTarget'->>'value')::numeric then null else ${T.target} end`,
      meta: sql`${T.meta} - 'packTarget'`,
    }).where(and(eq(T.userId, user.id), mine(T.meta, 'packTarget')))
    return {
      routines: routines.length, trackers: trackers.length, goals: goals.length,
      /** Rows left in place because they have been used. */
      kept: keptGoals.length + keptRoutines.length + keptTrackers.length,
    }
  })
}

// ─── Share my setup ───────────────────────────────────────────────────────────────────────────────────────────────

export type ExportPick = { scheduleIds: string[]; trackerIds: string[]; goalIds: string[]; includeNotes: boolean }
export type ExportMeta = { name: string; description: string; author?: string }

/** Choices for the export picker: what the user has that a pack can carry. Medicines, bills and subscriptions never are. */
export async function exportChoices(user: User) {
  const [routines, trackers, goals] = await Promise.all([
    db.select({ id: schema.schedules.id, name: schema.schedules.name, area: schema.schedules.category }).from(schema.schedules)
      .where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.kind, 'routine'), eq(schema.schedules.active, true))).orderBy(schema.schedules.name),
    db.select({ id: schema.trackers.id, name: schema.trackers.name, area: schema.trackers.category }).from(schema.trackers)
      .where(and(eq(schema.trackers.userId, user.id), isNull(schema.trackers.archivedAt), sql`${schema.trackers.kind} <> 'money'`)).orderBy(schema.trackers.name),
    db.select({ id: schema.goals.id, name: schema.goals.title, area: schema.goals.area }).from(schema.goals)
      .where(and(eq(schema.goals.userId, user.id), inArray(schema.goals.status, ['active', 'paused']))).orderBy(schema.goals.createdAt),
  ])
  return { routines, trackers, goals }
}

/**
 * A pack from the user's own routines, trackers and goals. It carries no ids, entries, values, baselines or dates (a
 * goal keeps its target and how many weeks it runs), and no notes or goal reasons unless `includeNotes`. Medicines and
 * money are never exported. The result is checked with the contract schema, so it re-imports as it is.
 */
export async function exportPack(user: User, pick: ExportPick, meta: ExportMeta): Promise<{ ok: true; pack: Pack; filename: string } | { ok: false; error: string }> {
  const [schedules, trackers, goals] = await Promise.all([
    pick.scheduleIds.length ? db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.kind, 'routine'), inArray(schema.schedules.id, pick.scheduleIds))) : [],
    pick.trackerIds.length ? db.select().from(schema.trackers).where(and(eq(schema.trackers.userId, user.id), inArray(schema.trackers.id, pick.trackerIds))) : [],
    pick.goalIds.length ? db.select().from(schema.goals).where(and(eq(schema.goals.userId, user.id), inArray(schema.goals.id, pick.goalIds))) : [],
  ])
  const unique = (base: string, taken: Set<string>) => {
    const root = (slugify(base).replace(/\./g, '-').slice(0, 36) || 'item'); let k = root, n = 2
    while (taken.has(k)) k = `${root.slice(0, 36)}-${n++}`
    taken.add(k); return k
  }
  const routineKeys = new Set<string>(), routineKey = new Map<string, string>()
  const routines: PackRoutine[] = []
  for (const s of schedules) {
    let rule: PackRoutine['rule']
    try {
      const { start: _s, until: _u, count: _c, bymonth: _m, freq, ...r } = parseSimple(s.rrule)
      if (freq === 'yearly') continue // a pack carries daily, weekly and monthly rules
      rule = { ...r, freq }
    } catch { continue }
    const m = s.meta as { notes?: string; step?: number; trackerSlug?: string }
    const key = unique(s.name, routineKeys); routineKey.set(s.id, key)
    routines.push({
      key, name: s.name.slice(0, 60), area: s.category, kind: 'routine', rule,
      ...(pick.includeNotes && m.notes ? { note: m.notes.slice(0, 120) } : {}),
      ...(m.trackerSlug && m.step && s.unit ? { quantity: { unit: s.unit.slice(0, 12), step: m.step } } : {}),
    })
  }
  const trackerSlugs = new Map<string, string>() // tracker id → slug
  const packTrackers: PackTracker[] = []
  const addTracker = (t: typeof schema.trackers.$inferSelect) => {
    if (t.kind === 'money' || trackerSlugs.has(t.id) || packTrackers.length >= 20) return
    trackerSlugs.set(t.id, t.slug)
    packTrackers.push({
      slug: t.slug.slice(0, 40), name: t.name.slice(0, 60), area: t.category, kind: t.kind,
      ...(t.unit ? { unit: t.unit.slice(0, 12) } : {}), ...(t.target != null ? { target: t.target } : {}), direction: t.direction, aggregate: t.aggregate,
    })
  }
  for (const t of trackers) addTracker(t)
  const packGoals: PackGoal[] = []
  const goalKeys = new Set<string>()
  const DIR = { increase: 'up', decrease: 'down', range: 'range' } as const
  for (const g of goals.slice(0, 3)) {
    let measure: PackGoal['measure']
    if (g.measureKind === 'tracker') {
      const t = g.trackerId ? (await db.select().from(schema.trackers).where(and(eq(schema.trackers.id, g.trackerId), eq(schema.trackers.userId, user.id))))[0] : undefined
      if (!t || t.kind === 'money') continue // a goal on money never leaves
      addTracker(t); measure = { tracker: t.slug.slice(0, 40) }
    } else measure = { checkIn: g.measureName.slice(0, 80), ...(g.unit ? { unit: g.unit.slice(0, 20) } : {}) }
    const weeks = Math.min(26, Math.max(4, Math.round((Date.parse(`${g.targetDate}T00:00:00Z`) - Date.parse(`${g.baselineDate}T00:00:00Z`)) / (7 * 86_400_000))))
    const actions = g.actions.flatMap((a) => { const k = a.kind === 'schedule' ? routineKey.get(a.id) : trackerSlugs.get(a.id); return k ? [k] : [] }).slice(0, 3)
    packGoals.push({
      key: unique(g.title, goalKeys), title: g.title.slice(0, 80), ...(pick.includeNotes && g.reason ? { reason: g.reason.slice(0, 200) } : {}), area: g.area,
      measure, direction: DIR[g.direction], ...(g.target != null ? { target: g.target } : {}), ...(g.rangeLow != null ? { rangeLow: g.rangeLow } : {}), ...(g.rangeHigh != null ? { rangeHigh: g.rangeHigh } : {}),
      weeks, cadence: g.cadence, ...(actions.length ? { actions } : {}),
    })
  }
  if (!routines.length && !packTrackers.length && !packGoals.length) return { ok: false, error: 'Pick at least one routine, tracker or goal.' }
  const id = slugify(meta.name).replace(/\./g, '-').slice(0, 40) || 'my-setup'
  const areas = [...new Set([...routines.map((r) => r.area), ...packTrackers.map((t) => t.area), ...packGoals.map((g) => g.area)])]
  const parsed = Pack.safeParse({
    format: PACK_FORMAT, version: PACK_VERSION, id, name: meta.name.trim().slice(0, 60), description: meta.description.trim().slice(0, 280),
    ...(meta.author?.trim() ? { author: meta.author.trim().slice(0, 60) } : {}), areas, routines, trackers: packTrackers, goals: packGoals,
  })
  if (!parsed.success) { const i = parsed.error.issues[0]; return { ok: false, error: `This setup can't be saved as a pack: ${i.path.join('.') || 'file'} ${i.message}` } }
  return { ok: true, pack: parsed.data, filename: `${id}.relife-pack.json` }
}
