import type { TileSummary } from '@/domain/metric-tile'
import { deltaText, formatTileValue } from '@/domain/metric-tile'
import { cn } from '../../cn'
import { Sparkline } from '../charts'
import { PeekLink } from '../peek/peek-link'

/** `oura` → OURA, typed in by hand → YOU. Names, not logos: a tile is small. */
export function sourceTag(sources: string[]) {
  const s = sources.find((x) => x !== 'manual') ?? sources[0]
  if (!s) return null
  return s === 'manual' ? 'You' : s.split(/[-.:]/)[0]
}

/** What the line under the number says: a stale sync, a note, the change on usual, or the 7-day average. */
function subline(t: TileSummary, avg: string | null) {
  if (t.stale) return { text: `synced ${t.daysSince} days ago`, tone: 'warn' as const }
  if (t.note) return { text: t.note, tone: 'plain' as const }
  if (t.delta) return { text: deltaText(t.delta), tone: t.delta.tone }
  return avg ? { text: `avg ${avg}`, tone: 'plain' as const } : { text: t.daysSince ? `last ${t.daysSince} days ago` : '', tone: 'plain' as const }
}

const SUB_TONE = { good: 'text-good', bad: 'text-bad', warn: 'text-warn', neutral: 'text-ink-3', plain: 'text-ink-3' }

/**
 * One tracker as a tile: name, where it comes from, the latest number, a 28-day trend and one line of context.
 * The whole tile opens the metric's Peek. Every connector metric of an area gets one (`AllMetrics`).
 */
export function MetricTile({ t, color, className }: { t: TileSummary; color: string; className?: string }) {
  const tag = sourceTag(t.sources)
  const v = t.latest == null ? null : formatTileValue(t.latest, t.unit)
  const avg = t.avg7 == null ? null : (() => { const a = formatTileValue(t.avg7, t.unit); return a.unit ? `${a.text} ${a.unit}` : a.text })()
  const sub = subline(t, avg)
  return (
    <PeekLink
      to={{ type: 'metric', id: t.slug }}
      aria-label={`${t.name}: open details`}
      className={cn(
        'group flex min-h-[132px] min-w-0 flex-col rounded-md bg-surface-2 p-3 transition-[background-color,transform] duration-150 ease-out-quint hover:bg-surface-3 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
        className,
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-small font-semibold text-ink">{t.name}</span>
        {tag ? <span className="shrink-0 font-mono text-label uppercase text-ink-3">{tag}</span> : null}
      </span>
      <span className="num mt-1 flex items-baseline gap-1 text-title whitespace-nowrap text-ink">
        {v ? <>{v.text}{v.unit ? <span className="font-sans text-small font-medium text-ink-3">{v.unit}</span> : null}</> : <span className="text-ink-3">–</span>}
      </span>
      {/* Reserved even when there are too few days to draw, so a row of tiles keeps its height. */}
      <span className={cn('mt-auto block h-8 pt-1', t.stale && 'opacity-50 grayscale')}>
        <Sparkline data={t.spark} color={color} height={28} label={`${t.name}, last 28 days`} />
      </span>
      <span className={cn('block truncate pt-1 text-caption tabular-nums', SUB_TONE[sub.tone])}>{sub.text || ' '}</span>
    </PeekLink>
  )
}
