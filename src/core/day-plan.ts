import { cache } from 'react'
import { CATEGORIES, type Category } from '@/db/schema'
import type { User } from '@/core/user'
import { dayAgenda, type ScheduleMeta } from '@/core/schedules'
import { trackerDays } from '@/core/metrics'
import { formatTime, localDate } from '@/core/time'
import { CATEGORY } from '@/ui/tokens'
import type { AgendaRow, GoalRow } from '@/ui/components/agenda'

export type DayPlan = {
  today: string
  rows: AgendaRow[]
  goals: GoalRow[]
  byCat: Record<Category, { done: number; total: number }>
  overdue: AgendaRow[]
  next: AgendaRow | undefined
  total: number
  done: number
}

/**
 * Today's plan: every routine row and quantity goal with its check state, counted per area. One place computes
 * it, so Today, the shell's area dots and anything else that shows check-off state agree.
 * Quantity routines (water) show once as a goal; everything else is a checkable row.
 */
export async function buildDayPlan(user: User, now = new Date()): Promise<DayPlan> {
  const today = localDate(now, user.timezone)
  const [agenda, trackers] = await Promise.all([dayAgenda(user, today, now), trackerDays(user, today, today)])
  const valueOf = (slug: string) => trackers.find((t) => t.tracker.slug === slug)?.days.get(today)

  const goals: GoalRow[] = []
  const rows: AgendaRow[] = []
  const catOf = new Map<string, Category>()
  for (const i of agenda) {
    const s = i.schedule
    const meta = s.meta as ScheduleMeta
    if (['subscription', 'bill', 'renewal'].includes(s.kind)) continue
    catOf.set(s.id, s.category)
    if (meta.trackerSlug && s.target) {
      if (!goals.some((g) => g.scheduleId === s.id)) {
        goals.push({
          scheduleId: s.id, name: s.name, value: valueOf(meta.trackerSlug) ?? 0, target: s.target,
          unit: s.unit ?? '', step: meta.step ?? Math.max(1, Math.round(s.target / 8)), area: s.category,
          // Water reads as water: the capsule blue rather than its area's colour.
          color: meta.trackerSlug === 'water' ? 'var(--pill)' : CATEGORY[s.category].color,
          next: agenda.filter((x) => x.schedule.id === s.id && x.occurrence > now).map((x) => formatTime(x.occurrence, user.timezone))[0],
        })
      }
      continue
    }
    rows.push({
      key: `${s.id}|${i.occurrence.toISOString()}`,
      scheduleId: s.id,
      occurrence: i.occurrence.toISOString(),
      time: formatTime(i.occurrence, user.timezone),
      name: s.name,
      kind: s.kind,
      color: CATEGORY[s.category].color,
      area: s.category,
      // Medicines: the dose and how many are left (amber when it's time to refill). Routines: their note.
      chips: s.kind === 'medicine'
        ? [...(meta.dose ? [{ text: meta.dose }] : []), ...(typeof meta.stock === 'number' ? [{ text: `${meta.stock} left`, warn: meta.stock <= (meta.refillAt ?? 7) }] : [])]
        : undefined,
      detail: s.kind === 'medicine' ? undefined : meta.notes,
      status: i.status,
    })
  }

  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, { done: 0, total: 0 }])) as DayPlan['byCat']
  for (const r of rows) { const c = catOf.get(r.scheduleId)!; byCat[c].total++; if (r.status === 'done') byCat[c].done++ }
  for (const g of goals) { const c = catOf.get(g.scheduleId)!; byCat[c].total++; if (g.value >= g.target) byCat[c].done++ }
  const total = rows.length + goals.length
  // Each routine's share of today's 100 plan XP, shown as its quest reward.
  for (const r of rows) r.xp = Math.round(100 / total)
  const done = Object.values(byCat).reduce((s, c) => s + c.done, 0)
  return { today, rows, goals, byCat, overdue: rows.filter((r) => r.status === 'missed'), next: rows.find((r) => r.status === 'pending'), total, done }
}

/** One plan per request: the shell's area dots and the page share it. */
export const loadDayPlan = cache((user: User) => buildDayPlan(user))
