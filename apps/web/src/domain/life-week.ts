import { addDays } from '@/core/time'
import { weekStart } from './quests'

// The Life hub's "This week, area by area": which days each area earned XP, the week's XP and how it compares
// with the same days of last week. Pure: the caller passes the XP rows.

export type XpDay = { date: string; area: string; amount: number }
export type DayMark = 'active' | 'idle' | 'future'
export type WeekRow = {
  area: string
  /** Monday to Sunday. */
  marks: DayMark[]
  activeDays: number
  /** Days of the week gone so far, today included. */
  elapsed: number
  xp: number
  /** Percent against the same days last week (0.16 = +16%); null when last week earned nothing there. */
  delta: number | null
}
export type Week = { start: string; days: string[]; today: string; rows: WeekRow[]; areasHit: number; areaCount: number }

export function buildWeek(xp: XpDay[], today: string, areas: string[]): Week {
  const start = weekStart(today)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const elapsed = days.filter((d) => d <= today).length
  const prevStart = addDays(start, -7)
  const prevEnd = addDays(prevStart, elapsed - 1)
  const rows = areas.map((area): WeekRow => {
    const mine = xp.filter((r) => r.area === area)
    const byDay = new Set(mine.filter((r) => r.amount > 0).map((r) => r.date))
    const marks = days.map((d): DayMark => (d > today ? 'future' : byDay.has(d) ? 'active' : 'idle'))
    const sum = (from: string, to: string) => mine.filter((r) => r.date >= from && r.date <= to).reduce((s, r) => s + r.amount, 0)
    const now = sum(start, today), before = sum(prevStart, prevEnd)
    return { area, marks, activeDays: marks.filter((m) => m === 'active').length, elapsed, xp: now, delta: before > 0 ? (now - before) / before : null }
  })
  return { start, days, today, rows, areasHit: rows.filter((r) => r.activeDays > 0).length, areaCount: areas.length }
}
