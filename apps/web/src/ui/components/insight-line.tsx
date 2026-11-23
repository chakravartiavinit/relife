'use client'

import { useId, useState } from 'react'
import type { PeekRef } from '@/domain/peek'
import { cn } from '../cn'
import { buttonLinkClass } from './button'
import { PeekLink } from './peek/peek-link'

/**
 * A screen's one answer as a plain sentence, with a Why? that opens the facts behind it. `peek` opens a Peek (the brief's
 * facts, a metric); `why` unfolds a short note under the line instead. With neither there is no Why?.
 */
export function InsightLine({ children, why, peek, className }: { children: React.ReactNode; why?: React.ReactNode; peek?: PeekRef; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className={className}>
      <p className="text-body text-ink-2">
        {children}
        {peek ? <> <PeekLink to={peek} className={buttonLinkClass()}>Why?</PeekLink></> : null}
        {!peek && why ? <> <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className={buttonLinkClass()}>Why?</button></> : null}
      </p>
      {!peek && why && open ? (
        <div id={id} className={cn('mt-3 rounded-md bg-surface-2 px-4 py-3')}>
          <p className="text-label text-ink-2">Why this line</p>
          <div className="mt-1 text-small text-ink-3">{why}</div>
        </div>
      ) : null}
    </div>
  )
}
