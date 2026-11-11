'use client'

import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Plus, Search, Sparkles } from 'lucide-react'
import { CATEGORY } from '../tokens'
import { routineArt } from '../routine-icons'
import { quickLog } from '@/app/actions'
import { FOOTER, PLAY, STATS, type NavItem } from '../nav-model'
import { Button } from './button'
import { Kbd } from './kit/kbd'
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
                        <Chip color="var(--accent)"><Plus /></Chip>
                        <Label title={<>Log <span className="font-mono">{value}</span></>} sub={pending ? 'Saving…' : 'Adds to today and earns XP'} />
                        <kbd className={enterClass}>↵</kbd>
                      </Command.Item>
                    ) : null}
                    <Command.Item
                      value={`ask ${value}`}
                      onSelect={() => { router.push(`/coach?ask=${encodeURIComponent(value)}`); close() }}
                      className={itemClass}
                    >
                      <Chip color="var(--mind)"><Sparkles /></Chip>
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
          <div className="absolute inset-0 bg-[var(--scrim)]" onClick={close} />
          <div className="relative w-full max-w-[600px]">
            <Command
              label="Command menu"
              loop
              className="overflow-hidden rounded-lg bg-raised shadow-3"
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
                        key={p.href} value={`go ${p.label}`} keywords={[p.sub, ...(p.keywords ?? [])]}
                        onSelect={() => { router.push(p.href); close() }}
                        className={itemClass}
                      >
                        <Chip color={p.area ? CATEGORY[p.area].color : undefined}><p.icon /></Chip>
                        <Label title={p.label} sub={p.sub} />
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

const GROUPS = [
  { heading: 'Go to', items: PLAY },
  { heading: 'Stats', items: STATS },
  { heading: 'Setup', items: FOOTER },
] satisfies { heading: string; items: NavItem[] }[]

/** Icon in a small tinted tile: the area colour, or neutral for app pages. */
function Chip({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-[9px] [&_svg]:size-4 [&_svg]:stroke-[1.75]"
      style={color ? { color, background: `color-mix(in srgb, ${color} 15%, transparent)` } : { color: 'var(--text-2)', background: 'var(--raised-2)' }}
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

const openCommand = () => window.dispatchEvent(new Event('relife:command'))

/** The rail's search field: 32px, opens ⌘K. */
export function CommandButton() {
  return (
    <button
      type="button"
      data-tour="command"
      onClick={openCommand}
      className="flex h-8 w-full items-center gap-2 rounded-sm bg-raised pr-1.5 pl-2.5 text-[13px] text-ink-3 shadow-inset transition-[box-shadow,color] duration-150 hover:text-ink-2 hover:shadow-[inset_0_0_0_1px_var(--line-3)]"
    >
      <Search className="size-4" strokeWidth={1.5} aria-hidden />
      <span className="flex-1 text-left whitespace-nowrap">Log or search…</span>
      <Kbd>⌘K</Kbd>
    </button>
  )
}

/** "Log something": an icon button that opens ⌘K empty, in the rail's top row and the phone header. */
export function LogButton() {
  return (
    <Button variant="ghost" size="icon" aria-label="Log something" onClick={openCommand}>
      <Plus className="size-4" strokeWidth={1.5} />
    </Button>
  )
}
