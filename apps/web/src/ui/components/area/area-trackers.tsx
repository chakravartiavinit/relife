import { areaScope, loadAreaKpis, type AreaDef } from '@/core/areas'
import { loadAreaTrackers } from '@/core/areas/trackers'
import type { User } from '@/core/user'
import { orderTiles } from '@/domain/metric-tile'
import type { PeekRef } from '@/domain/peek'
import { statusOf, type Status } from '@/domain/status-of'
import { needsLookFirst, trackerLine, trackerStatus } from '@/domain/tracker-row'
import type { PictureRef } from '../../picture'
import { Card, CardHeader } from '../card'
import { CardLink } from './card-link'
import { Fold } from '../fold'
import { StatusRow } from '../status-row'

/** More than this many rows fold behind "N more". */
const SHOWN = 6

type Row = { key: string; name: string; line: string; status: Status; picture: PictureRef; peek: PeekRef }

/** The rows from the area's trackers, plus any headline number that is not one of them (medicines kept, people in touch). */
export async function areaTrackerRows(user: User, def: AreaDef, today: string): Promise<Row[]> {
  const [trackers, kpis] = await Promise.all([loadAreaTrackers(user, def.category!, today), loadAreaKpis(user, def.slug)])
  const bySlug = new Map(trackers.map((x) => [x.tracker.slug, x]))
  const { shown, quiet } = orderTiles(trackers.map((x) => x.tile), def.pinned)
  const rows: Row[] = [...shown, ...quiet].map((tile) => {
    const { tracker } = bySlug.get(tile.slug)!
    return { key: tile.slug, name: tile.name, line: trackerLine(tracker, tile), status: trackerStatus(tracker, tile), picture: { of: 'tracker', name: tile.name, area: def.category ?? undefined }, peek: { type: 'metric', id: tile.slug } }
  })
  const fallback: PeekRef = { type: 'brief', id: areaScope(def) }
  const own = kpis.filter((k) => !(k.peek?.type === 'metric' && bySlug.has(k.peek.id)))
  const extra: Row[] = own.map((k) => ({
    key: `kpi:${k.label}`, name: k.label, line: [k.value, k.sub].filter(Boolean).join(', '),
    status: k.ratio == null ? 'Steady' : statusOf({ from: 'target', value: k.ratio, target: 0.8, direction: 'up' }).word,
    picture: { of: 'tracker', name: k.label, area: def.category ?? undefined }, peek: k.peek ?? fallback,
  }))
  return needsLookFirst([...extra, ...rows])
}

/**
 * "Against your targets": every tracker of the area as a status row with its picture, the ones that need a look first. The
 * figures are one tap away in each row's Peek and the charts on Trends; the rows past the first six fold.
 */
export function TrackerRows({ rows, trendsHref }: { rows: Row[]; trendsHref?: string }) {
  const shown = rows.slice(0, SHOWN), rest = rows.slice(SHOWN)
  const row = (r: Row) => <StatusRow key={r.key} picture={r.picture} name={r.name} line={r.line} status={r.status} peek={r.peek} />
  return (
    <Card aria-labelledby="trackers-heading">
      <CardHeader title={<span id="trackers-heading">Against your targets</span>} description="This week, what needs you first" action={trendsHref ? <CardLink href={trendsHref}>Trends</CardLink> : undefined} />
      {rows.length ? (
        <div>
          {shown.map(row)}
          {rest.length ? (
            <Fold title={`${rest.length} more`} summary={rest.map((r) => r.name).join(', ')} className="mt-1">
              <div>{rest.map(row)}</div>
            </Fold>
          ) : null}
        </div>
      ) : <p className="text-small text-ink-3">Nothing to compare yet. Numbers show up here as soon as they are logged or synced.</p>}
    </Card>
  )
}

export async function AreaTrackers({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  const rows = await areaTrackerRows(user, def, today)
  return <TrackerRows rows={rows} trendsHref={def.tabs.some((t) => t.segment === 'trends') ? `/${def.slug}/trends` : undefined} />
}
