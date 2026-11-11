import { useId } from 'react'
import { cn } from '../../cn'

/**
 * Ring: a level, a week's adherence, a month's spend against the usual, sync health. Track `--track`, arc
 * `--ring-a` to `--ring-b`, centre `--ring-well`. The arc draws once on mount (reduced motion: filled).
 */
export function Ring({ value, max, size = 168, stroke = 8, label, center, gradient = true, color, className }: {
  value: number; max: number; size?: number; stroke?: number
  /** Full sentence for assistive tech: "Level 3, 248 of 400 XP". */
  label: string
  center?: React.ReactNode
  gradient?: boolean
  /** Solid arc colour (an area hue). Overrides the gradient. */
  color?: string
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const mid = size / 2
  return (
    <div role="img" aria-label={label} className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={id} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--ring-a)' }} />
            <stop offset="1" style={{ stopColor: 'var(--ring-b)' }} />
          </linearGradient>
        </defs>
        <circle cx={mid} cy={mid} r={r} strokeWidth={stroke} style={{ fill: 'var(--ring-well)', stroke: 'var(--track)' }} />
        {pct > 0 ? (
          <circle
            cx={mid} cy={mid} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
            transform={`rotate(-90 ${mid} ${mid})`}
            className="ring-arc"
            style={{ stroke: color ?? (gradient ? `url(#${id})` : 'var(--ring-a)'), '--len': c, '--off': c * (1 - pct) } as React.CSSProperties}
          />
        ) : null}
      </svg>
      {center ? <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div> : null}
    </div>
  )
}

export function RingSkeleton({ size = 168 }: { size?: number }) {
  return <div className="animate-pulse rounded-full bg-fill" style={{ width: size, height: size }} />
}
