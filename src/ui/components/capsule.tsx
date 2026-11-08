import { cn } from '../cn'

/**
 * Capsule progress: the app's signature indicator. A pill track with an ink hairline,
 * filled from the left. Fill animates with clip-path so the rounded ends never distort.
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
      className={cn('relative w-full overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]', h, className)}
    >
      <div
        className="reveal-fill absolute inset-0 rounded-full"
        style={{ background: color, '--fill': `${pct * 100}%` } as React.CSSProperties}
      />
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
