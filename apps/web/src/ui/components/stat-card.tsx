import type { PeekRef } from '@/domain/peek'
import type { Status } from '@/domain/status-of'
import { cn } from '../cn'
import { Card } from './card'
import { PeekLink } from './peek/peek-link'
import { Picture } from './picture'
import type { PictureRef } from '../picture'
import { StatusWord } from './status-word'

/**
 * One thing worth a glance: a label with its area dot (or picture), a status word, one figure in Fraunces and one line
 * of context. With `peek` the whole card opens that Peek. Replaces the Life pulse tiles and the KPI strips.
 *
 * `figure` is a standalone number (`7.2 h`, `₹145`); a number in a row or column belongs in a `StatusRow` line. At most
 * one figure per card and one big number per screen.
 */
export function StatCard({ label, color, picture, status, figure, note, peek, className }: {
  label: React.ReactNode
  /** The area's colour for the dot before the label (`var(--cat-health)`). Ignored with a `picture`. */
  color?: string
  /** A 20px picture before the label instead of the dot (the tracker, area or merchant it is about). */
  picture?: PictureRef
  status?: Status
  figure: React.ReactNode
  /** One line: "Last night, a little under 7.5 h". */
  note?: React.ReactNode
  peek?: PeekRef
  className?: string
}) {
  return (
    <Card as="div" className={cn('flex min-w-0 flex-col gap-1.5', peek && 'transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2', className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-label text-ink-2">
          {picture ? <Picture {...picture} size={20} /> : <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color ?? 'var(--ink-3)' }} />}
          <span className="truncate">{label}</span>
        </span>
        {status ? <StatusWord status={status} /> : null}
      </div>
      <p className="font-display text-figure text-ink">{figure}</p>
      {note ? <p className="text-small text-ink-3">{note}</p> : null}
      {peek ? (
        <PeekLink
          to={peek}
          aria-label={`${typeof label === 'string' ? label : 'Details'}${status ? `, ${status.toLowerCase()}` : ''}: open details`}
          className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-pill"
        />
      ) : null}
    </Card>
  )
}
