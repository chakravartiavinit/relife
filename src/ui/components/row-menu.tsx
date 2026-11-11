'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '../cn'
import { EASE_OUT } from '@/ui/beui/lib/ease'

export type RowMenuItem = {
  label: string
  icon: LucideIcon
  onSelect: () => void
  /** Red, with a second tap to confirm ("Tap again to delete"). */
  danger?: boolean
}

/** One "⋯" button per list row instead of a row of icons: actions open in a small menu. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); setConfirming(null) }

  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); button.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const all = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? [])]
        const i = all.indexOf(document.activeElement as HTMLButtonElement)
        all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', key)
    wrap.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key) }
  }, [open])

  const item = 'flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-start text-[13px] transition-[background-color,color] duration-150 hover:bg-hover focus-visible:bg-hover focus-visible:outline-none'
  const safe = items.filter((i) => !i.danger)
  const danger = items.filter((i) => i.danger)

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={`Options for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="grid size-10 place-items-center rounded-sm text-ink-3 transition-[background-color,color,scale] duration-150 ease-out-quint hover:bg-hover hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-expanded:bg-hover aria-expanded:text-ink"
      >
        <MoreHorizontal className="size-[18px]" strokeWidth={1.75} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            aria-label={`${label} options`}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            style={{ transformOrigin: 'top right' }}
            className="absolute end-0 top-[calc(100%+4px)] z-30 w-52 rounded-lg bg-raised p-1 shadow-3"
          >
            {safe.map((i) => (
              <button key={i.label} type="button" role="menuitem" className={cn(item, 'text-ink')} onClick={() => { close(); i.onSelect() }}>
                <i.icon className="size-4 text-ink-3" strokeWidth={1.5} aria-hidden />{i.label}
              </button>
            ))}
            {danger.length && safe.length ? <div aria-hidden className="mx-2 my-1 h-px bg-line" /> : null}
            {danger.map((i) => (
              <button
                key={i.label} type="button" role="menuitem"
                className={cn(item, 'text-bad', confirming === i.label && 'bg-bad-bg font-medium')}
                onClick={() => (confirming === i.label ? (close(), i.onSelect()) : setConfirming(i.label))}
              >
                <i.icon className="size-4" strokeWidth={1.5} aria-hidden />{confirming === i.label ? `Tap again to ${i.label.toLowerCase()}` : i.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
