import { cn } from '../../cn'

const HEIGHT = { 3: 'h-[3px]', 4: 'h-1', 6: 'h-1.5', 8: 'h-2' }

/**
 * Progress bar. The fill is clipped, not scaled, so its rounded ends never distort; it grows once on mount.
 * `marker` draws the "usual by now" tick at `at` (same units as value).
 */
export function Bar({ value, max = 1, color = 'var(--mint)', size = 4, marker, label, className }: {
  value: number; max?: number; color?: string; size?: 3 | 4 | 6 | 8
  marker?: { at: number; label: string }; label?: string; className?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('relative w-full rounded-full bg-track', HEIGHT[size], className)}
    >
      <div className="bar-fill absolute inset-0 rounded-full" style={{ background: color, '--p': `${pct * 100}%` } as React.CSSProperties} />
      {marker && max > 0 ? (
        <span
          title={marker.label}
          aria-hidden
          className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-[1px] bg-ink-4"
          style={{ left: `${Math.max(0, Math.min(1, marker.at / max)) * 100}%` }}
        />
      ) : null}
    </div>
  )
}

/** Shares of a whole in one bar, 2px apart: screen-time groups, where today's XP is still open. */
export function SplitBar({ parts, className }: { parts: { value: number; color: string; label: string }[]; className?: string }) {
  const live = parts.filter((p) => p.value > 0)
  return (
    <div role="img" aria-label={live.map((p) => `${p.label} ${p.value}`).join(', ') || 'Nothing yet'} className={cn('flex h-1 gap-0.5 overflow-hidden rounded-full', className)}>
      {live.length ? live.map((p) => <i key={p.label} className="block h-full rounded-full" style={{ flex: p.value, background: p.color }} />) : <i className="block h-full flex-1 rounded-full bg-track" />}
    </div>
  )
}
