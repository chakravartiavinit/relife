'use client'

import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { BottomSheet } from '@/ui/beui/motion/bottom-sheet'
import { EASE_IN_OUT, EASE_OUT_STRONG } from '@/ui/beui/lib/ease'
import { focusablesIn } from '@/ui/beui/lib/hooks/use-focus-trap'
import { cn } from '../cn'
import { Button } from './button'

export type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Desktop only: a mark in front of the title (Peek's icon chip). A phone sheet shows the title alone. */
  icon?: React.ReactNode
  /**
   * Desktop only. Default (false) is a non-modal panel: no scrim, no scroll lock, the page stays clickable so
   * another number can swap the content (Peek). True dims the page and holds focus inside (a full-attention task).
   * On a phone a sheet is always modal.
   */
  modal?: boolean
  /** Phone detents, as fractions of the viewport height. The first is where it opens. */
  snapPoints?: (number | 'auto')[]
  className?: string
  children: React.ReactNode
}

const QUERY = '(min-width: 1024px)'
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}
/** True from `lg` up. False on the server, so the first paint of a closed sheet is the phone one (nothing is drawn). */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}

/**
 * One sheet for Peek, Capture on a phone and any "look closer" surface.
 * Phone: the beUI bottom sheet (half and full detents, drag down to close, focus trap, scroll lock).
 * Desktop: a 440px panel on the right, below the top bar (`--sheet-top`), Esc closes, focus moves in and returns
 * to the trigger on close. Non-modal by default; see `modal`.
 */
export function Sheet({ open, onOpenChange, title, description, icon, modal = false, snapPoints = [0.5, 0.92], className, children }: SheetProps) {
  const desktop = useIsDesktop()
  if (!desktop) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title={title} description={description} snapPoints={snapPoints} className={className}>
        {children}
      </BottomSheet>
    )
  }
  return (
    <AnimatePresence>
      {open ? <Panel key="panel" onOpenChange={onOpenChange} title={title} description={description} icon={icon} modal={modal} className={className}>{children}</Panel> : null}
    </AnimatePresence>
  )
}

function Panel({ onOpenChange, title, description, icon, modal, className, children }: Omit<SheetProps, 'open' | 'snapPoints'> & { modal: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const reduce = useReducedMotion()
  const uid = useId()
  const close = () => onOpenChange(false)
  const closeRef = useRef(close)
  closeRef.current = close

  // Focus moves in on open and comes back to whatever held it on close. A modal panel also uses the native
  // top layer (showModal), which traps Tab and makes the page inert.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (modal && !el.open) el.showModal()
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? focusablesIn(el).find((x) => !x.hasAttribute('data-sheet-close')) ?? el
    first.focus({ preventScroll: true })
    return () => {
      if (from?.isConnected && (el.contains(document.activeElement) || document.activeElement === document.body)) from.focus({ preventScroll: true })
    }
  }, [modal])

  // A non-modal dialog gets no native Esc, so listen for it. Something inside that already handled Esc keeps it.
  useEffect(() => {
    if (modal) return
    // A modal dialog opened from inside (an edit form) takes that Esc for itself.
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog:modal')) closeRef.current() }
    document.addEventListener('keydown', on)
    return () => document.removeEventListener('keydown', on)
  }, [modal])

  return (
    <motion.dialog
      ref={ref}
      open={!modal}
      aria-labelledby={`${uid}-title`}
      aria-describedby={description ? `${uid}-desc` : undefined}
      tabIndex={-1}
      onCancel={(e) => { e.preventDefault(); close() }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 32 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0, transition: { duration: 0.32, ease: EASE_OUT_STRONG } }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 32, transition: { duration: 0.2, ease: EASE_IN_OUT } }}
      className={cn(
        'fixed top-[var(--sheet-top)] right-3 left-auto m-0 flex h-[calc(100dvh-var(--sheet-top)-12px)] max-h-none w-[440px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border-0 bg-surface p-0 text-ink shadow-3 outline-none z-40',
        'backdrop:bg-scrim',
        className,
      )}
    >
      <header className="flex items-start gap-3 p-5 pb-3">
        {icon}
        <div className="min-w-0 flex-1">
          <h2 id={`${uid}-title`} className="text-heading text-ink">{title}</h2>
          {description ? <p id={`${uid}-desc`} className="mt-0.5 text-small text-ink-3">{description}</p> : null}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" data-sheet-close onClick={close}><X className="size-4" strokeWidth={1.5} /></Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
    </motion.dialog>
  )
}
