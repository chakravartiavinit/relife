import { AREAS } from '@/core/areas'
import { hmSeconds } from '@/core/areas/time'
import type { ActivityKind } from '@/domain/activity'
import { chartShade } from '../../tokens'
import { cn } from '../../cn'

/**
 * One stacked bar for a week of laptop time by kind: the biggest kind leads in Time's colour, the next two take the
 * neutral ramp, the rest the lightest. The same bar as a share of a whole anywhere else; the names live in the label.
 */
export function ShareBar({ kinds, className }: { kinds: { kind: ActivityKind; seconds: number }[]; className?: string }) {
  return (
    <div
      role="img" aria-label={`Laptop time by kind, last 7 days: ${kinds.map((k) => `${k.kind} ${hmSeconds(k.seconds)}`).join(', ')}`}
      className={cn('flex h-1.5 gap-0.5 overflow-hidden rounded-full', className)}
    >
      {kinds.map((k, i) => <span key={k.kind} style={{ flexGrow: k.seconds, background: chartShade(i + 1, AREAS.time.color, i > 3) }} className="min-w-1 first:rounded-s-full last:rounded-e-full" />)}
    </div>
  )
}
