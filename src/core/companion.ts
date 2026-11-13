import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { companionPlan } from '@/domain/companion'
import { streaks } from '@/domain/streaks'
import { activeDays, trackerDays } from './metrics'
import { activitySummary } from './activity'
import { env } from './env'
import { freezesHeld } from './quests'
import { dayAgenda, type ScheduleMeta } from './schedules'
import { systemBoard } from './system'
import { addDays, formatTime, localDate } from './time'
import type { User } from './user'
import { xpSummary } from './xp'

// The browser extension's side of ReLife: its token check, its "last seen" mark, and the Today tab's data
// (character, today's quests and routines). Routes: /api/activity (time) and /api/companion (Today).

/** The bearer token matches ACTIVITY_TOKEN (You › Connections → Laptop activity), compared in constant time. */
export function extensionAuthorized(req: Request) {
  const token = env('ACTIVITY_TOKEN')
  if (!token) return false
  const got = Buffer.from(req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '')
  const want = Buffer.from(token)
  return got.length === want.length && timingSafeEqual(got, want)
}

/** 503 before Laptop activity is connected, else 401 for a token that doesn't match. */
export const extensionDenied = () => env('ACTIVITY_TOKEN')
  ? Response.json({ error: 'unauthorized: the token doesn’t match the one on You › Connections → Laptop activity' }, { status: 401 })
  : Response.json({ error: 'Laptop activity is not connected. Set a token on the Connections page.' }, { status: 503 })

/** The extension posts every 30 seconds while the browser is open; the Activity page shows when it last did. */
/** Best effort: a failed mark never fails the request that carries the extension's data. */
export async function markExtensionSeen(now = new Date()) {
  await db.insert(schema.heartbeats).values({ name: 'extension', at: now })
    .onConflictDoUpdate({ target: schema.heartbeats.name, set: { at: now } })
    .catch((e) => console.error('[heartbeat]', e instanceof Error ? e.message : e))
}

export async function extensionLastSeen() {
  const [row] = await db.select().from(schema.heartbeats).where(eq(schema.heartbeats.name, 'extension'))
  return row?.at ?? null
}

/** Everything the popup's Today tab shows, in one request. Read-only. */
export async function companionView(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  const [xp, agenda, trackers, active, freezes, system, screen] = await Promise.all([
    xpSummary(user, now),
    dayAgenda(user, today, now),
    trackerDays(user, today, today),
    activeDays(user, addDays(today, -400)),
    freezesHeld(user),
    systemBoard(user, now),
    activitySummary(user, today, today),
  ])
  const valueOf = (slug: string) => trackers.find((t) => t.tracker.slug === slug)?.days.get(today) ?? 0
  const plan = companionPlan(agenda.map((i) => {
    const meta = i.schedule.meta as ScheduleMeta
    return {
      scheduleId: i.schedule.id, name: i.schedule.name, kind: i.schedule.kind, area: i.schedule.category,
      occurrence: i.occurrence, status: i.status, trackerSlug: meta.trackerSlug, target: i.schedule.target,
      unit: i.schedule.unit, step: meta.step,
    }
  }), valueOf, (d) => formatTime(d, user.timezone))
  const quests = system.quests.map((q) => ({
    id: q.id, title: q.title, area: q.area, rank: q.rank, xp: q.xp, status: q.status,
    progress: q.progress, target: q.target, unit: q.unit, op: q.op,
  }))
  const streak = streaks(active, today)
  return {
    today,
    name: user.name.split(' ')[0],
    character: {
      level: xp.level, title: xp.title, total: xp.total, floor: xp.floor, next: xp.next, progress: xp.progress, todayXp: xp.today,
      streak: streak.current, best: streak.best, doneToday: active.has(today), freezes,
    },
    quests,
    ...plan,
    // What the toolbar badge counts: routines and goals still open plus System quests not yet cleared.
    left: plan.left + quests.filter((q) => q.status === 'active').length,
    focus: { seconds: screen.total, byKind: screen.byKind.map(({ kind, seconds }) => ({ kind, seconds })) },
  }
}
