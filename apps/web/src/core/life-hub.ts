import { cache } from 'react'
import { CATEGORIES } from '@/db/schema'
import { AREA_LIST, AREAS, areaScope, loadAreaKpis, type AreaDef } from '@/core/areas'
import { hmSeconds, loadTime } from '@/core/areas/time'
import { areaStatus, changesOf, crossAreaConnections, lifeOpening } from '@/domain/life-status'
import type { ActivityKind } from '@/domain/activity'
import type { Status } from '@/domain/status-of'
import { loadAreaLevels, loadHubBriefs, loadLifeWeek } from './life-week'
import { patternsFor } from './patterns'
import { localDate } from './time'
import type { User } from './user'

// Everything the Life hub says, in one read per request: each area's word and one line, its level, Time's share of the
// week, the week's balance and the connections that cross areas. The page's head, the area list and the rail share it.

/** Every category once, so the cached week is shared by the page and the Today pulse. */
const ALL_AREAS = [...CATEGORIES]

export type HubRow = {
  def: AreaDef
  status: Status
  /** The week's biggest change in this area, else its brief, else what it is about. */
  line: string
  level?: { level: number; progress: number }
}

/** Areas the user shows (all when they have not picked), always in the same order. */
const shown = (areas: User['profile']['areas']) => AREA_LIST.filter((d) => d.category && (!areas?.length || areas.includes(d.category)))

export const loadLifeHub = cache(async (user: User) => {
  const today = localDate(new Date(), user.timezone)
  const defs = shown(user.profile.areas)
  const [briefs, levels, week, patterns, kpis, time] = await Promise.all([
    loadHubBriefs(user), loadAreaLevels(user), loadLifeWeek(user, ALL_AREAS), patternsFor(user),
    Promise.all([...defs, AREAS.time].map((d) => loadAreaKpis(user, d.slug))), loadTime(user, today),
  ])

  const rows = defs.map((def, i): HubRow => {
    const area = def.category!
    const change = week.changes[area]
    const brief = briefs.get(areaScope(def))?.text
    return {
      def, level: levels.find((l) => l.area === area),
      status: areaStatus({ changes: changesOf(patterns.changes, area), tones: kpis[i].map((k) => k.tone), hasData: kpis[i].length > 0 }),
      line: change?.text ?? brief ?? (kpis[i].length ? def.description : 'Nothing tracked yet'),
    }
  })

  // Time is not an area: no level, a share bar of the week's laptop time, and its word from the changes in its trackers.
  const kinds: { kind: ActivityKind; seconds: number }[] = time.s.byKind
  const total = kinds.reduce((a, k) => a + k.seconds, 0)
  const top = kinds[0]
  const timeRow = {
    def: AREAS.time, kinds,
    status: areaStatus({ changes: changesOf(patterns.changes, 'time'), tones: kpis[defs.length].map((k) => k.tone), hasData: total > 0 }),
    line: top ? `${top.kind[0].toUpperCase()}${top.kind.slice(1)} leads: ${hmSeconds(top.seconds)} of ${hmSeconds(total)} on this Mac` : 'Nothing recorded yet',
  }

  return {
    today, rows, timeRow, week, patterns, brief: briefs.get('today')?.text,
    opening: lifeOpening([...rows, timeRow].map((r) => ({ title: r.def.title, status: r.status }))),
    connections: crossAreaConnections(patterns, 2),
  }
})
