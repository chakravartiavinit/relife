// The browser extension's Today tab: today's routines and goals in the same shape the Today page uses, cut down
// to what a 360px popup shows. Pure, so the counting rules (what's left, each routine's XP share) are tested once.

export type PlanItem = {
  scheduleId: string
  name: string
  kind: string
  area: string
  occurrence: Date
  status: 'done' | 'skipped' | 'pending' | 'missed'
  /** Quantity routines (water) log into this tracker and show once as a goal. */
  trackerSlug?: string
  target?: number | null
  unit?: string | null
  step?: number
}

export type CompanionRoutine = { scheduleId: string; occurrence: string; time: string; name: string; kind: string; area: string; status: PlanItem['status']; xp: number }
export type CompanionGoal = { scheduleId: string; name: string; area: string; value: number; target: number; unit: string; step: number; trackerSlug: string }

/** Bills, subscriptions and renewals are money, not quests; Today leaves them out of the quest log too. */
const MONEY = new Set(['subscription', 'bill', 'renewal'])

/**
 * Today's checkable routines and quantity goals, with each routine's share of the day's 100 plan XP (as on Today),
 * and how many are still open. `time` formats an occurrence in the user's zone.
 */
export function companionPlan(items: PlanItem[], valueOf: (slug: string) => number, time: (d: Date) => string) {
  const routines: CompanionRoutine[] = []
  const goals: CompanionGoal[] = []
  for (const i of items) {
    if (MONEY.has(i.kind)) continue
    if (i.trackerSlug && i.target) {
      if (!goals.some((g) => g.scheduleId === i.scheduleId)) {
        goals.push({
          scheduleId: i.scheduleId, name: i.name, area: i.area, value: valueOf(i.trackerSlug), target: i.target,
          unit: i.unit ?? '', step: i.step ?? Math.max(1, Math.round(i.target / 8)), trackerSlug: i.trackerSlug,
        })
      }
      continue
    }
    routines.push({
      scheduleId: i.scheduleId, occurrence: i.occurrence.toISOString(), time: time(i.occurrence), name: i.name,
      kind: i.kind, area: i.area, status: i.status, xp: 0,
    })
  }
  const total = routines.length + goals.length
  for (const r of routines) r.xp = Math.round(100 / total)
  const done = routines.filter((r) => r.status === 'done').length + goals.filter((g) => g.value >= g.target).length
  // Skipped routines are handled, so they don't count as left.
  const left = routines.filter((r) => r.status === 'pending' || r.status === 'missed').length + goals.filter((g) => g.value < g.target).length
  return { routines, goals, done, total, left }
}
