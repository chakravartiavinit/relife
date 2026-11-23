import { formatTileValue, type TileSummary, type TileTracker } from './metric-tile'
import { statusOf, type Status } from './status-of'

// One tracker as a calm list row: a status word and one plain line. The figures stay in the metric's Peek. Pure.

export type TrackerRow = { slug: string; name: string; status: Status; line: string }

const withUnit = (v: number, unit: string | null) => { const f = formatTileValue(v, unit); return f.unit ? `${f.text} ${f.unit}` : f.text }

/** "a night" for sleep, "a day" for everything else that adds up over a day. */
const per = (t: TileTracker) => (t.slug.startsWith('sleep') ? 'a night' : 'a day')

/** The status of a tracker: its week against its target where it has one, else this week against usual; Quiet when nothing came in for 14 days. */
export function trackerStatus(t: TileTracker, tile: TileSummary): Status {
  if (tile.state !== 'active') return 'Quiet'
  const value = t.aggregate === 'last' ? tile.latest : tile.avg7 ?? tile.latest
  if (t.target != null && t.kind !== 'scale' && value != null) return statusOf({ from: 'target', value, target: t.target, direction: t.direction }).word
  return statusOf({ from: 'tracker', tile }).word
}

/** "6.8 h a night this week, target 7.5 h", "77.8 kg, target 72 kg", "3.5 a day, down 15% on usual", "No data in 28 days". */
export function trackerLine(t: TileTracker, tile: TileSummary): string {
  if (tile.state === 'none') return 'No data in 28 days'
  if (tile.state === 'quiet') return `Last seen ${tile.daysSince} days ago`
  if (tile.stale) return `Synced ${tile.daysSince} days ago`
  const last = t.aggregate === 'last'
  const value = last ? tile.latest : tile.avg7 ?? tile.latest
  if (value == null) return 'Nothing this week'
  const head = last ? `${withUnit(value, t.unit)}${t.slug.startsWith('sleep') ? ' last night' : ''}` : `${withUnit(value, t.unit)} ${per(t)}`
  const tail = t.target != null && t.kind !== 'scale' ? `target ${withUnit(t.target, t.unit)}`
    : tile.delta ? `${tile.delta.diff > 0 ? 'up' : 'down'} ${Math.round(Math.abs(tile.delta.pct) * 100)}% on usual` : 'like usual'
  return `${head}${last ? '' : ' this week'}, ${tail}`
}

/** Needs a look first: Behind, Slipping, then the rest, Quiet last; equal words keep the area's own order. */
const RANK: Record<Status, number> = { Behind: 0, Slipping: 1, Steady: 2, 'On track': 2, Ahead: 2, Quiet: 3 }
export const needsLookFirst = <T extends { status: Status }>(rows: T[]): T[] => rows.map((r, i) => [r, i] as const).sort((a, b) => RANK[a[0].status] - RANK[b[0].status] || a[1] - b[1]).map(([r]) => r)

type Pt = { date: string; value: number | null }

/**
 * What a lead chart is drawn against and says under its title: the target when the tracker has one (days on target), else
 * its own average over the days shown as the usual line. `noun` is what a day is called ("nights" for sleep).
 */
export function leadSummary(t: TileTracker, points: Pt[]): { reference: { value: number; label: string } | null; line: string } {
  const real = points.map((p) => p.value).filter((v): v is number => v != null)
  if (!real.length) return { reference: null, line: 'No values in this range' }
  const avg = real.reduce((s, v) => s + v, 0) / real.length
  const noun = t.slug.startsWith('sleep') ? 'nights' : 'days'
  const f = (v: number) => withUnit(v, t.unit)
  if (t.target != null && t.kind !== 'scale') {
    const hit = real.filter((v) => (t.direction === 'down' ? v <= t.target! : v >= t.target!)).length
    return { reference: { value: t.target, label: 'Target' }, line: `On target ${hit} of ${real.length} ${noun} · ${f(avg)} on average` }
  }
  return { reference: { value: avg, label: 'Usual' }, line: `${f(avg)} on average over ${real.length} ${noun}` }
}
