import { cache } from 'react'
import { AREA_LIST, areaScope, loadAreaKpis, type AreaKpi, type AreaSlug } from './areas'
import { loadTodayBriefing } from './today'
import type { User } from './user'
import type { PeekRef } from '@/domain/peek'
import { areaStatus, changesOf } from '@/domain/life-status'
import type { Status } from '@/domain/status-of'
import { patternsFor } from './patterns'

/** One row of Today's Life pulse: an area's key number for today with a line of context and a status word. */
export type PulseTile = {
  slug: AreaSlug
  title: string
  color: string
  /** The measure, short: "Sleep", "Mood". */
  measure: string
  value: string
  sub?: string
  tone?: 'good' | 'bad'
  status: Status
  /** Where a tap goes. */
  peek: PeekRef
  /** Nothing logged yet: the row says so and opens Capture instead of a Peek. */
  action?: 'capture'
}

/** Which of an area's headline numbers is its key number on Today (the first unless listed). Time leads with focus. */
const KEY_KPI: Partial<Record<AreaSlug, number>> = { time: 1 }
const measureOf = (k: AreaKpi) => k.label.split(',')[0].replace(/ today$/, '')

/**
 * Today's Life pulse: the areas the user shows except Wealth (Money today has it), then Time. Each row's number comes
 * from the area's own headline numbers (`AreaDef.kpis`, the ones its page and the Life hub show), so a row never
 * disagrees with its page; its word comes from the week's change in that area, else from those numbers. Mind says so
 * when no mood is logged yet.
 */
export const loadPulse = cache(async (user: User): Promise<PulseTile[]> => {
  const picked = user.profile.areas
  const defs = AREA_LIST.filter((d) => d.slug !== 'wealth' && (d.category === null || !picked?.length || picked.includes(d.category)))
  const [{ briefing: b }, kpis, patterns] = await Promise.all([
    loadTodayBriefing(user),
    Promise.all(defs.map((d) => loadAreaKpis(user, d.slug))),
    patternsFor(user),
  ])
  return defs.map((d, i): PulseTile => {
    const k = kpis[i][KEY_KPI[d.slug] ?? 0]
    const base = { slug: d.slug, title: d.title, color: d.color }
    const brief: PeekRef = { type: 'brief', id: areaScope(d) }
    const status = (hasData: boolean) => areaStatus({ changes: changesOf(patterns.changes, d.category ?? 'time'), tones: kpis[i].map((x) => x.tone), hasData })
    if (d.slug === 'mind' && b.mood == null) return { ...base, measure: 'Mood', value: '–', sub: 'Not logged · tap to log', peek: k?.peek ?? brief, action: 'capture', status: status(false) }
    if (!k) return { ...base, measure: d.title, value: '–', sub: 'Nothing tracked yet', peek: brief, status: 'Quiet' }
    return { ...base, measure: measureOf(k), value: k.value, sub: k.sub, tone: k.tone, peek: k.peek ?? brief, status: status(true) }
  })
})
