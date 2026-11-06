'use client'

import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ArrowUpRight, Plus, Search, Sparkles } from 'lucide-react'
import { quickLog } from '@/app/actions'
import { NAV, SYSTEM_NAV } from './nav'
import { announceXp, useToast } from './toast'

/**
 * ⌘K: log anything, jump anywhere, ask your data.
 * Typing "water 250" shows a Log row first; Enter commits it.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()
  const toast = useToast()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('relife:command', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('relife:command', onOpen) }
  }, [])

  const close = () => { setOpen(false); setValue('') }
  const looksLikeLog = /\d/.test(value)
  const pages = [...NAV.flatMap((g) => g.items), ...SYSTEM_NAV].flatMap((n) => [n, ...(n.children ?? [])])

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]">
          <motion.div
            className="absolute inset-0 bg-[oklch(0.178_0_0/0.28)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            onClick={close}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="relative w-full max-w-[560px]"
          >
            <Command
              label="Command menu"
              loop
              className="overflow-hidden rounded-xl bg-surface shadow-3"
              onKeyDown={(e) => { if (e.key === 'Escape') close() }}
            >
              <div className="flex items-center gap-3 border-b border-divider px-4">
                <Search className="size-[18px] shrink-0 text-ink-3" strokeWidth={1.5} />
                <Command.Input
                  autoFocus
                  value={value}
                  onValueChange={setValue}
                  placeholder="Log “water 250”, jump to a page, or ask…"
                  className="h-13 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
                />
                <kbd className="rounded-xs bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-3">esc</kbd>
              </div>
              <Command.List className="max-h-[360px] overflow-y-auto overscroll-contain p-2">
                <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-3">No matches.</Command.Empty>
                {value.trim() ? (
                  <Command.Group heading="Actions" className={groupClass}>
                    {looksLikeLog ? (
                      <Command.Item
                        value={`log ${value}`}
                        disabled={pending}
                        onSelect={() => start(async () => {
                          const r = await quickLog(value)
                          announceXp(toast, r.news)
                          toast(r.message, r.ok ? 'good' : 'bad')
                          if (r.ok) close()
                        })}
                        className={itemClass}
                      >
                        <Plus className="size-4 text-ink-3" strokeWidth={1.5} />
                        <span className="flex-1">Log <span className="font-medium text-ink">{value}</span></span>
                        <kbd className={kbdClass}>↵</kbd>
                      </Command.Item>
                    ) : null}
                    <Command.Item
                      value={`ask ${value}`}
                      onSelect={() => { router.push(`/insights?ask=${encodeURIComponent(value)}`); close() }}
                      className={itemClass}
                    >
                      <Sparkles className="size-4 text-ink-3" strokeWidth={1.5} />
                      <span className="flex-1">Ask: <span className="text-ink">{value}</span></span>
                    </Command.Item>
                  </Command.Group>
                ) : null}
                <Command.Group heading="Go to" className={groupClass}>
                  {pages.map((p) => (
                    <Command.Item key={p.href} value={`go ${p.label}`} onSelect={() => { router.push(p.href); close() }} className={itemClass}>
                      <ArrowUpRight className="size-4 text-ink-3" strokeWidth={1.5} />
                      <span className="flex-1">{p.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}

const groupClass = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3'
const itemClass = 'flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink data-[disabled=true]:opacity-50'
const kbdClass = 'rounded-xs bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-ink-3'

export function CommandButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('relife:command'))}
      className="flex h-10 w-full items-center gap-2.5 rounded-md bg-ink/[0.035] px-3 text-sm text-ink-3 shadow-inset transition-[background-color,color] duration-150 hover:bg-ink/[0.06] hover:text-ink-2 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
    >
      <Search className="size-4" strokeWidth={1.5} />
      <span className="flex-1 text-left">Log or search</span>
      <kbd className="rounded-xs bg-surface px-1.5 text-[11px] leading-5 font-medium text-ink-2 shadow-1">⌘K</kbd>
    </button>
  )
}
