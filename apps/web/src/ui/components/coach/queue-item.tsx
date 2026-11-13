import { Check } from 'lucide-react'
import { IconChip } from '../card'
import { cn } from '../../cn'
import { QUEUE_KIND } from './kinds'
import type { NeedsYouKind } from '@/domain/needs-you'

/**
 * One row of the Needs you queue: the kind's chip, a mono label (kind · when), the title, a body and a slot for the
 * actions. Presentational, so /dev/ui can draw every kind from fixtures.
 */
export function QueueItem({ kind, label, title, children, actions, busy, className }: {
  kind: NeedsYouKind
  /** What follows the kind name in the mono label: when, or what it is about. */
  label?: React.ReactNode
  title: React.ReactNode
  children?: React.ReactNode
  actions?: React.ReactNode
  busy?: boolean
  className?: string
}) {
  const k = QUEUE_KIND[kind]
  return (
    <article aria-busy={busy} data-kind={kind} className={cn('flex gap-3.5 px-5 py-5 sm:gap-4', className)}>
      <IconChip color={k.color} className="mt-px size-9 rounded-[12px] [&_svg]:size-[18px]"><k.icon strokeWidth={1.5} /></IconChip>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-label uppercase text-ink-3">
          <span className="text-ink-2">{k.label}</span>{label ? <> <span aria-hidden>·</span> {label}</> : null}
        </p>
        <h3 className="mt-1 text-heading font-semibold text-ink text-pretty">{title}</h3>
        {children ? <div className="mt-1.5">{children}</div> : null}
        {actions ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </article>
  )
}

/** The row after its action: one line with a check, what happened and, where it can be undone, Undo. It leaves on the next refresh. */
export function ResolvedItem({ text, undo, className }: { text: React.ReactNode; undo?: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center gap-3.5 px-5 py-4 sm:gap-4', className)}>
      <IconChip color="var(--good)" className="size-9 rounded-[12px] [&_svg]:size-[18px]"><Check strokeWidth={2} /></IconChip>
      <p className="min-w-0 flex-1 text-body font-medium text-ink-2 text-pretty">{text}</p>
      {undo}
    </div>
  )
}
