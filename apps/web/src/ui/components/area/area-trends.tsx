import { connectors } from '@/connectors'
import type { AreaDef } from '@/core/areas'
import { trackerDays, trackerFacts } from '@/core/metrics'
import { addDays } from '@/core/time'
import type { User } from '@/core/user'
import { orderTiles, summarizeTracker } from '@/domain/metric-tile'
import { fillDays } from '@/domain/series'
import { trackerLine, trackerStatus } from '@/domain/tracker-row'
import { Card, CardHeader } from '../card'
import { CardLink } from './card-link'
import { Connection } from '../connection'
import { areaPatterns, explaining, patternKey } from './area-patterns'
import { TrendsExplorer, type TrendSeries } from './trends-explorer'
import { joinNames } from '@/domain/life-status'

const SHOWN_PATTERNS = 3

/** Where the numbers come from, as names: "Oura, WHOOP, Apple and you". */
function sourceNames(sources: Set<string>) {
  const OWN: Record<string, string> = { sleep: 'Sleep Focus', apple: 'Apple Health', telegram: 'Telegram', shortcut: 'your phone' }
  const name = (s: string) => { const id = s.split(/[-.:]/)[0]; return connectors.find((c) => c.id === id)?.name ?? OWN[id] ?? id.replace(/^./, (c) => c.toUpperCase()) }
  const names = [...sources].filter((s) => s !== 'manual').map(name)
  const unique = [...new Set(names)]
  if (sources.has('manual')) unique.push('you')
  return joinNames(unique)
}

/**
 * The Trends tab: the tracker list picks the one chart (same order as the Overview rows, pinned first), then "Patterns in
 * <area>": the connections whose signals belong to this area, the top three. The charts never go back to the server.
 */
export async function AreaTrends({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  const from = addDays(today, -89)
  const [days, patterns] = await Promise.all([trackerDays(user, from, today, { category: def.category! }), areaPatterns(user, def)])
  const facts = await trackerFacts(user, from, today, days.filter((d) => d.days.size).map((d) => d.tracker.id))
  const byslug = new Map(days.map((d) => [d.tracker.slug, d]))
  const tiles = days.map((d) => summarizeTracker(d.tracker, d.days, today, facts.get(d.tracker.id)))
  const { shown, quiet } = orderTiles(tiles, def.pinned)
  const series: TrendSeries[] = [...shown, ...quiet].map((tile) => {
    const d = byslug.get(tile.slug)!
    const p = explaining(patterns, `tracker:${tile.slug}`)
    return {
      tracker: d.tracker, picture: { of: 'tracker', name: tile.name, area: def.category ?? undefined }, status: trackerStatus(d.tracker, tile), line: trackerLine(d.tracker, tile),
      peek: { type: 'metric', id: tile.slug }, points: fillDays(d.days, from, today), connection: p ? <Connection {...p} /> : null,
    }
  })
  const sources = new Set(tiles.flatMap((t) => t.sources))
  const intro = `${series.length} ${series.length === 1 ? 'tracker' : 'trackers'}${sources.size ? ` from ${sourceNames(sources)}` : ''}`
  const top = patterns.slice(0, SHOWN_PATTERNS)
  return (
    <div className="flex flex-col gap-6">
      {series.length ? <TrendsExplorer series={series} color={def.color} intro={intro} /> : <Card><p className="text-small text-ink-3">Nothing to chart yet. Numbers show up here as soon as they are logged or synced.</p></Card>}
      <Card aria-labelledby="patterns-heading">
        <CardHeader title={<span id="patterns-heading">Patterns in {def.title}</span>} description="Numbers from other areas that move with yours. Patterns, not proof." action={<CardLink href="/coach/patterns">More in Coach</CardLink>} />
        {top.length ? (
          <div className="grid grid-cols-1 gap-4 grid-lg:grid-cols-3">
            {top.map((p) => <div key={patternKey(p)} className="rounded-md bg-surface-2 p-4"><Connection {...p} today={today} /></div>)}
          </div>
        ) : (
          <p className="text-small text-ink-3">Nothing stands out yet. Keep logging; links show up once the same thing happens on enough days.</p>
        )}
      </Card>
    </div>
  )
}
