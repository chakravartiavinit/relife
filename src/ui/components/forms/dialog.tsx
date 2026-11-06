'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '../button'

/**
 * Native <dialog> (focus trap, Esc, inert background for free).
 * Enter: opacity + translateY 8px, 200ms. Exit: same path, 150ms (softer).
 */
export function Dialog({ open, onClose, title, description, children, width = 'max-w-[520px]' }: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  width?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click on the dialog element itself (not its content) is a backdrop click.
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={[
        'm-auto w-[calc(100%-2rem)] bg-transparent p-0 text-ink', width,
        'translate-y-2 opacity-0 transition-[opacity,translate,display,overlay] transition-discrete duration-150 ease-out',
        'open:translate-y-0 open:opacity-100 open:duration-200 open:ease-out-quint',
        'starting:open:translate-y-2 starting:open:opacity-0',
        'backdrop:bg-transparent backdrop:transition-[background-color,display,overlay] backdrop:transition-discrete backdrop:duration-200',
        'open:backdrop:bg-[oklch(0.178_0_0/0.32)] starting:open:backdrop:bg-transparent',
      ].join(' ')}
    >
      <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain rounded-xl bg-surface shadow-3">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-surface px-6 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">{title}</h2>
            {description ? <p className="mt-1 text-[13px] text-ink-3">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose} className="-mt-1 -mr-2">
            <X className="size-[18px]" strokeWidth={1.5} />
          </Button>
        </header>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </dialog>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md bg-bad/8 px-3 py-2 text-[13px] text-bad">
      {message}
    </p>
  )
}
