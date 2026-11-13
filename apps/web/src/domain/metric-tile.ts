import { addDays } from '@/core/time'
import { fillDays } from './series'

// One number per tracker for an area's All metrics grid: the latest value, the 7-day average, how it compares
// with the 4 weeks before, a 28-day sparkline and whether the tracker is still alive. Pure: `AllMetrics` loads the
// days and this summarises them, so every connector metric (HRV, readiness, chess rating...) gets a tile.

export type TileTracker = {
  slug: string; name: string; unit: string | null; target: number | null
  direction: 'up' | 'down'; aggregate: 'sum' | 'last'; kind: string
}

export type Tone = 'good' | 'bad' | 'neutral'

export type TileSummary = {
  slug: string
  name: string
  unit: string | null
  target: number | null
  kind: string
  /** Today's value, or for `last` trackers (weight, ratings) the most recent one logged. Null when there is none. */
  latest: number | null
  /** The day `latest` is from. */
  latestDate: string | null
  /** Average over the days logged in the last 7. */
  avg7: number | null
  /** Last 7 days against the 28 before them. */
  delta: { diff: number; pct: number; tone: Tone } | null
  /** 28 days ending today; days without a value are null (gaps). */
  spark: { date: string; value: number | null }[]
  /** Days with a value in the last 28. */
  daysLogged: number
  /** Whole days since the last value; null when there is none in the window. */
  daysSince: number | null
  /** `active`: a value in the last 14 days. `quiet`: older only. `none`: nothing in the window. */
  state: 'active' | 'quiet' | 'none'
  /** Where the values come from (`oura`, `manual`...). */
  sources: string[]
  /** True when every source is a sync and the newest value is 2+ days old. */
  stale: boolean
  /** The latest entry's note (Last.fm's top artist, Steam's top game). */
  note: string | null
}

/** The last 7 days against the 28 before: needs a few days on each side. */
const MIN_RECENT = 2
const MIN_BEFORE = 5
/** Under this relative change the tile shows no delta. */
const MIN_DELTA = 0.01
export const QUIET_AFTER_DAYS = 14

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length

export function summarizeTracker(
  t: TileTracker,
  days: Map<string, number>,
  today: string,
  extra: { sources?: string[]; note?: string | null } = {},
): TileSummary {
  const weekFrom = addDays(today, -6)
  const beforeFrom = addDays(today, -34)
  const recent: number[] = [], before: number[] = []
  let last: string | null = null
  for (const [d, v] of days) {
    if (d > today) continue
    if (!last || d > last) last = d
    if (d >= weekFrom) recent.push(v)
    else if (d >= beforeFrom) before.push(v)
  }
  const daysSince = last ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000) : null
  const today_ = days.get(today)
  const latest = t.aggregate === 'last' ? (last ? days.get(last)! : null) : (today_ ?? null)
  const latestDate = t.aggregate === 'last' ? last : today_ != null ? today : null

  let delta: TileSummary['delta'] = null
  if (recent.length >= MIN_RECENT && before.length >= MIN_BEFORE) {
    const r = mean(recent), u = mean(before)
    const diff = r - u
    const pct = u ? diff / Math.abs(u) : 0
    if (u && Math.abs(pct) >= MIN_DELTA) {
      // Better only means something where the tracker has a goal (or is a 1–5 scale), like Patterns.
      const directed = t.kind === 'scale' || t.target != null
      const tone: Tone = !directed ? 'neutral' : (diff > 0) === (t.direction === 'up') ? 'good' : 'bad'
      delta = { diff, pct, tone }
    }
  }
  const sources = extra.sources ?? []
  const state = daysSince == null ? 'none' : daysSince <= QUIET_AFTER_DAYS ? 'active' : 'quiet'
  return {
    slug: t.slug, name: t.name, unit: t.unit, target: t.target, kind: t.kind,
    latest, latestDate,
    avg7: recent.length ? mean(recent) : null,
    delta,
    spark: fillDays(days, addDays(today, -27), today),
    daysLogged: [...days.keys()].filter((d) => d >= addDays(today, -27) && d <= today).length,
    daysSince, state, sources,
    stale: !!sources.length && sources.every((s) => s !== 'manual') && (daysSince ?? 0) >= 2 && state !== 'none',
    note: extra.note ?? null,
  }
}

/** Typed in by hand only (no sync behind it). */
export const isManualOnly = (s: TileSummary) => s.sources.length > 0 && s.sources.every((x) => x === 'manual')

/**
 * The order of the grid: pinned trackers first (in the order given), then the rest that have data in the last 14
 * days (synced ones before typed-in, then the most logged, then by name), and the ones gone quiet apart. Trackers
 * with no data at all are left out: they only show in Plan → Trackers.
 */
export function orderTiles(tiles: TileSummary[], pinned: string[]): { shown: TileSummary[]; quiet: TileSummary[] } {
  const withData = tiles.filter((t) => t.state !== 'none')
  const pin = (t: TileSummary) => pinned.indexOf(t.slug)
  const byPin = withData.filter((t) => pin(t) >= 0 && t.state === 'active').sort((a, b) => pin(a) - pin(b))
  const rest = withData.filter((t) => !(pin(t) >= 0 && t.state === 'active'))
  const rank = (t: TileSummary) => [isManualOnly(t) ? 1 : 0, -t.daysLogged] as const
  const order = (a: TileSummary, b: TileSummary) => {
    const [a0, a1] = rank(a), [b0, b1] = rank(b)
    return a0 - b0 || a1 - b1 || a.name.localeCompare(b.name)
  }
  return {
    shown: [...byPin, ...rest.filter((t) => t.state === 'active').sort(order)],
    quiet: rest.filter((t) => t.state === 'quiet').sort(order),
  }
}

/** A tile's big number: hours and long minutes as `6h 10m`, others with the decimals their size needs. */
export function formatTileValue(v: number, unit: string | null): { text: string; unit: string | null } {
  const mins = unit === 'h' ? Math.round(v * 60) : unit === 'min' && Math.abs(v) >= 60 ? Math.round(v) : null
  if (mins != null) return { text: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`, unit: null }
  const digits = Math.abs(v) >= 100 ? 0 : 1
  return { text: v.toLocaleString('en-IN', { maximumFractionDigits: digits }), unit }
}

/** "▲ 12% vs usual": this week's average against the 4 weeks before. */
export function deltaText(d: NonNullable<TileSummary['delta']>) {
  return `${d.diff > 0 ? '▲' : '▼'} ${Math.round(Math.abs(d.pct) * 100)}% vs usual`
}
