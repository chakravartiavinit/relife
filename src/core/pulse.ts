import { cache } from 'react'
import { AREA_LIST, areaScope, loadAreaKpis, type AreaKpi, type AreaSlug } from './areas'
import { loadHubSparks } from './life-week'
import { loadTodayBriefing } from './today'
import { localDate } from './time'
import type { User } from './user'
import { formatMoney } from '@/domain/money'
import type { PeekRef } from '@/domain/peek'

/** One cell of Today's Life pulse: an area's key number for today, a line of context and a 7-day trend. */
export type PulseTile = {
  slug: AreaSlug
  title: string
  color: string
  /** The measure, short: "Sleep", "Mood". */
  measure: string
  value: string
  sub?: string
  tone?: 'good' | 'bad'
  /** Where a tap goes. */
  peek: PeekRef
  /** Nothing logged yet: the cell says so and opens Capture instead of a Peek. */
  action?: 'capture'
  spark?: { date: string; value: number | null }[]
}

/** Which of an area's headline numbers is its key number on Today (the first unless listed). Time leads with focus. */
const KEY_KPI: Partial<Record<AreaSlug, number>> = { time: 1 }
/** The tracker behind each cell's trend when the area has no pinned one. */
const SPARK: Partial<Record<AreaSlug, string>> = { time: 'screen.work' }

const measureOf = (k: AreaKpi) => k.label.split(',')[0].replace(/ today$/, '')

/**
 * Today's Life pulse: the areas the user shows, then Time. Each number comes from the area's own headline
 * numbers (`AreaDef.kpis`, the ones its page and the Life hub show), so a cell never disagrees with its page.
 * Wealth reads spent today against a usual day and Mind says so when no mood is logged yet.
 */
export const loadPulse = cache(async (user: User): Promise<PulseTile[]> => {
  const today = localDate(new Date(), user.timezone)
  const picked = user.profile.areas
  const defs = AREA_LIST.filter((d) => d.category === null || !picked?.length || picked.includes(d.category))
  const [{ briefing: b }, kpis, sparks] = await Promise.all([
    loadTodayBriefing(user),
    Promise.all(defs.map((d) => loadAreaKpis(user, d.slug))),
    loadHubSparks(user, today, Object.fromEntries(defs.map((d) => [d.slug, SPARK[d.slug] ?? d.pinned[0]]))),
  ])
  const money = (v: number) => formatMoney(v, user.baseCurrency, { decimals: 0 })
  return defs.map((d, i): PulseTile => {
    const k = kpis[i][KEY_KPI[d.slug] ?? 0]
    const base = { slug: d.slug, title: d.title, color: d.color, spark: sparks[d.slug]?.points.slice(-7) }
    const brief: PeekRef = { type: 'brief', id: areaScope(d) }
    if (d.slug === 'wealth') {
      const { spentToday, usualDay } = b.money
      const diff = usualDay ? spentToday - usualDay : null
      return {
        ...base, measure: 'Spent', value: money(spentToday), peek: brief,
        sub: diff == null ? `${b.money.countToday} payment${b.money.countToday === 1 ? '' : 's'}` : `${money(Math.abs(diff))} ${diff <= 0 ? 'under' : 'over'} a usual day`,
        tone: usualDay && spentToday > usualDay * 1.5 ? 'bad' : undefined,
      }
    }
    if (d.slug === 'mind' && b.body.mood == null) return { ...base, measure: 'Mood', value: '–', sub: 'Not logged · tap to log', peek: k?.peek ?? brief, action: 'capture' }
    if (!k) return { ...base, measure: d.title, value: '–', sub: 'Nothing tracked yet', peek: brief }
    return { ...base, measure: measureOf(k), value: k.value, sub: k.sub, tone: k.tone, peek: k.peek ?? brief }
  })
})
