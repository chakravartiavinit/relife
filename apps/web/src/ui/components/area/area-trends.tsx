import type { AreaDef } from '@/core/areas'
import { trackerDays, trackerFacts } from '@/core/metrics'
import { loadPatterns } from '@/core/patterns'
import { addDays } from '@/core/time'
import type { User } from '@/core/user'
import { orderTiles, summarizeTracker } from '@/domain/metric-tile'
import { fillDays } from '@/domain/series'
import { Card } from '../card'
import { PatternsCard } from '../patterns-card'
import { TrendsGrid, type TrendSeries } from './trends-grid'

/**
 * The Trends tab: every tracker of the area as a small multiple over 7, 28 or 90 days (same order as All metrics),
 * then the patterns whose signals belong to this area. Nothing here goes back to the server when the range changes.
 */
export async function AreaTrends({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  const from = addDays(today, -89)
  const [days, patterns] = await Promise.all([trackerDays(user, from, today, { category: def.category! }), loadPatterns(user)])
  const facts = await trackerFacts(user, from, today, days.filter((d) => d.days.size).map((d) => d.tracker.id))
  const byslug = new Map(days.map((d) => [d.tracker.slug, d]))
  const { shown, quiet } = orderTiles(days.map((d) => summarizeTracker(d.tracker, d.days, today, facts.get(d.tracker.id))), def.pinned)
  const series: TrendSeries[] = [...shown, ...quiet].map((t) => {
    const d = byslug.get(t.slug)!
    return {
      slug: t.slug, name: t.name, unit: t.unit, target: d.tracker.kind === 'scale' ? null : t.target,
      chart: d.tracker.aggregate === 'last' ? 'area' : 'bars', scale: d.tracker.kind === 'scale',
      points: fillDays(d.days, from, today),
    }
  })
  // Patterns of this area: its own changes, and links where either side is one of its signals.
  const mine = {
    signals: patterns.signals,
    changes: patterns.changes.filter((c) => c.signal.area === def.category),
    links: patterns.links.filter((l) => l.a.area === def.category || l.b.area === def.category),
  }
  return (
    <div className="flex flex-col gap-6">
      {series.length ? <TrendsGrid series={series} color={def.color} /> : <Card><p className="text-small text-ink-3">Nothing to chart yet. Numbers show up here as soon as they are logged or synced.</p></Card>}
      <PatternsCard patterns={mine} title={`Patterns in ${def.title}`} />
    </div>
  )
}
