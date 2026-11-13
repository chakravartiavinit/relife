import type { TodayView } from '@relife/contract'
import { companionPlan } from '@/domain/companion'
import { streaks } from '@/domain/streaks'
import { activeDays, trackerDays } from './metrics'
import { activitySummary } from './activity'
import { freezesHeld } from './quests'
import { dayAgenda, type ScheduleMeta } from './schedules'
import { systemBoard } from './system'
import { addDays, formatTime, localDate } from './time'
import type { User } from './user'
import { xpSummary } from './xp'

// What the device clients show for Today (character, today's quests and routines), in one request. The shapes are in
// @relife/contract (TodayView); the routes are /api/v1/today and /api/v1/activity (src/core/v1), and the older /api/companion and
// /api/activity are aliases. Who may call them is src/core/auth.

/** Everything the popup's Today tab shows, in one request. Read-only. */
export async function companionView(user: User, now = new Date()): Promise<TodayView> {
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
