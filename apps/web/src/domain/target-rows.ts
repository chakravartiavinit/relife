import { addDays } from '@/core/time'
import type { AreaKpi } from '@/core/areas/types'
import { formatTileValue, type TileSummary, type TileTracker } from './metric-tile'
import type { PeekRef } from './peek'
import { hasTrend } from './series'

type Point = { date: string; value: number | null }

// The rows of an area's "Against your targets" table: one per headline number, one per pinned tracker and one per
// other tracker that has a target. Pure: the page loads the days, this works out the average, the bullet bar, the
// days on target and the trend, so every number can be tested.

export type TargetTracker = { tracker: TileTracker; days: Map<string, number>; tile: TileSummary }

export type TargetRow = {
  key: string
  name: string
  /** Where the row opens: its metric, or the area's summary for a number that has none. */
  peek: PeekRef
  /** The big number and its unit: a tracker's 28-day average, a headline number as the area computes it. */
  value: string
  unit: string | null
  /** Under the number: the target, or what the headline number counts. */
  caption: string
  /** Fill and target mark as 0..1 of the track; `meets` when the average is on the right side of the target. */
  bar: { fill: number; mark: number | null; meets: boolean; label: string } | null
  /** "9 of 25 nights". */
  onTarget: string | null
  /** Share of days on target (or of the whole for a ratio), 0..1: the order of the table. */
  share: number | null
  /** The last 28 days (only when there are enough points to draw) and one line about now. */
  trend: { points: Point[] | null; note: string | null } | null
}

/** More than this many rows fold away behind "N more". */
export const TARGET_ROWS_SHOWN = 8
/** The bar's track is this much longer than the larger of the target and the average, so the target mark sits inside it. */
const HEADROOM = 1.2

const noun = (t: TileTracker) => (t.slug.startsWith('sleep') ? 'nights' : /weight/.test(t.slug) ? 'weigh-ins' : 'days')
const withUnit = (v: number, unit: string | null) => { const f = formatTileValue(v, unit); return f.unit ? `${f.text} ${f.unit}` : f.text }

/** The last 28 days when there are enough to draw, and one line about now ("7.4h this week", "77.8 kg latest", "synced 4 days ago"). */
function trendOf(t: TileTracker, tile: TileSummary): TargetRow['trend'] {
  const points = hasTrend(tile.spark) ? tile.spark : null
  const note = tile.stale ? `synced ${tile.daysSince} days ago`
    : t.aggregate === 'last' ? (tile.latest == null ? null : `${withUnit(tile.latest, t.unit)} latest`)
      : tile.avg7 == null ? null : `${withUnit(tile.avg7, t.unit)} this week`
  return points || note ? { points, note } : null
}

function trackerRow({ tracker: t, days, tile }: TargetTracker, today: string, peek: PeekRef): TargetRow {
  const from = addDays(today, -27)
  const logged = [...days].filter(([d]) => d >= from && d <= today).sort((a, b) => a[0].localeCompare(b[0]))
  const avg = logged.length ? logged.reduce((s, [, v]) => s + v, 0) / logged.length : null
  const scale = t.kind === 'scale'
  const target = scale ? null : t.target
  const hit = target == null ? null : logged.filter(([, v]) => (t.direction === 'down' ? v <= target : v >= target)).length
  const meets = avg != null && target != null && (t.direction === 'down' ? avg <= target : avg >= target)
  const v = avg == null ? null : formatTileValue(avg, t.unit)

  let bar: TargetRow['bar'] = null
  if (avg != null && target != null) {
    const track = Math.max(target, avg) * HEADROOM
    bar = { fill: Math.min(1, avg / track), mark: target / track, meets, label: `${t.name} ${withUnit(avg, t.unit)} on average, target ${withUnit(target, t.unit)}` }
  } else if (avg != null && scale) {
    bar = { fill: Math.min(1, avg / 5), mark: null, meets: false, label: `${t.name} ${withUnit(avg, t.unit)} on average, out of 5` }
  }

  return {
    key: t.slug, name: t.name, peek,
    value: v?.text ?? '–', unit: v?.unit ?? null,
    caption: target != null ? `target ${withUnit(target, t.unit)}` : scale ? 'out of 5' : 'no target',
    bar,
    onTarget: hit == null || !logged.length ? null : `${hit} of ${logged.length} ${noun(t)}`,
    share: hit == null || !logged.length ? null : hit / logged.length,
    trend: trendOf(t, tile),
  }
}

/** A headline number as it is computed (a count, a total, a rate); `x` is its tracker, when it has one, for the trend. */
function kpiRow(k: AreaKpi, peek: PeekRef, x?: TargetTracker): TargetRow {
  const ratio = k.ratio ?? null
  // "2 medicines, last 60 days": what it counts under the number, over what time in the column beside the bar.
  const [what, ...over] = (k.sub ?? '').split(', ')
  return {
    key: `kpi:${k.label}`, name: k.label, peek, value: k.value, unit: null, caption: what,
    bar: ratio == null ? null : { fill: Math.max(0, Math.min(1, ratio)), mark: null, meets: false, label: `${k.label} ${k.value}` },
    onTarget: over.join(', ') || null, share: ratio, trend: x ? trendOf(x.tracker, x.tile) : null,
  }
}

/**
 * The table: the area's headline numbers in their order (one that is a tracker with a target becomes that tracker's row), then its
 * pinned trackers with data in the last 14 days, then any other such tracker with a target. Rows with a share
 * (days on target, a kept rate) come first, highest first; the rest keep their order after them.
 */
export function targetRows({ today, kpis, pinned, trackers, fallback }: {
  today: string; kpis: AreaKpi[]; pinned: string[]; trackers: TargetTracker[]; fallback: PeekRef
}): TargetRow[] {
  const bySlug = new Map(trackers.map((x) => [x.tracker.slug, x]))
  const seen = new Set<string>()
  const rows: TargetRow[] = []
  const add = (x: TargetTracker) => { seen.add(x.tracker.slug); rows.push(trackerRow(x, today, { type: 'metric', id: x.tracker.slug })) }

  for (const k of kpis) {
    const x = k.peek?.type === 'metric' ? bySlug.get(k.peek.id) : undefined
    if (x && x.tile.state !== 'none' && !seen.has(x.tracker.slug)) {
      // Against a target (or a 1–5 scale) the tracker's own row says more; without one the number is a count or a total, so it stays as the area computes it.
      if (x.tracker.target != null || x.tracker.kind === 'scale') add(x)
      else { seen.add(x.tracker.slug); rows.push(kpiRow(k, k.peek ?? fallback, x)) }
    } else if (!x || !seen.has(x.tracker.slug)) rows.push(kpiRow(k, k.peek ?? fallback))
  }
  for (const slug of pinned) {
    const x = bySlug.get(slug)
    if (x && x.tile.state === 'active' && !seen.has(slug)) add(x)
  }
  for (const x of [...trackers].sort((a, b) => a.tracker.name.localeCompare(b.tracker.name))) {
    if (x.tracker.target != null && x.tracker.kind !== 'scale' && x.tile.state === 'active' && !seen.has(x.tracker.slug)) add(x)
  }
  const ranked = rows.filter((r) => r.share != null).sort((a, b) => b.share! - a.share!)
  return [...ranked, ...rows.filter((r) => r.share == null)]
}
