'use client'

import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Plus, Search, Sparkles, type LucideIcon } from 'lucide-react'
import { routineArt } from '../routine-icons'
import { quickLog } from '@/app/actions'
import { NAV, SYSTEM_NAV } from './nav'
import { CATEGORY } from '../tokens'
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
  const typed = value.trim().length > 0
  // "water 250" puts Log first; plain words ("spend") put matching pages first and Ask last.
  const actionsGroup = typed ? (
                  <Command.Group heading="Actions" className={groupClass}>
                    {looksLikeLog ? (
                      <Command.Item
                        value={`log ${value}`}
                        disabled={pending}
                        onSelect={() => start(async () => {
                          const r = await quickLog(value)
                          announceXp(toast, r.news)
                          // "Water +250 ml · 750 ml today": what was logged, then the running total.
                          const [title, ...rest] = r.message.split(' · ')
                          if (r.ok) toast(title, 'good', { description: rest.join(' · ') || undefined, icon: routineArt(title, '', '') })
                          else toast.error('Couldn’t read that', r.message)
                          if (r.ok) close()
                        })}
                        className={itemClass}
                      >
                        <Chip color="var(--pill)"><Plus /></Chip>
                        <Label title={<>Log <span className="font-mono">{value}</span></>} sub={pending ? 'Saving…' : 'Adds to today and earns XP'} />
                        <kbd className={enterClass}>↵</kbd>
                      </Command.Item>
                    ) : null}
                    <Command.Item
                      value={`ask ${value}`}
                      onSelect={() => { router.push(`/insights?ask=${encodeURIComponent(value)}`); close() }}
                      className={itemClass}
                    >
                      <Chip color="var(--cat-mind)"><Sparkles /></Chip>
                      <Label title={<>Ask: <span className="text-ink">{value}</span></>} sub="Your coach answers from your data" />
                      <kbd className={enterClass}>↵</kbd>
                    </Command.Item>
                  </Command.Group>
                ) : null

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
          {/* Opened by keyboard many times a day: no animation, it appears on the same frame. */}
          <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[3px]" onClick={close} />
          <div className="relative w-full max-w-[600px]">
            <Command
              label="Command menu"
              loop
              className="overflow-hidden rounded-[20px] bg-surface shadow-3"
              onKeyDown={(e) => { if (e.key === 'Escape') close() }}
            >
              <div className="flex items-center gap-3 px-5">
                <Search className="size-5 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />
                <Command.Input
                  autoFocus
                  value={value}
                  onValueChange={setValue}
                  placeholder="Log “water 250”, go to a page, or ask a question…"
                  className="h-15 w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
                />
                <kbd className={kbdClass}>esc</kbd>
              </div>

              {/* Before typing: show what can be logged, one tap fills the box. */}
              {!typed ? (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-divider px-5 py-3">
                  <span className="me-1 text-[12px] font-medium text-ink-3">Quick log</span>
                  {EXAMPLES.map((x) => (
                    <button
                      key={x} type="button" onClick={() => setValue(x)}
                      className="h-7 rounded-full bg-surface-2 px-2.5 font-mono text-[12px] text-ink-2 transition-[background-color,color,scale] duration-150 ease-out-quint hover:bg-surface-3 hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
                    >
                      {x}
                    </button>
                  ))}
                </div>
              ) : null}

              <Command.List className="max-h-[min(440px,56vh)] overflow-y-auto overscroll-contain border-t border-divider p-2 scroll-py-2">
                <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-3">
                  No page called “{value}”. Press ↵ on Ask to ask your coach instead.
                </Command.Empty>
                {looksLikeLog ? actionsGroup : null}
                {GROUPS.map((g) => (
                  <Command.Group key={g.heading} heading={g.heading} className={groupClass}>
                    {g.items.map((p) => (
                      <Command.Item
                        key={p.href} value={`go ${p.label}`} keywords={[p.sub, p.parent ?? ''].filter(Boolean)}
                        onSelect={() => { router.push(p.href); close() }}
                        className={itemClass}
                      >
                        <Chip color={p.color}><p.icon /></Chip>
                        <Label title={p.parent ? <><span className="text-ink-3">{p.parent} ›</span> {p.label}</> : p.label} sub={p.sub} />
                        <kbd className={enterClass}>↵</kbd>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
                {!looksLikeLog ? actionsGroup : null}
              </Command.List>

              <div className="flex items-center gap-4 border-t border-divider bg-surface-2/60 px-5 py-2.5 text-[11.5px] text-ink-3">
                <span className="flex items-center gap-1.5"><kbd className={kbdClass}>↑</kbd><kbd className={kbdClass}>↓</kbd>Move</span>
                <span className="flex items-center gap-1.5"><kbd className={kbdClass}>↵</kbd>Open</span>
                <span className="ms-auto max-sm:hidden">Start with a number to log it</span>
              </div>
            </Command>
          </div>
        </div>
      ) : null}
    </>
  )
}

const EXAMPLES = ['water 250', 'mood 4', 'spent 120 chai', 'guitar 30', 'sleep 7.5']

type Entry = { href: string; label: string; icon: LucideIcon; color?: string; sub: string; parent?: string }
const SUB: Record<string, string> = {
  '/': 'Quests and routines for today', '/profile': 'Level, streak and achievements', '/habits': 'Routines and trackers',
  '/insights': 'Patterns, nudges and questions', '/inbox': 'Messages that need a look', '/connectors': 'Apps and data sources',
  '/settings': 'Profile, the System and notifications', '/wealth/spending': 'Where your money goes', '/wealth/portfolio': 'Holdings and P&L',
  '/wealth/subscriptions': 'Bills and renewals',
}
const AREA_SUB = Object.fromEntries(Object.values(CATEGORY).map((c) => [c.label, c.blurb]))
const entry = (n: (typeof NAV)[number]['items'][number]): Entry[] => [
  { href: n.href, label: n.label, icon: n.icon, color: n.color, sub: SUB[n.href] ?? AREA_SUB[n.label] ?? '' },
  ...(n.children ?? []).map((c) => ({ href: c.href, label: c.label, icon: n.icon, color: n.color, sub: SUB[c.href] ?? '', parent: n.label })),
]
const GROUPS = [
  { heading: 'Play', items: NAV[0].items.flatMap(entry) },
  { heading: 'Areas', items: NAV[1].items.flatMap(entry) },
  { heading: 'Setup', items: SYSTEM_NAV.flatMap(entry) },
]

/** Icon in a small tinted tile: the area colour, or neutral for app pages. */
function Chip({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-[9px] [&_svg]:size-4 [&_svg]:stroke-[1.75]"
      style={color ? { color: `color-mix(in oklch, ${color} 80%, var(--ink))`, background: `color-mix(in oklch, ${color} 15%, transparent)` } : { color: 'var(--ink-2)', background: 'var(--surface-2)' }}
    >
      {children}
    </span>
  )
}

function Label({ title, sub }: { title: React.ReactNode; sub?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[14px] font-medium text-ink">{title}</span>
      {sub ? <span className="block truncate text-[12px] text-ink-3">{sub}</span> : null}
    </span>
  )
}

// Concentric: panel 20px radius − 8px list padding = 12px rows.
const groupClass = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase'
const itemClass = 'group/item flex min-h-12 cursor-pointer items-center gap-3 rounded-[12px] px-2.5 py-1.5 data-[selected=true]:bg-surface-2 data-[disabled=true]:opacity-50'
const kbdClass = 'inline-grid h-5 min-w-5 place-items-center rounded-[5px] bg-surface px-1.5 text-[11px] font-medium text-ink-3 shadow-[inset_0_0_0_1px_var(--hairline),0_1px_0_var(--hairline)]'
// Only the selected row shows its Enter key, so the hint follows the keyboard.
const enterClass = `${kbdClass} opacity-0 transition-[opacity] duration-150 group-data-[selected=true]/item:opacity-100`

export function CommandButton() {
  return (
    <button
      type="button"
      data-tour="command"
      onClick={() => window.dispatchEvent(new Event('relife:command'))}
      className="flex h-10 w-full items-center gap-2.5 rounded-md bg-ink/[0.035] px-3 text-sm text-ink-3 shadow-inset transition-[background-color,color] duration-150 hover:bg-ink/[0.06] hover:text-ink-2 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
    >
      <Search className="size-4" strokeWidth={1.5} />
      <span className="flex-1 text-left">Log or search</span>
      <kbd className="rounded-xs bg-surface px-1.5 text-[11px] leading-5 font-medium text-ink-2 shadow-1">⌘K</kbd>
    </button>
  )
}

/** Search on its own, for a phone's page header. */
export function CommandIconButton() {
  return (
    <button
      type="button"
      aria-label="Log or search"
      onClick={() => window.dispatchEvent(new Event('relife:command'))}
      className="grid size-11 shrink-0 place-items-center rounded-md text-ink-2 transition-[background-color,color] duration-150 hover:bg-ink/5 hover:text-ink"
    >
      <Search className="size-5" strokeWidth={1.5} aria-hidden />
    </button>
  )
}
