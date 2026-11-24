import { cn } from '../cn'

/**
 * Capsule progress for plain progress (a day, a share, a tracker): a flat pill track filled from the left.
 * Fill animates with clip-path so the rounded ends never distort. XP, level and goal progress use `LevelBar`.
 */
export function Capsule({
  value, max = 1, color = 'var(--pill)', size = 'md', label, className,
}: {
  value: number
  max?: number
  color?: string
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const h = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' }[size]
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('relative w-full overflow-hidden rounded-full bg-ink/[0.08]', h, className)}
    >
      <div
        className="reveal-fill absolute inset-0 rounded-full"
        style={{ background: color, '--fill': `${pct * 100}%` } as React.CSSProperties}
      />
    </div>
  )
}

/**
 * The segmented stat bar of the Character sheet: XP, area level and goal progress. Same props and ARIA as `Capsule`.
 * `segments` equal cells (default 10) with 2px gaps; whole cells fill in `color`, the last one by its fraction.
 */
export function LevelBar({
  value, max = 1, color = 'var(--pill)', size = 'md', segments = 10, label, className,
}: {
  value: number
  max?: number
  color?: string
  size?: 'sm' | 'md' | 'lg'
  segments?: number
  label?: string
  className?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const filled = pct * segments
  const h = { sm: 'h-1.5', md: 'h-2', lg: 'h-2.5' }[size]
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('flex w-full gap-0.5', h, className)}
    >
      {Array.from({ length: segments }, (_, i) => {
        const part = Math.max(0, Math.min(1, filled - i))
        return (
          <span key={i} className="relative flex-1 overflow-hidden rounded-xs bg-ink/[0.08]">
            {part > 0 ? <span className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out-quint" style={{ width: `${part * 100}%`, background: color }} /> : null}
          </span>
        )
      })}
    </div>
  )
}

/** Vertical capsule ring used for a category's day completion in the sky header. */
export function CapsuleGauge({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="relative h-14 w-6 overflow-hidden rounded-full bg-white/70 shadow-[inset_0_0_0_1.5px_oklch(0.178_0_0/0.85)] dark:bg-white/10 dark:shadow-[inset_0_0_0_1.5px_oklch(1_0_0/0.5)]"
      >
        <div
          className="absolute inset-0 transition-[clip-path] duration-300 ease-out-quint"
          style={{ background: color, clipPath: `inset(${(1 - pct) * 100}% 0 0 0)` }}
        />
      </div>
    </div>
  )
}

/** The plain 4px bar for a count toward a total (done of today's plan): a flat track and one fill, no segments. */
export function Bar({ value, max = 1, color = 'var(--ink-2)', label, className }: { value: number; max?: number; color?: string; label?: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} className={cn('h-1 overflow-hidden rounded-full bg-ink/[0.08]', className)}>
      <div className="h-full rounded-full transition-[width] duration-300 ease-out-quint" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  )
}
