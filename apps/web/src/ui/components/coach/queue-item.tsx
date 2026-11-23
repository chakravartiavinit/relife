'use client'

import { useId, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '../../cn'
import type { PictureRef } from '../../picture'
import { Picture } from '../picture'
import { QUEUE_KIND } from './kinds'
import type { NeedsYouKind } from '@/domain/needs-you'

/**
 * One item of the Needs you queue, a calm line: its picture, the title, `Kind · line` under it, and a quick action at
 * the right while it is closed (Got it, Review draft). Tap the row and it opens to show the rest and the buttons;
 * nothing changes until one is pressed. `fixed` rows (To sort) have no fold: the body is always there, because
 * the next thing to do is on it. Presentational, so /dev/ui can draw every kind from fixtures.
 */
export function QueueItem({ kind, picture, line, title, label, children, actions, quick, aside, extra, busy, defaultOpen = false, fixed = false, className }: {
  kind: NeedsYouKind
  picture: PictureRef
  title: React.ReactNode
  /** What follows the kind name under the title (the first sentence, what it is about); one line, cut with an ellipsis. */
  line?: React.ReactNode
  /** When and where, at the top of the open body. */
  label?: React.ReactNode
  children?: React.ReactNode
  actions?: React.ReactNode
  /** The one button at the right of a closed row on a laptop (the open row has its own). */
  quick?: React.ReactNode
  /** Buttons for a fixed row: at the right of the title from 640px, under the body on a phone. */
  aside?: React.ReactNode
  /** Always mounted, open or closed: a dialog the quick action opens. */
  extra?: React.ReactNode
  busy?: boolean
  defaultOpen?: boolean
  fixed?: boolean
  className?: string
}) {
  const k = QUEUE_KIND[kind]
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const sub = <>{k.label}{line ? <> <span aria-hidden>·</span> {line}</> : null}</>

  if (fixed) {
    return (
      <article aria-busy={busy} data-kind={kind} className={cn('grid grid-cols-[40px_minmax(0,1fr)] gap-x-3.5 py-4 sm:grid-cols-[40px_minmax(0,1fr)_auto]', className)}>
        <Picture {...picture} size={40} />
        <div className="min-w-0">
          <h3 className="text-body font-medium text-ink text-pretty">{title}</h3>
          <p className="text-small text-ink-3">{sub}{label ? <> <span aria-hidden>·</span> {label}</> : null}</p>
          {children ? <div className="mt-2">{children}</div> : null}
          {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {aside ? <div className="col-start-2 mt-3 flex items-center gap-2 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:self-start">{aside}</div> : null}
        {extra}
      </article>
    )
  }

  return (
    <article aria-busy={busy} data-kind={kind} className={className}>
      <div
        className={cn(
          'relative -mx-2 grid min-h-16 items-center gap-x-3.5 rounded-md px-2 py-3 transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2',
          quick && !open ? 'grid-cols-[40px_minmax(0,1fr)_auto_16px] max-sm:grid-cols-[40px_minmax(0,1fr)_16px]' : 'grid-cols-[40px_minmax(0,1fr)_16px]',
        )}
      >
        <Picture {...picture} size={40} />
        <button
          type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}
          className="min-w-0 rounded-sm text-left after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-pill"
        >
          <span className="block text-body font-medium text-ink max-sm:line-clamp-2 sm:truncate">{title}</span>
          <span className="block text-small text-ink-3 max-sm:line-clamp-2 sm:truncate">{sub}</span>
        </button>
        {quick && !open ? <span className="relative z-10 max-sm:hidden">{quick}</span> : null}
        <ChevronRight aria-hidden strokeWidth={1.5} className={cn('size-4 text-ink-3 transition-transform duration-150 ease-out-quint motion-reduce:transition-none', open && 'rotate-90')} />
      </div>
      {extra}
      {open ? (
        <div id={bodyId} className="pt-1 pb-4 pl-[54px]">
          {label ? <p className="mb-1.5 text-caption text-ink-3">{label}</p> : null}
          {children}
          {actions ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </article>
  )
}

/** The row after its action: one line with a check, what happened and, where it can be undone, Undo. It leaves on the next refresh. */
export function ResolvedItem({ text, undo, className }: { text: React.ReactNode; undo?: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('flex min-h-16 items-center gap-3.5 py-3', className)}>
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-good/10 text-good-ink"><Check className="size-5" strokeWidth={2} /></span>
      <p className="min-w-0 flex-1 text-body font-medium text-ink-2 text-pretty">{text}</p>
      {undo}
    </div>
  )
}
