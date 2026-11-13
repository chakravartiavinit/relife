// Today's plan, pure: which part of the day a row belongs to, how a period reads, the greeting and the XP a row is
// worth. `core/day-plan.ts` builds the rows from the database; Today's timeline and its states draw them from here.

export type Period = 'morning' | 'afternoon' | 'evening'

/** Three groups, not four: the night's routines (22:30 skincare) fold into the evening. */
export const PERIODS: readonly { key: Period; label: string; until: number }[] = [
  { key: 'morning', label: 'Morning', until: 12 },
  { key: 'afternoon', label: 'Afternoon', until: 17 },
  { key: 'evening', label: 'Evening', until: 24 },
]

/** The period of an `HH:MM` time. 11:59 is morning, 12:00 afternoon, 17:00 evening, 23:59 evening. */
export function periodOf(time: string): Period {
  const h = Number(time.slice(0, 2))
  return PERIODS.find((p) => h < p.until)?.key ?? 'evening'
}

/** One routine's share of the day's 100 plan XP, shown as its reward. */
export const xpShare = (total: number) => (total > 0 ? Math.round(100 / total) : 0)

/** The greeting for a local hour. The end of the day says good night, the small hours say what they are. */
export function greeting(hour: number): string {
  return hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night'
}

export type PlanRow = { time: string; name: string; status: 'done' | 'skipped' | 'pending' | 'missed' }

export type PeriodGroup<T extends PlanRow> = {
  key: Period
  label: string
  /** Overdue rows, then pending ones, in time order: what is still to do. */
  open: T[]
  /** Done and skipped rows: folded into one line. */
  closed: T[]
  /** Where the Now line goes: before `open[nowAt]`, or after the last one when it equals `open.length`. Null outside this period. */
  nowAt: number | null
  /** "1 overdue · 6 done", "3 left". */
  summary: string
}

const byTime = <T extends PlanRow>(a: T, b: T) => a.time.localeCompare(b.time)

/** "1 overdue · 3 left · 6 done", leaving out what is zero. */
export function periodSummary(overdue: number, pending: number, done: number) {
  return [overdue && `${overdue} overdue`, pending && `${pending} left`, done && `${done} done`].filter(Boolean).join(' · ')
}

/**
 * The day grouped Morning, Afternoon, Evening. In each, overdue rows come first, then pending ones; done and
 * skipped rows are kept apart so the page can fold them. `now` (`HH:MM`) places the Now line inside the period it
 * falls in, after the rows that are already due. Empty periods are left out.
 */
export function planPeriods<T extends PlanRow>(rows: T[], now?: string): PeriodGroup<T>[] {
  const here = now ? periodOf(now) : null
  return PERIODS.flatMap((p) => {
    const mine = rows.filter((r) => periodOf(r.time) === p.key)
    if (!mine.length) return []
    const missed = mine.filter((r) => r.status === 'missed').sort(byTime)
    const pending = mine.filter((r) => r.status === 'pending').sort(byTime)
    const open = [...missed, ...pending]
    const closed = mine.filter((r) => r.status === 'done' || r.status === 'skipped').sort(byTime)
    const due = now ? open.findIndex((r) => r.status === 'pending' && r.time > now) : -1
    const nowAt = here === p.key && now ? (due === -1 ? open.length : due) : null
    return [{ key: p.key, label: p.label, open, closed, nowAt, summary: periodSummary(missed.length, pending.length, closed.length) }]
  })
}

export type DayState = 'empty' | 'open' | 'complete'

/** Nothing planned, still going, or every row and goal done. */
export const dayState = (total: number, done: number): DayState => (total === 0 ? 'empty' : done >= total ? 'complete' : 'open')

/** The briefing's fallback sentence, written from the plan alone (no model, no stored brief). */
export function planLine(p: { total: number; done: number; next?: { name: string; time: string } }): string {
  if (!p.total) return 'Nothing planned today. Add a routine, or log something with the + button.'
  if (p.done >= p.total) return `All ${p.total} done. Nice.`
  return `${p.done} of ${p.total} done${p.next ? `. Next: ${p.next.name} at ${p.next.time}.` : '.'}`
}

/** The recap that replaces the briefing once the day is complete. */
export function recapLine(p: { total: number; tomorrow?: { name: string; time: string } }): string {
  const first = p.tomorrow ? ` Tomorrow starts with ${p.tomorrow.name} at ${p.tomorrow.time}.` : ''
  return `All ${p.total} done.${first}`
}

export type Pace = { label: 'Reached' | 'Ahead' | 'On pace' | 'Behind' | 'Too early'; tone: 'good' | 'pill' | 'warn' | 'neutral'; /** 0–1: how much of the time to the target date has passed. */ elapsed: number }

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000

/**
 * A goal's pace: its progress (0–1 toward the target) against how much of the time has passed. Within a tenth
 * of the way is On pace, more is Ahead, less is Behind. A goal that met its target is Reached whatever the
 * date; one with no progress figure yet is Too early to say (never Behind).
 */
export function goalPace(g: { share: number | null; met: boolean; startedOn: string; targetDate: string }, today: string): Pace {
  const span = Math.max(1, dayNumber(g.targetDate) - dayNumber(g.startedOn))
  const elapsed = Math.max(0, Math.min(1, (dayNumber(today) - dayNumber(g.startedOn)) / span))
  if (g.met) return { label: 'Reached', tone: 'good', elapsed }
  if (g.share == null) return { label: 'Too early', tone: 'neutral', elapsed }
  const gap = g.share - elapsed
  return gap > 0.1 ? { label: 'Ahead', tone: 'good', elapsed } : gap >= -0.1 ? { label: 'On pace', tone: 'pill', elapsed } : { label: 'Behind', tone: 'warn', elapsed }
}
