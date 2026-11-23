import { cn } from '../../cn'

/**
 * A bullet bar: a number against a target on one thin track. The fill is neutral (the area colour once the average is
 * on the right side of the target), and the target is an ink tick on the track. Without a `mark` it is a plain share.
 * The aria label carries the numbers, so the bar itself is drawn for the eye only.
 */
export function Bullet({ fill, mark, color = 'var(--ink-2)', label, index = 0, className }: {
  fill: number; mark?: number | null; color?: string; label: string; index?: number; className?: string
}) {
  return (
    <div role="img" aria-label={label} className={cn('relative h-4 w-full', className)}>
      <span className="absolute inset-x-0 top-[5px] h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
        <span className="reveal-fill absolute inset-0 rounded-full" style={{ background: color, '--fill': `${Math.max(0, Math.min(1, fill)) * 100}%`, '--i': index } as React.CSSProperties} />
      </span>
      {mark == null ? null : <span className="absolute top-0 h-4 w-0.5 rounded-xs bg-ink" style={{ left: `calc(${mark * 100}% - 1px)` }} />}
    </div>
  )
}
