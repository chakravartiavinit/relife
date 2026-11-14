import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import {
  BASELINE_DAYS, CADENCE_DAYS, CAP_MESSAGE, MAX_ACTIVE, goalFields, goalIsSensitive, goalSnapshot, goalStatIds, isActivityMeasure,
  nextReviewOn, reviewLines, trackerBaseline, validateGoal,
  type ActionSource, type GoalActionLink, type GoalDecision, type GoalErrors, type GoalFields,
  type GoalInput, type GoalSnapshot, type GoalStatus,
} from '@/domain/goals'
import { loadAdherence } from './adherence'
import { trackerDays } from './metrics'
import { lockUser, type Tx } from './recovery'
import { addDays, daysBetween, localDate } from './time'
import type { User } from './user'

// Outcome goals: reads, the weekly review rows, and every write under the user's row lock.
// Numbers come from src/domain/goals.ts; the AI never sets a baseline or activates a goal.

export type Goal = typeof schema.goals.$inferSelect
export type GoalReview = typeof schema.goalReviews.$inferSelect
export type GoalCheckIn = typeof schema.goalCheckIns.$inferSelect
type SnapshotView = { snapshot: GoalSnapshot; sensitive: boolean; actionNames: string[]; trackerArchived: boolean }
/** Dates are local days in the user's time zone, so the UI never shows a UTC day. */
export type GoalView = Goal & Omit<SnapshotView, 'snapshot'> & { snapshot: GoalSnapshot | null; startedOn: string; pausedOn: string | null; finishedOn: string | null }

const G = schema.goals, R = schema.goalReviews, C = schema.goalCheckIns

export const inputOf = (g: Goal, f: GoalFields = goalFields(g)): GoalInput => ({
  ...f, area: g.area, measureKind: g.measureKind, trackerId: g.trackerId, measureName: g.measureName, unit: g.unit,
  direction: g.direction, baselineValue: g.baselineValue, baselineDate: g.baselineDate, baselineHow: g.baselineHow,
})

/** Snapshots for several goals in a few queries (trackers, tracker days, checks, check-ins). */
export async function snapshotsFor(user: User, list: Goal[], reviewDate: string, now = new Date()): Promise<Map<string, SnapshotView>> {
  const out = new Map<string, SnapshotView>()
  if (!list.length) return out
  const maxWindow = Math.max(...list.map((g) => CADENCE_DAYS[g.cadence]))
  const from = addDays(reviewDate, -maxWindow)
  // loadAdherence counts back from today; cover the window even for an older review date.
  const span = Math.max(1, daysBetween(from, localDate(now, user.timezone)) + 1)
  const trackerIds = [...new Set(list.flatMap((g) => [g.trackerId, ...g.actions.filter((a) => a.kind === 'tracker').map((a) => a.id)]).filter((x): x is string => !!x))]
  const scheduleIds = [...new Set(list.flatMap((g) => g.actions.filter((a) => a.kind === 'schedule').map((a) => a.id)))]
  const trackers = trackerIds.length
    ? await db.select().from(schema.trackers).where(and(eq(schema.trackers.userId, user.id), inArray(schema.trackers.id, trackerIds), isNull(schema.trackers.archivedAt)))
    : []
  const [days, adherence, checkIns, schedules] = await Promise.all([
    trackers.length ? trackerDays(user, from, reviewDate, { slugs: trackers.map((t) => t.slug) }) : Promise.resolve([]),
    scheduleIds.length ? loadAdherence(user, { kinds: ['routine'], ids: scheduleIds }, span, span, now) : Promise.resolve([]),
    db.select().from(C).where(and(eq(C.userId, user.id), inArray(C.goalId, list.map((g) => g.id)), lte(C.localDate, reviewDate))),
    // Names of inactive routines too, so the review can say which link went away.
    scheduleIds.length ? db.select({ id: schema.schedules.id, name: schema.schedules.name }).from(schema.schedules).where(and(eq(schema.schedules.userId, user.id), inArray(schema.schedules.id, scheduleIds))) : Promise.resolve([]),
  ])
  const daysOf = (id: string) => days.find((d) => d.tracker.id === id)?.days ?? new Map<string, number>()
  for (const g of list) {
    const window = { from: addDays(reviewDate, -CADENCE_DAYS[g.cadence]), to: addDays(reviewDate, -1) }
    const actions = g.actions.map((link: GoalActionLink): { link: GoalActionLink; source: ActionSource | null } => {
      if (link.kind === 'tracker') {
        const t = trackers.find((x) => x.id === link.id)
        return { link, source: t ? { kind: 'tracker', name: t.name, days: daysOf(t.id), target: t.target, direction: t.direction } : null }
      }
      const a = adherence.find((x) => x.schedule.id === link.id)
      // Inactive or deleted routines are unavailable; their names are filled in below when they still exist.
      if (!a || !a.schedule.active) return { link, source: null }
      return { link, source: { kind: 'schedule', name: a.schedule.name, statuses: a.days.filter((d) => d.date >= window.from && d.date <= window.to).map((d) => d.status) } }
    })
    const outcome = g.trackerId ? trackers.find((t) => t.id === g.trackerId) : undefined
    const sensitive = goalIsSensitive(g.measureName, g.unit, outcome?.slug)
    const snapshot = goalSnapshot(g, { days: g.trackerId ? daysOf(g.trackerId) : undefined, checkIns: checkIns.filter((c) => c.goalId === g.id) }, actions, reviewDate, sensitive, now)
    const actionNames = actions.map((a, i) => a.source?.name ?? schedules.find((s) => s.id === g.actions[i].id)?.name ?? 'Action no longer available')
    snapshot.actions = snapshot.actions.map((a, i) => (a.available ? a : { ...a, name: actionNames[i] }))
    // An archived or deleted outcome tracker is not returned by the tracker query above.
    out.set(g.id, { snapshot, sensitive, actionNames, trackerArchived: g.measureKind === 'tracker' && !outcome })
  }
  return out
}

export async function computeSnapshot(user: User, goal: Goal, reviewDate: string, now = new Date()) {
  return (await snapshotsFor(user, [goal], reviewDate, now)).get(goal.id)!
}

/** Trackers and routines the form can link, with a suggested baseline from the last 28 complete days. */
export async function goalPicker(user: User, today: string) {
  const [days, routines] = await Promise.all([
    trackerDays(user, addDays(today, -BASELINE_DAYS), addDays(today, -1)),
    db.select({ id: schema.schedules.id, name: schema.schedules.name, category: schema.schedules.category }).from(schema.schedules)
      .where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true), eq(schema.schedules.kind, 'routine')))
      .orderBy(schema.schedules.name),
  ])
  return {
    trackers: days.map(({ tracker: t, days: d }) => {
      const b = trackerBaseline(d, today)
      return {
        id: t.id, slug: t.slug, name: t.name, unit: t.unit, category: t.category, kind: t.kind,
        sensitive: goalIsSensitive(t.slug, t.name, t.unit), activity: isActivityMeasure(t),
        baseline: b.value == null ? null : { value: b.value, observations: b.observations, how: b.how!, date: today },
        observations: b.observations,
        /** The 28 baseline days, oldest first: true when something was recorded. */
        strip: Array.from({ length: BASELINE_DAYS }, (_, i) => d.has(addDays(today, i - BASELINE_DAYS))),
      }
    }).sort((a, b) => a.name.localeCompare(b.name)),
    routines,
  }
}
export type GoalPicker = Awaited<ReturnType<typeof goalPicker>>

async function viewsFor(user: User, list: Goal[], today: string, now: Date): Promise<GoalView[]> {
  const live = list.filter((g) => g.status !== 'finished')
  const snaps = await snapshotsFor(user, live, today, now)
  const finished = list.filter((g) => g.status === 'finished')
  const last = finished.length
    ? await db.selectDistinctOn([R.goalId]).from(R).where(and(eq(R.userId, user.id), inArray(R.goalId, finished.map((g) => g.id)))).orderBy(R.goalId, desc(R.createdAt))
    : []
  const local = (d: Date | null) => (d ? localDate(d, user.timezone) : null)
  return list.map((g) => {
    const dates = { startedOn: local(g.createdAt)!, pausedOn: local(g.pausedAt), finishedOn: local(g.finishedAt) }
    const s = snaps.get(g.id)
    if (s) return { ...g, ...s, ...dates }
    const r = last.find((x) => x.goalId === g.id)
    return {
      ...g, ...dates, snapshot: r?.snapshot ?? null, sensitive: r?.snapshot.sensitive ?? goalIsSensitive(g.measureName, g.unit),
      actionNames: r?.snapshot.actions.map((a) => a.name) ?? [], trackerArchived: false,
    }
  })
}

/** The newest review row per goal. A goal's review is due only when that newest row is undecided. */
async function latestReviews(userId: string, goalIds?: string[]) {
  if (goalIds && !goalIds.length) return []
  return db.selectDistinctOn([R.goalId]).from(R)
    .where(and(eq(R.userId, userId), eq(R.kind, 'review'), goalIds ? inArray(R.goalId, goalIds) : undefined))
    .orderBy(R.goalId, desc(R.reviewDate), desc(R.createdAt))
}

/** Everything the Goals page shows. */
export async function loadGoalsPage(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const [list, reviews, drafts, picker] = await Promise.all([
    db.select().from(G).where(eq(G.userId, user.id)).orderBy(desc(G.updatedAt)),
    latestReviews(user.id),
    db.select().from(schema.insights).where(and(eq(schema.insights.userId, user.id), eq(schema.insights.status, 'pending'), sql`${schema.insights.payload} ? 'goalDraft'`)).orderBy(desc(schema.insights.createdAt)),
    goalPicker(user, today),
  ])
  const views = await viewsFor(user, list, today, now)
  const active = views.filter((g) => g.status === 'active')
  // Only the newest review of an active goal can ask for a decision; older undecided ones read "No decision recorded".
  const due = active.flatMap((g) => {
    const r = reviews.find((x) => x.goalId === g.id)
    return r && !r.decision ? [{ review: r, goal: g }] : []
  })
  // Decided today: the review page keeps showing them in their saved state after the refresh.
  const decidedToday = views.flatMap((g) => {
    const r = reviews.find((x) => x.goalId === g.id)
    return r?.decision && r.decidedAt && localDate(r.decidedAt, user.timezone) === today ? [{ review: r, goal: g }] : []
  })
  return {
    today,
    active,
    paused: views.filter((g) => g.status === 'paused'),
    finished: views.filter((g) => g.status === 'finished'),
    due,
    decidedToday,
    drafts,
    picker,
    activeCount: active.length,
  }
}

/** What the goal form needs to open from a draft anywhere (Coach's Needs you): the picker, today and how many goals are active. */
export async function goalFormContext(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const [picker, [active]] = await Promise.all([
    goalPicker(user, today),
    db.select({ n: sql<number>`count(*)::int` }).from(G).where(and(eq(G.userId, user.id), eq(G.status, 'active'))),
  ])
  return { picker, today, activeCount: active?.n ?? 0 }
}

/** How many active goals wait on a weekly-review decision. Two light queries, for the dot on the Plan › Review tab. */
export async function dueReviewCount(user: User) {
  const [active, reviews] = await Promise.all([
    db.select({ id: G.id }).from(G).where(and(eq(G.userId, user.id), eq(G.status, 'active'))),
    latestReviews(user.id),
  ])
  return active.filter((g) => reviews.some((r) => r.goalId === g.id && !r.decision)).length
}

/** One goal with its history and check-ins, for /plan/goals/[id]. */
export async function loadGoalDetail(user: User, id: string, now = new Date()) {
  const today = localDate(now, user.timezone)
  const [goal] = await db.select().from(G).where(and(eq(G.id, id), eq(G.userId, user.id)))
  if (!goal) return null
  const [[view], history, checkIns, picker, activeCount] = await Promise.all([
    viewsFor(user, [goal], today, now),
    db.select().from(R).where(and(eq(R.userId, user.id), eq(R.goalId, id))).orderBy(desc(R.createdAt)).limit(50),
    db.select().from(C).where(and(eq(C.userId, user.id), eq(C.goalId, id))).orderBy(desc(C.localDate)).limit(60),
    goalPicker(user, today),
    activeGoalCount(user),
  ])
  const latest = history.filter((r) => r.kind === 'review').sort((a, b) => b.reviewDate.localeCompare(a.reviewDate))[0]
  return { today, goal: view, history, checkIns, picker, activeCount, due: goal.status === 'active' && latest && !latest.decision ? latest : null }
}

async function activeGoalCount(user: User) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(G).where(and(eq(G.userId, user.id), eq(G.status, 'active')))
  return n
}

/** Light query for Today: active goals with one status line each. */
export async function goalsSummary(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const list = await db.select().from(G).where(and(eq(G.userId, user.id), eq(G.status, 'active'))).orderBy(G.createdAt).limit(MAX_ACTIVE)
  if (!list.length) return []
  const [snaps, latest] = await Promise.all([snapshotsFor(user, list, today, now), latestReviews(user.id, list.map((g) => g.id))])
  // Due only when a review row is waiting, so the link never opens an empty review page.
  return list.map((g) => ({ ...g, ...snaps.get(g.id)!, reviewDue: latest.some((r) => r.goalId === g.id && !r.decision) }))
}

/**
 * Create today's review row for every active goal that is due (or one goal on request). Idempotent per goal and
 * day. Returns the undecided rows for today.
 */
export async function prepareGoalReviews(user: User, now = new Date(), goalId?: string) {
  const today = localDate(now, user.timezone)
  const list = await db.select().from(G).where(and(
    eq(G.userId, user.id), eq(G.status, 'active'),
    goalId ? eq(G.id, goalId) : lte(G.nextReviewOn, today),
  ))
  if (!list.length) return []
  const snaps = await snapshotsFor(user, list, today, now)
  await db.insert(R).values(list.map((g) => ({
    userId: user.id, goalId: g.id, ref: `review:${g.id}:${today}`, kind: 'review' as const, reviewDate: today, snapshot: snaps.get(g.id)!.snapshot,
  }))).onConflictDoNothing()
  const rows = await db.select().from(R).where(and(eq(R.userId, user.id), inArray(R.goalId, list.map((g) => g.id)), eq(R.reviewDate, today), eq(R.kind, 'review')))
  return rows.filter((r) => !r.decision).map((r) => ({ review: r, goal: list.find((g) => g.id === r.goalId)! }))
}

/** The deterministic review lines for one goal, shared by the app, the insight and Telegram. */
export function reviewPoint(goal: Goal, review: GoalReview) {
  const { lines, prompt } = reviewLines(goal, review.snapshot)
  return { goalId: goal.id, reviewId: review.id, title: goal.title, lines, prompt }
}

export type GoalResult =
  | { status: 'saved'; id: string }
  | { status: 'invalid'; errors: GoalErrors }
  | { status: 'stale' | 'not_found' | 'already_decided' }

export type SaveGoalInput = GoalInput & { id?: string; version?: number; draftInsightId?: string; useRecorded?: boolean }

/**
 * Routines and trackers validateGoal may link. A locked outcome tracker may since be archived; an edit doesn't
 * change it, so it still counts.
 */
async function linkables(tx: Tx, userId: string, lockedTrackerId: string | null | undefined) {
  const [schedules, trackers] = await Promise.all([
    tx.select({ id: schema.schedules.id, kind: schema.schedules.kind, active: schema.schedules.active }).from(schema.schedules).where(eq(schema.schedules.userId, userId)),
    tx.select({ id: schema.trackers.id }).from(schema.trackers).where(and(eq(schema.trackers.userId, userId), isNull(schema.trackers.archivedAt))),
  ])
  return { schedules, trackers: lockedTrackerId ? [...trackers, { id: lockedTrackerId }] : trackers }
}

/** Keep only the target fields that apply to the direction (a target, or a range). */
const forDirection = (direction: Goal['direction'], f: GoalFields): GoalFields =>
  direction === 'range' ? { ...f, target: null } : { ...f, rangeLow: null, rangeHigh: null }

/** Create or edit a goal. A recorded baseline is always recomputed here; the client value is not trusted. */
export async function saveGoal(user: User, input: SaveGoalInput, now = new Date(), outer?: Tx): Promise<GoalResult> {
  // `outer`: a transaction that already holds the user lock (a pack import creates routines, trackers and goals together).
  const x = outer ?? db
  const today = localDate(now, user.timezone)
  const [existing] = input.id ? await x.select().from(G).where(and(eq(G.id, input.id), eq(G.userId, user.id))) : []
  if (input.id && !existing) return { status: 'not_found' }
  let g: GoalInput = { ...input, title: input.title.trim(), reason: input.reason.trim() }
  let baselineObservations: number | null = null
  if (!existing && g.measureKind === 'tracker' && g.trackerId) {
    const [t] = await x.select().from(schema.trackers).where(and(eq(schema.trackers.id, g.trackerId), eq(schema.trackers.userId, user.id), isNull(schema.trackers.archivedAt)))
    if (t) {
      g = { ...g, measureName: t.name, unit: t.unit }
      if (input.useRecorded) {
        const [d] = await trackerDays(user, addDays(today, -BASELINE_DAYS), addDays(today, -1), { slugs: [t.slug] })
        const b = trackerBaseline(d?.days ?? new Map(), today)
        if (b.value == null) return { status: 'invalid', errors: { baselineValue: `Only ${b.observations} recorded days in the last 4 weeks. Enter a baseline yourself.` } }
        g = { ...g, baselineValue: Math.round(b.value * 100) / 100, baselineDate: today, baselineHow: b.how! }
        baselineObservations = b.observations
      }
    }
  }
  // An edit keeps the locked measure and baseline, whatever the form sent.
  if (existing) g = inputOf(existing, forDirection(existing.direction, goalFields(g)))
  const before = existing ? await computeSnapshot(user, existing, today, now) : null

  const run = <T>(f: (tx: Tx) => Promise<T>) => (outer ? f(outer) : db.transaction(f))
  return run(async (tx) => {
    await lockUser(tx, user.id)
    const [current] = existing ? await tx.select().from(G).where(and(eq(G.id, existing.id), eq(G.userId, user.id))).for('update') : []
    if (existing && (!current || current.version !== input.version)) return { status: 'stale' as const }
    if (current?.status === 'finished') return { status: 'invalid' as const, errors: { form: 'Finished goals are read-only.' } }
    const [links, [{ n }]] = await Promise.all([
      linkables(tx, user.id, current?.trackerId),
      tx.select({ n: sql<number>`count(*)::int` }).from(G).where(and(eq(G.userId, user.id), eq(G.status, 'active'), current ? sql`${G.id} <> ${current.id}` : undefined)),
    ])
    const errors = validateGoal(g, { today, activating: !current, activeCount: n, ...links })
    // The measure and baseline are locked on edits: a past baseline date or a since-deleted tracker never blocks one.
    if (current) { delete errors.baselineDate; delete errors.trackerId }
    if (Object.keys(errors).length) return { status: 'invalid' as const, errors }

    if (current) {
      const after = goalFields(g)
      await tx.update(G).set({
        ...after, version: current.version + 1, updatedAt: now,
        nextReviewOn: after.cadence !== current.cadence ? nextReviewOn(today, after.cadence) : current.nextReviewOn,
      }).where(eq(G.id, current.id))
      await tx.insert(R).values({ userId: user.id, goalId: current.id, ref: `edit:${randomUUID()}`, kind: 'edit', reviewDate: today, snapshot: before!.snapshot, before: goalFields(current), after, decision: 'change', decidedAt: now })
      return { status: 'saved' as const, id: current.id }
    }

    let source: 'user' | 'ai_draft' = 'user', insightId: string | null = null
    if (input.draftInsightId) {
      const [ins] = await tx.select().from(schema.insights).where(and(eq(schema.insights.id, input.draftInsightId), eq(schema.insights.userId, user.id))).for('update')
      if (!ins || ins.status !== 'pending' || !ins.payload.goalDraft) return { status: 'stale' as const }
      await tx.update(schema.insights).set({ status: 'accepted', updatedAt: now }).where(eq(schema.insights.id, ins.id))
      source = 'ai_draft'; insightId = ins.id
    }
    const [row] = await tx.insert(G).values({
      userId: user.id, title: g.title, reason: g.reason, area: g.area, measureKind: g.measureKind,
      trackerId: g.measureKind === 'tracker' ? g.trackerId : null, measureName: g.measureName.trim(), unit: g.unit?.trim() || null,
      direction: g.direction, target: g.direction === 'range' ? null : g.target, rangeLow: g.direction === 'range' ? g.rangeLow : null, rangeHigh: g.direction === 'range' ? g.rangeHigh : null,
      baselineValue: g.baselineValue!, baselineDate: g.baselineDate, baselineHow: g.baselineHow.trim(), baselineObservations,
      targetDate: g.targetDate, cadence: g.cadence, nextReviewOn: nextReviewOn(today, g.cadence), actions: g.actions, source, insightId,
    }).returning({ id: G.id })
    return { status: 'saved' as const, id: row.id }
  })
}

/** Pause, resume or finish outside a review. Writes one history row. */
export async function setGoalStatus(user: User, input: { goalId: string; version: number; status: GoalStatus }, now = new Date()): Promise<GoalResult> {
  const today = localDate(now, user.timezone)
  const [goal] = await db.select().from(G).where(and(eq(G.id, input.goalId), eq(G.userId, user.id)))
  if (!goal) return { status: 'not_found' }
  const { snapshot } = await computeSnapshot(user, goal, today, now)
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    const [current] = await tx.select().from(G).where(and(eq(G.id, goal.id), eq(G.userId, user.id))).for('update')
    if (!current) return { status: 'not_found' as const }
    if (current.version !== input.version) return { status: 'stale' as const }
    if (current.status === 'finished') return { status: 'invalid' as const, errors: { form: 'Finished goals are read-only.' } }
    if (current.status === input.status) return { status: 'saved' as const, id: current.id }
    if (input.status === 'active') {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(G).where(and(eq(G.userId, user.id), eq(G.status, 'active')))
      if (n >= MAX_ACTIVE) return { status: 'invalid' as const, errors: { form: CAP_MESSAGE } }
    }
    const decision: GoalDecision = input.status === 'active' ? 'resume' : input.status === 'paused' ? 'pause' : 'finish'
    await tx.update(G).set({
      status: input.status, version: current.version + 1, updatedAt: now,
      ...(input.status === 'paused' ? { pausedAt: now } : input.status === 'finished' ? { finishedAt: now } : { pausedAt: null, nextReviewOn: nextReviewOn(today, current.cadence) }),
    }).where(eq(G.id, current.id))
    // A pause or finish answers any open review, so an old review never comes back as due after a resume.
    const open = input.status === 'active' ? [] : await tx.update(R).set({ decision, decidedAt: now, note: 'Decided outside the review' })
      .where(and(eq(R.userId, user.id), eq(R.goalId, current.id), eq(R.kind, 'review'), isNull(R.decision))).returning({ id: R.id })
    if (!open.length) await tx.insert(R).values({ userId: user.id, goalId: current.id, ref: `edit:${randomUUID()}`, kind: 'edit', reviewDate: today, snapshot, decision, decidedAt: now })
    return { status: 'saved' as const, id: current.id }
  })
}

export type DecideInput = {
  reviewId: string; goalVersion: number; decision: Exclude<GoalDecision, 'resume'>
  change?: Partial<Pick<GoalFields, 'title' | 'reason' | 'target' | 'rangeLow' | 'rangeHigh' | 'targetDate' | 'cadence' | 'actions'>>
  note?: string
}

/** Record a review decision. Nothing about the goal changes without one. */
export async function decideReview(user: User, input: DecideInput, now = new Date()): Promise<GoalResult> {
  const today = localDate(now, user.timezone)
  return db.transaction(async (tx) => {
    await lockUser(tx, user.id)
    const [review] = await tx.select().from(R).where(and(eq(R.id, input.reviewId), eq(R.userId, user.id), eq(R.kind, 'review'))).for('update')
    if (!review) return { status: 'not_found' as const }
    if (review.decision) return { status: 'already_decided' as const }
    const [goal] = await tx.select().from(G).where(and(eq(G.id, review.goalId), eq(G.userId, user.id))).for('update')
    if (!goal) return { status: 'not_found' as const }
    if (goal.version !== input.goalVersion || goal.status !== 'active') return { status: 'stale' as const }
    const note = input.note?.trim().slice(0, 280) || null
    let before: GoalFields | null = null, after: GoalFields | null = null
    let set: Partial<typeof G.$inferInsert> = { version: goal.version + 1, updatedAt: now }
    if (input.decision === 'keep') set.nextReviewOn = nextReviewOn(today, goal.cadence)
    else if (input.decision === 'pause') set = { ...set, status: 'paused', pausedAt: now }
    else if (input.decision === 'finish') set = { ...set, status: 'finished', finishedAt: now }
    else {
      before = goalFields(goal)
      after = forDirection(goal.direction, { ...before, ...input.change })
      const errors = validateGoal(inputOf(goal, after), { today, activating: false, activeCount: 0, ...await linkables(tx, user.id, goal.trackerId) })
      delete errors.baselineDate
      delete errors.trackerId
      if (Object.keys(errors).length) return { status: 'invalid' as const, errors }
      set = { ...set, ...after, nextReviewOn: nextReviewOn(today, after.cadence) }
    }
    await tx.update(G).set(set).where(eq(G.id, goal.id))
    await tx.update(R).set({ decision: input.decision, decidedAt: now, note, before, after }).where(eq(R.id, review.id))
    return { status: 'saved' as const, id: goal.id }
  })
}

/** Record a manual check-in, then refresh the snapshot of any undecided review that covers that day. */
export async function recordCheckIn(user: User, input: { goalId: string; localDate: string; value: number; note?: string }, now = new Date()): Promise<GoalResult> {
  const today = localDate(now, user.timezone)
  const [goal] = await db.select().from(G).where(and(eq(G.id, input.goalId), eq(G.userId, user.id)))
  if (!goal) return { status: 'not_found' }
  if (goal.measureKind !== 'check_in' || goal.status === 'finished') return { status: 'invalid', errors: { form: 'This goal does not take check-ins.' } }
  if (input.localDate > today) return { status: 'invalid', errors: { form: 'A check-in cannot be in the future.' } }
  if (!Number.isFinite(input.value)) return { status: 'invalid', errors: { form: 'Enter a number.' } }
  const note = input.note?.trim().slice(0, 280) || null
  await db.insert(C).values({ userId: user.id, goalId: goal.id, localDate: input.localDate, value: input.value, note })
    .onConflictDoUpdate({ target: [C.goalId, C.localDate], set: { value: input.value, note, updatedAt: now } })
  const open = await db.select().from(R).where(and(eq(R.userId, user.id), eq(R.goalId, goal.id), eq(R.kind, 'review'), isNull(R.decision)))
  for (const r of open.filter((r) => r.reviewDate >= input.localDate && addDays(r.reviewDate, -CADENCE_DAYS[goal.cadence]) < input.localDate)) {
    const { snapshot } = await computeSnapshot(user, goal, r.reviewDate, now)
    await db.update(R).set({ snapshot }).where(and(eq(R.id, r.id), isNull(R.decision)))
  }
  return { status: 'saved', id: goal.id }
}

/** Quest signal IDs linked to active goals, with the goal title for the quest reason. */
export async function activeGoalStatIds(user: User) {
  const list = await db.select({ status: G.status, title: G.title, actions: G.actions }).from(G).where(and(eq(G.userId, user.id), eq(G.status, 'active')))
  if (!list.length) return new Map<string, string>()
  const [schedules, trackers] = await Promise.all([
    db.select({ id: schema.schedules.id, meta: schema.schedules.meta }).from(schema.schedules).where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true))),
    db.select({ id: schema.trackers.id, slug: schema.trackers.slug }).from(schema.trackers).where(and(eq(schema.trackers.userId, user.id), isNull(schema.trackers.archivedAt))),
  ])
  return goalStatIds(list, schedules, trackers)
}

/** Active goals for the AI digest and the `goals` tool: bounded, plain numbers, no reasons beyond 200 chars. */
export async function outcomeGoalsDigest(user: User, now = new Date()) {
  const summary = await goalsSummary(user, now)
  const [{ n: pausedCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(G).where(and(eq(G.userId, user.id), eq(G.status, 'paused')))
  return {
    note: 'Goal snapshots compare actions and outcome; they do not show cause. Null means not enough data, not zero.',
    pausedCount,
    goals: summary.map((g) => ({
      title: g.title.slice(0, 120), reason: g.reason.slice(0, 200), area: g.area, measure: g.measureName, unit: g.unit, direction: g.direction,
      baseline: { value: g.baselineValue, date: g.baselineDate, how: g.baselineHow.slice(0, 200) },
      target: g.direction === 'range' ? { low: g.rangeLow, high: g.rangeHigh } : g.target, targetDate: g.targetDate,
      status: g.snapshot.outcome.status, current: g.snapshot.outcome.current, observations: g.snapshot.outcome.observations,
      adherence: g.snapshot.adherence, actions: g.actionNames, sensitive: g.sensitive,
    })),
  }
}
