import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { BriefWhy } from '@/db/schema'
import { BRIEF_SCOPES, type BriefFact, type BriefFacts, type BriefScope, type ChangeFact } from '@/domain/briefs'
import { patternsFrom, loadSignals } from './patterns'
import { peekParam } from '@/domain/peek'
import { loadAdherence } from './adherence'
import { AREA_LIST, areaScope, type AreaKpi } from './areas'
import { hmSeconds, loadTime } from './areas/time'
import { wealthOverview } from './areas/wealth'
import { buildDayPlan } from './day-plan'
import { addDays, localDate } from './time'
import type { User } from './user'
import { monthLabel } from '@/domain/wealth'
import { formatMoney } from '@/domain/money'

// The one-line summaries. Pages read them (`latestBrief`, one indexed query, never an AI call); the
// `ai:area-briefs` job writes them (src/ai/jobs/area-briefs.ts) from the facts gathered here.

export type Brief = { scope: BriefScope; text: string; why: BriefWhy; localDate: string; updatedAt: Date }

/** Today's brief for a scope, or yesterday's while today's is not written yet. Null when there is none, and when the table is missing (db:push not run yet). */
export async function latestBrief(user: User, scope: BriefScope, now = new Date()): Promise<Brief | null> {
  return (await latestBriefs(user, [scope], now)).get(scope) ?? null
}

/** The latest brief of each scope, in one query. */
export async function latestBriefs(user: User, scopes: BriefScope[], now = new Date()): Promise<Map<BriefScope, Brief>> {
  const today = localDate(now, user.timezone)
  try {
    const rows = await db.select().from(schema.briefs).where(and(
      eq(schema.briefs.userId, user.id), inArray(schema.briefs.scope, scopes), gte(schema.briefs.localDate, addDays(today, -1)),
    )).orderBy(desc(schema.briefs.localDate))
    const out = new Map<BriefScope, Brief>()
    for (const r of rows) if (!out.has(r.scope)) out.set(r.scope, { scope: r.scope, text: r.text, why: r.why, localDate: r.localDate, updatedAt: r.updatedAt })
    return out
  } catch {
    return new Map()
  }
}

/** Today's row for a scope as the job last wrote it (to compare hashes and times). */
export async function todaysBriefRows(user: User, today: string) {
  const rows = await db.select().from(schema.briefs).where(and(eq(schema.briefs.userId, user.id), eq(schema.briefs.localDate, today)))
  return new Map(rows.map((r) => [r.scope, r]))
}

export async function saveBrief(user: User, scope: BriefScope, today: string, text: string, why: BriefWhy) {
  await db.insert(schema.briefs).values({ userId: user.id, scope, localDate: today, text, why })
    .onConflictDoUpdate({ target: [schema.briefs.userId, schema.briefs.scope, schema.briefs.localDate], set: { text, why, updatedAt: new Date() } })
}

const kpiFact = (k: AreaKpi): BriefFact => ({ label: k.label, value: k.sub ? `${k.value} · ${k.sub}` : k.value, peek: k.peek ? peekParam(k.peek) : undefined })

/** What every scope has to say today: this week's changes, routines kept, the plan, money pace, focus time, and the area's own numbers. */
export async function gatherBriefFacts(user: User, now = new Date()): Promise<Record<BriefScope, BriefFacts>> {
  const today = localDate(now, user.timezone)
  const [{ signals }, routines, plan, kpis, time, wealth] = await Promise.all([
    loadSignals(user, now),
    loadAdherence(user, { kinds: ['routine', 'medicine'] }, 60, 14, now),
    buildDayPlan(user, now),
    Promise.all(AREA_LIST.map((a) => a.kpis(user, today).catch(() => []))),
    loadTime(user, today),
    wealthOverview(user).catch(() => null),
  ])
  const byArea = new Map<string, ChangeFact[]>()
  for (const c of patternsFrom(signals, today).changes) {
    // Routines done is a cross-area signal, not one area's.
    if (c.signal.id === 'routines') continue
    const list = byArea.get(c.signal.area) ?? []
    list.push({ name: c.signal.name, unit: c.signal.unit, pct: c.pct, recent: c.recent, usual: c.usual, peek: c.signal.id.startsWith('tracker:') ? peekParam({ type: 'metric', id: c.signal.id.slice(8) }) : undefined })
    byArea.set(c.signal.area, list)
  }

  // Routines done and due over the last 7 days, per area.
  const weekFrom = addDays(today, -6)
  const week = new Map<string, { done: number; due: number }>()
  for (const r of routines) {
    const w = week.get(r.schedule.category) ?? { done: 0, due: 0 }
    for (const d of r.days) {
      if (d.date < weekFrom) continue
      if (d.status === 'done') { w.done++; w.due++ } else if (d.status === 'partial' || d.status === 'missed') w.due++
    }
    week.set(r.schedule.category, w)
  }

  const out = {} as Record<BriefScope, BriefFacts>
  for (const s of BRIEF_SCOPES) out[s] = { changes: [], kpis: [] }
  AREA_LIST.forEach((a, i) => {
    const scope = areaScope(a)
    out[scope] = { changes: byArea.get(scope) ?? [], routines: a.category ? week.get(a.category) : undefined, kpis: kpis[i].map(kpiFact) }
  })
  const next = plan.next
  out.today = {
    changes: [], kpis: [],
    today: { done: plan.done, total: plan.total, overdue: plan.overdue.length, next: next ? { name: next.name, time: next.time } : undefined },
  }
  if (wealth && !wealth.empty) {
    const m = (v: number) => formatMoney(v, wealth.base, { decimals: 0 })
    out.wealth.money = { month: monthLabel(wealth.month).split(' ')[0], spent: m(wealth.pace.spent), projected: m(wealth.pace.projected), usual: wealth.pace.usual == null ? null : m(wealth.pace.usual), vsUsual: wealth.pace.vsUsual }
  }
  if (time.todayTotal > 0) {
    out.time.time = { focus: hmSeconds(time.focusToday), share: time.focusToday / time.todayTotal, total: hmSeconds(time.todayTotal), distraction: hmSeconds(time.distractToday) }
  }
  return out
}
