'use client'

import { STATUS, type ConnectorStatus } from './connector-status'
import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react'
import { AtSign, Check, ChevronRight, CircleAlert, CircleCheck, Code2, Copy, Cpu, Dumbbell, ExternalLink, Gamepad2, Globe, GraduationCap, KeyRound, Lock, LogIn, Moon, Puzzle, RefreshCw, Search, Send, ShoppingBag, Timer, UtensilsCrossed, Wallet, Zap, type LucideIcon } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { SetupField } from '@/core/types'
import { connectIntegration, disconnectIntegration, openAppLogin, syncNow } from '@/app/actions'
import { Button, buttonClass } from './button'
import { Field, Input, Segmented } from './form'
import { IconChip } from './card'
import { FormError } from './forms/dialog'
import { CenterMorphModal, CenterMorphModalContent, CenterMorphModalTrigger } from '@/ui/beui/motion/center-morph-modal'
import { ConnectExtension, openConnectExtension } from './devices/connect-extension'
import { useToast } from './toast'
import { usePeekChanged } from './peek/peek-context'
import { AppLogo as Logo } from './app-logo'
import { ConnectSuccess, YourSources, SuggestedForYou, needsFix } from './connections-status'
import { ImportButton } from './imports/import-button'
import { PastImports, type PastImport } from './imports/import-history'
import { cn } from '../cn'

export type { ConnectorStatus }
/** A dialog field plus what the server already has for it. Secret values are never sent. */
export type FieldView = SetupField & { saved: boolean; fromEnv: boolean; value?: string; envSource?: 'dotsafe' | '.env' }
export type ConnectorSection = 'built-in' | 'keys' | 'shopping' | 'messaging' | 'ai'
export type ConnectorItem = {
  id: string
  name: string
  section: ConnectorSection
  /** Life area for data sources; Telegram and AI have none. */
  category?: Category
  description: string
  provides: string[]
  missingEnv: string[]
  status: ConnectorStatus
  /** Detail line under the description, e.g. "Every hour · synced 3 min ago". */
  detail: string
  error?: string | null
  /** Overrides the section's badge, e.g. "Runs locally". */
  badge?: string
  /** Overrides the status label, e.g. "Waiting for first sync". */
  statusLabel?: string
  connected: boolean
  /** Connects by logging in to the app in a Chrome window (shopping apps). */
  login?: boolean
  /** Why it can't run here (shopping apps in Docker). The row is drawn disabled with this as its hint. */
  unavailable?: string
  /** Connects by signing in with the service (OAuth): you register an app once, then sign in. */
  oauth?: { signedIn: boolean; redirectUri: string; setupUrl: string; httpsOnly?: boolean }
  /** Data sources get a Sync now button once connected. */
  sync?: boolean
  fields: FieldView[]
  /** "12 min ago" for the last good sync of a data source, null before the first. */
  lastSync?: string | null
  /** How often it runs: "Every hour". */
  cadence?: string
  /** Latest sync runs for this service, newest first, formatted for display. */
  syncs?: { at: string; ok: boolean | null; events: number }[]
}

export { STATUS }
const RANK: Record<ConnectorStatus, number> = { error: 0, setup: 1, waiting: 2, ready: 3, ok: 4, off: 5 }

type Group = { key: string; shelf: string; title: string; hint: string; icon: LucideIcon; color: string; ids: string[] }

// Grouped by what they track, not by how they connect: that's how you look for one. A new connector goes in
// the group that lists its id; one that isn't listed falls back to its life area (FALLBACK).
const GROUPS: Group[] = [
  { key: 'health', shelf: 'Your life', title: 'Health & sleep', hint: 'Rings, bands, scales and Apple Health', icon: Moon, color: 'var(--cat-health)', ids: ['oura', 'whoop', 'withings', 'icloud-inbox'] },
  { key: 'workouts', shelf: 'Your life', title: 'Workouts', hint: 'Runs, rides and gym sessions', icon: Dumbbell, color: 'var(--cat-health)', ids: ['strava', 'hevy'] },
  { key: 'focus', shelf: 'Your life', title: 'Focus & time', hint: 'Your calendar, tasks and where the hours go', icon: Timer, color: 'var(--cat-mind)', ids: ['google-calendar', 'laptop', 'rescuetime', 'toggl', 'todoist'] },
  { key: 'code', shelf: 'Your life', title: 'Code & contests', hint: 'Commits, coding time and contest ratings', icon: Code2, color: 'var(--cat-skills)', ids: ['github', 'wakatime', 'codeforces', 'codechef', 'atcoder', 'leetcode', 'codewars'] },
  { key: 'learning', shelf: 'Your life', title: 'Learning & reading', hint: 'Languages, flashcards, books and typing', icon: GraduationCap, color: 'var(--cat-mind)', ids: ['duolingo', 'anki', 'readwise', 'openlibrary', 'monkeytype'] },
  { key: 'play', shelf: 'Your life', title: 'Games & media', hint: 'Chess, Steam, music scrobbles and your film diary', icon: Gamepad2, color: 'var(--cat-hobbies)', ids: ['lichess', 'chesscom', 'steam', 'lastfm', 'letterboxd'] },
  { key: 'money', shelf: 'Spending', title: 'Money', hint: 'Crypto accounts and currency rates', icon: Wallet, color: 'var(--cat-wealth)', ids: ['binance', 'fx'] },
  { key: 'food', shelf: 'Spending', title: 'Food & groceries', hint: 'Delivery and 10-minute grocery orders', icon: UtensilsCrossed, color: 'var(--cat-wealth)', ids: ['swiggy', 'zomato', 'blinkit', 'zepto'] },
  { key: 'shopping', shelf: 'Spending', title: 'Shopping & travel', hint: 'Orders, returns and bookings', icon: ShoppingBag, color: 'var(--cat-wealth)', ids: ['amazon', 'flipkart', 'makemytrip'] },
  { key: 'messaging', shelf: 'System', title: 'Messaging', hint: 'Reminders and quick logs', icon: Send, color: 'var(--pill)', ids: ['telegram'] },
  { key: 'ai', shelf: 'System', title: 'AI models', hint: 'Plans, reviews and reading odd messages', icon: Cpu, color: 'var(--pill)', ids: [] },
]
const FALLBACK: Record<Category, string> = { health: 'health', mind: 'focus', skills: 'learning', wealth: 'money', hobbies: 'play', relationships: 'focus' }
const groupOf = (c: ConnectorItem) =>
  GROUPS.find((g) => g.ids.includes(c.id))?.key ?? (c.section === 'ai' ? 'ai' : c.section === 'messaging' ? 'messaging' : c.section === 'shopping' ? 'shopping' : FALLBACK[c.category ?? 'mind'])

/** How you connect it, shown on each card: the thing you'll need at hand. */
function method(c: ConnectorItem): { label: string; icon: LucideIcon } {
  if (c.oauth) return { label: 'Sign in', icon: LogIn }
  if (c.login) return { label: 'Browser login', icon: Globe }
  if (c.fields.some((f) => f.secret && !f.optional)) return { label: 'API key', icon: KeyRound }
  const field = c.fields.find((f) => !f.optional)
  return field ? { label: field.label, icon: AtSign } : { label: 'No setup', icon: Zap }
}

type Show = 'all' | 'on' | 'off'

/**
 * Every service as a card in a catalog, grouped by what it tracks, with a category rail (a chip row on phones),
 * search and a connected filter. Cards open one dialog for connecting and managing.
 */
export function ConnectorMarket({ items, worker, areas, imports = [], zipMaxMb }: {
  items: ConnectorItem[]; worker: { alive: boolean; ago: string; demo?: boolean }; /** The areas the user picked, for the suggestions. */ areas?: string[]
  /** The newest file imports, for Past imports. */ imports?: PastImport[]
  /** The size limit of a zip import, for the dialog's footer. */ zipMaxMb?: number
}) {
  useSignInResult(items)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const connected = items.filter((i) => i.connected)
  const attention = connected.filter(needsFix)
  const manage = (c: ConnectorItem, trigger: React.ReactElement) => <ConnectorDialog c={c} trigger={trigger} />

  const q = query.trim().toLowerCase()
  const groups = GROUPS.map((g) => {
    const all = items.filter((i) => groupOf(i) === g.key)
      .sort((a, b) => Number(b.connected) - Number(a.connected) || RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name))
    const groupHit = !!q && g.title.toLowerCase().includes(q)
    const list = all.filter((c) =>
      (show === 'all' || (show === 'on') === c.connected) &&
      (!q || groupHit || [c.name, c.description, ...c.provides].some((s) => s.toLowerCase().includes(q))))
    return { ...g, all, list, on: all.filter((c) => c.connected).length }
  }).filter((g) => g.all.length)
  const shown = groups.filter((g) => g.list.length)
  const active = useActiveSection(shown.map((g) => g.key))
  const reset = () => { setQuery(''); setShow('all') }

  return (
    <div className="flex flex-col gap-6">
      <ConnectExtension />
      <div className="rise flex flex-wrap items-center gap-2" style={{ '--i': 0 } as React.CSSProperties}>
        <Pill>{connected.length} of {items.length} connected</Pill>
        {worker.demo ? (
          <Pill title="The demo has no worker: its data is sample data.">Demo data · nothing syncs</Pill>
        ) : (
          <Pill color={worker.alive ? 'var(--good)' : 'var(--warn)'} title={worker.alive ? `Heartbeat ${worker.ago}` : 'Start it with npm run dev'}>
            {worker.alive ? 'Syncing in the background' : 'Worker stopped · run npm run dev'}
          </Pill>
        )}
        {attention.length ? <Pill color="var(--bad)">{attention.length} need{attention.length === 1 ? 's' : ''} a fix</Pill> : null}
        <span className="ms-auto"><ImportButton zipMaxMb={zipMaxMb} /></span>
      </div>

      <div className="rise flex flex-col gap-8" style={{ '--i': 1 } as React.CSSProperties}>
        <YourSources items={items} manage={manage} />
        <PastImports imports={imports} />
        <SuggestedForYou items={items} areas={areas} manage={manage} />
        <h2 className="-mb-4 px-1 text-heading text-ink">All apps</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-10">
        <CategoryRail groups={groups} active={active} />

        <div className="flex min-w-0 flex-col gap-8">
          <div className="rise flex flex-col gap-3" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative min-w-0 flex-1 sm:max-w-sm">
                <span className="sr-only">Search connectors</span>
                <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" strokeWidth={1.5} aria-hidden />
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by app or what it tracks" className="h-10 ps-9" />
              </label>
              <Segmented
                name="show" aria-label="Show" value={show} className="self-start sm:ms-auto sm:self-auto"
                onValueChange={(v) => setShow(v as Show)}
                options={[{ value: 'all', label: 'All' }, { value: 'on', label: `Connected · ${connected.length}` }, { value: 'off', label: 'Not connected' }]}
              />
            </div>
          </div>
          {/* A direct child of the long column, so it stays stuck while you scroll every section. */}
          <CategoryChips groups={groups} active={active} />

          {shown.length ? shown.map((g, gi) => (
            <section key={g.key} id={`sec-${g.key}`} aria-labelledby={`grp-${g.key}`} className="flex scroll-mt-20 flex-col gap-3 lg:scroll-mt-9">
              <div className="rise flex items-end justify-between gap-3 px-1" style={{ '--i': 3 + gi * 0.5 } as React.CSSProperties}>
                <div className="flex min-w-0 items-center gap-3">
                  <IconChip color={g.color}><g.icon strokeWidth={2} /></IconChip>
                  <div className="min-w-0">
                    <h2 id={`grp-${g.key}`} className="text-[17px] leading-tight font-semibold tracking-[-0.01em] text-ink">{g.title}</h2>
                    <p className="truncate text-[13px] text-ink-3">{g.hint}</p>
                  </div>
                </div>
                <span className="shrink-0 text-[12.5px] text-ink-3 tabular-nums">{g.on ? `${g.on} of ${g.all.length} on` : `${g.all.length} available`}</span>
              </div>
              <div className="@container">
                <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @3xl:grid-cols-3">
                  {g.list.map((c) => (
                    <li key={c.id} className="rise flex min-w-0" style={{ '--i': 3.25 + gi * 0.5 } as React.CSSProperties}>
                      {c.unavailable ? <Tile c={c} disabled /> : <ConnectorDialog c={c} trigger={<Tile c={c} />} />}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )) : (
            <div className="flex flex-col items-center gap-3 rounded-lg bg-surface px-6 py-12 text-center shadow-1">
              <Search className="size-5 text-ink-3" strokeWidth={1.5} aria-hidden />
              <p className="text-[14px] text-ink-2">
                {q ? <>Nothing matches “{query.trim()}”{show === 'all' ? '' : show === 'on' ? ' in your connected apps' : ' in the ones not connected'}.</> : show === 'on' ? 'Nothing connected yet.' : 'Everything is connected.'}
              </p>
              <Button size="sm" onClick={reset}>Show all connectors</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Back from a sign-in (/api/oauth/<id>/callback sends ?oauth=<id>[&error=…]): say how it went, then tidy the URL. */
function useSignInResult(items: ConnectorItem[]) {
  const toast = useToast()
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const id = q.get('oauth')
    if (!id) return
    const c = items.find((i) => i.id === id)
    const name = c?.name ?? id
    const icon = c ? <Logo id={c.id} category={c.category} size="xs" /> : undefined
    const error = q.get('error')
    if (error) toast(`Couldn’t sign in with ${name}`, 'bad', { icon, description: error })
    else toast(`Signed in with ${name}`, 'good', { icon, description: 'Its first sync starts within a minute' })
    window.history.replaceState(null, '', window.location.pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival
}

type GroupView = Group & { all: ConnectorItem[]; list: ConnectorItem[]; on: number }

/** The section on screen: the last one whose top has passed under the page top (or the last at the bottom). */
function useActiveSection(keys: string[]) {
  const [active, setActive] = useState<string | undefined>(keys[0])
  const key = keys.join()
  useEffect(() => {
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const ids = key ? key.split(',') : []
        let cur = ids[0]
        const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
        for (const k of ids) {
          const el = document.getElementById(`sec-${k}`)
          if (el && el.getBoundingClientRect().top < 160) cur = k
        }
        setActive(atEnd ? ids.at(-1) : cur)
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [key])
  return active
}

/** Desktop: a sticky list of categories by shelf, like Settings, with how many of each you've connected. */
function CategoryRail({ groups, active }: { groups: GroupView[]; active?: string }) {
  const shelves = [...new Set(groups.map((g) => g.shelf))]
  return (
    <nav aria-label="Connector categories" className="hidden lg:block">
      <div className="sticky top-9 flex flex-col gap-5">
        {shelves.map((s) => (
          <div key={s} className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1 font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{s}</div>
            {groups.filter((g) => g.shelf === s).map((g) => {
              const empty = !g.list.length
              const on = active === g.key && !empty
              return (
                <a
                  key={g.key}
                  href={`#sec-${g.key}`}
                  aria-current={on ? 'location' : undefined}
                  aria-disabled={empty || undefined}
                  tabIndex={empty ? -1 : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-[background-color,color,box-shadow,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-pill',
                    on ? 'bg-surface font-medium text-ink shadow-1' : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink dark:hover:bg-white/[0.05]',
                    empty && 'pointer-events-none opacity-45',
                  )}
                >
                  <g.icon className="size-4 shrink-0" strokeWidth={on ? 2 : 1.5} style={{ color: g.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{g.title}</span>
                  <span className="text-[12px] text-ink-3 tabular-nums" aria-label={`${g.on} of ${g.all.length} connected`}>{g.on ? `${g.on}/${g.all.length}` : g.all.length}</span>
                </a>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}

/** Phones and tablets: the same categories as a sticky, sideways-scrolling chip row that follows the page. */
function CategoryChips({ groups, active }: { groups: GroupView[]; active?: string }) {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = bar.current
    const chip = el?.querySelector<HTMLElement>(`[data-key="${active}"]`)
    if (!el || !chip || !el.offsetParent) return // hidden on desktop
    el.scrollTo({ left: chip.offsetLeft - 16, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [active])
  return (
    <nav aria-label="Connector categories" className="sticky top-0 z-10 -mx-5 -my-5 bg-glass px-5 py-2 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:hidden">
      <div ref={bar} className="-my-1 flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((g) => {
          const empty = !g.list.length
          const on = active === g.key && !empty
          return (
            <a
              key={g.key}
              data-key={g.key}
              href={`#sec-${g.key}`}
              aria-current={on ? 'location' : undefined}
              aria-disabled={empty || undefined}
              tabIndex={empty ? -1 : undefined}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-pill active:scale-[0.96]',
                on ? 'bg-pill text-white' : 'bg-surface text-ink-2 shadow-1',
                empty && 'pointer-events-none opacity-45',
              )}
            >
              <g.icon className="size-4" strokeWidth={2} style={on ? undefined : { color: g.color }} aria-hidden />
              {g.title}
            </a>
          )
        })}
      </div>
    </nav>
  )
}

function Pill({ children, color, title }: { children: React.ReactNode; color?: string; title?: string }) {
  return (
    <span title={title} className="inline-flex h-8 items-center gap-2 rounded-full bg-surface px-3 text-[12.5px] font-medium text-ink-2 shadow-1 tabular-nums">
      {color ? <span aria-hidden className="size-2 rounded-full" style={{ background: color }} /> : null}
      {children}
    </span>
  )
}

/**
 * The catalog card: logo, name, how it connects, what it brings in, and a footer with its status (connected) or
 * what it tracks and Connect (not yet). The whole card is the button.
 */
function Tile({ c, ...props }: { c: ConnectorItem } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const status = STATUS[c.status]
  const how = method(c)
  const calm = c.status === 'ok' || c.status === 'ready'
  return (
    <button
      type="button"
      {...props}
      className={cn('group flex w-full flex-col gap-3 rounded-[18px] bg-surface p-4 text-start shadow-1 transition-[box-shadow,scale] duration-150 ease-out-quint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill', c.unavailable ? 'cursor-not-allowed opacity-60' : 'hover:shadow-2 active:scale-[0.96]')}
    >
      <span className="flex items-center gap-3">
        <span className="transition-[scale] duration-150 ease-out-quint group-hover:scale-[1.04]"><Logo id={c.id} category={c.category} size="sm" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{c.name}</span>
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-3">
            <how.icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="truncate">{c.badge ?? how.label}</span>
          </span>
        </span>
      </span>
      <span className="line-clamp-2 text-[13px] leading-snug text-ink-2">{c.description}</span>
      <span className="mt-auto flex min-h-8 items-center gap-2 border-t border-divider pt-3">
        {c.connected ? (
          <>
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: status.color }} />
            <span className={cn('min-w-0 flex-1 truncate text-[12.5px] tabular-nums', calm ? 'text-ink-3' : 'font-medium')} style={calm ? undefined : { color: status.color }}>
              <span className="sr-only">{status.label}: </span>{calm ? c.detail : c.statusLabel ?? status.label}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-medium text-ink-2 transition-[color] duration-150 group-hover:text-ink">
              Manage<ChevronRight className="size-4 transition-[translate] duration-150 ease-out-quint group-hover:translate-x-0.5 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden />
            </span>
          </>
        ) : c.unavailable ? (
          <span className="text-[12.5px] leading-snug text-ink-3">{c.unavailable}</span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{c.provides.slice(0, 3).join(' · ')}</span>
            <span className="shrink-0 rounded-full bg-pill-wash px-3 py-1.5 text-[12.5px] font-semibold text-pill-ink transition-[background-color,color] duration-150 group-hover:bg-pill group-hover:text-white">Connect</span>
          </>
        )}
      </span>
    </button>
  )
}

/** "API key" stays, "Personal access token" → "personal access token". */
const lowerFirst = (s: string) => (/^[A-Z][A-Z]/.test(s) ? s : s[0].toLowerCase() + s.slice(1))

export function SyncButton({ id, name, compact }: { id: string; name: string; /** An icon button for a table row. */ compact?: boolean }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const changed = usePeekChanged()
  return (
    <Button
      disabled={pending}
      size={compact ? 'icon-sm' : undefined}
      variant={compact ? 'ghost' : undefined}
      aria-label={compact ? `Sync ${name} now` : undefined}
      onClick={() => start(async () => {
        const t = toast.loading(`Syncing ${name}…`, { icon: <Logo id={id} size="xs" /> })
        const r = await syncNow(id)
        changed()
        if (r.ok) toast.update(t, `${name} synced`, 'good', { description: r.events ? `${r.events} new` : 'Nothing new since the last sync' })
        else toast.update(t, `Couldn’t sync ${name}`, 'bad', { description: r.error ?? 'Try again in a moment' })
      })}
    >
      <RefreshCw className={pending ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
      {compact ? null : pending ? 'Syncing…' : 'Sync now'}
    </Button>
  )
}

/**
 * One dialog per service (beui.dev center-morph-modal: unfolds from its centre). Connected: status,
 * recent syncs, Sync now, then settings. Not connected: what it gives you and how to connect.
 */
export function ConnectorDialog({ c, trigger }: { c: ConnectorItem; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false)
  const uid = useId()
  const status = STATUS[c.status]
  return (
    <CenterMorphModal open={open} onOpenChange={setOpen}>
      <CenterMorphModalTrigger>{trigger}</CenterMorphModalTrigger>
      <CenterMorphModalContent
        ariaLabel={c.connected ? c.name : `Connect ${c.name}`}
        ariaDescribedBy={`${uid}-desc`}
        closeButtonLabel="Close"
        // Radius stays 30px: the unfold clip-path uses the same value. Capped to the window (the modal layer is inset
        // 1rem and pads 2rem) and scrolling inside the panel: a taller panel is centred past the top of the screen,
        // cutting off the header and the rounded corners.
        className="max-h-[calc(100dvh-6rem)] max-w-[500px] overflow-y-auto overscroll-contain border-0 bg-surface shadow-[inset_0_0_0_1px_var(--hairline)]"
        backdropClassName="bg-[oklch(0.178_0_0/0.28)]"
      >
        <div className="flex flex-col gap-5 p-6">
          <header className="flex items-center gap-4 pe-10">
            <Logo id={c.id} category={c.category} size="lg" />
            <div className="min-w-0">
              <h2 className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em] text-ink">{c.name}</h2>
              <p className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: c.connected ? status.color : 'var(--ink-3)' }}>
                <span aria-hidden className="size-2 rounded-full" style={{ background: status.color }} />{c.statusLabel ?? status.label}
              </p>
            </div>
          </header>

          <ConnectorBody c={c} onDone={() => setOpen(false)} descId={`${uid}-desc`} />
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}

/** Laptop activity: the extension connects with a code, from the same dialog as every other device. */
function ExtensionAction({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="-mt-1 flex items-center gap-3 rounded-[16px] bg-surface-2/60 p-3.5 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-pill-wash text-pill-ink"><Puzzle className="size-5" strokeWidth={1.5} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-ink">Chrome extension</p>
        <p className="text-caption text-ink-3">It shows a code; you type it here. No token to paste.</p>
      </div>
      <Button variant="primary" size="sm" onClick={() => { onOpen(); openConnectExtension() }}>Connect the Chrome extension</Button>
    </div>
  )
}

/**
 * What a connector dialog shows under its title, and what the connector Peek shows too: the description, what it
 * brings in or (when connected) its status, recent syncs and Sync now, then the connect or settings form.
 */
export function ConnectorBody({ c, onDone, descId }: { c: ConnectorItem; onDone: () => void; descId?: string }) {
  const secrets = c.fields.filter((f) => f.secret && !f.optional) // the ones you must have
  return (
    <>
      <p id={descId} className="-mt-1 text-[14px] leading-relaxed text-ink-2">{c.description}</p>
      {c.id === 'laptop' ? <ExtensionAction onOpen={onDone} /> : null}
      {!c.connected ? (
        <ul aria-label="What it brings in" className="-mt-2 flex flex-wrap gap-1.5">
          {c.provides.map((p) => <li key={p} className="inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--hairline)]">{p}</li>)}
          <li className="inline-flex h-7 items-center gap-1 px-1 text-[12.5px] text-ink-3"><KeyRound className="size-3.5" strokeWidth={1.5} aria-hidden />{c.login ? 'Log in with your account' : c.oauth ? `Sign in with ${c.name}` : secrets.length ? `Needs ${secrets.map((f) => lowerFirst(f.label)).join(' and ')}` : 'No key needed'}</li>
        </ul>
      ) : (
        <div className="flex flex-col gap-3 rounded-[16px] bg-surface-2/60 p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink-2 tabular-nums">{c.detail}</span>
            {c.sync ? <SyncButton id={c.id} name={c.name} /> : null}
          </div>
          {c.error && c.status === 'error' ? <p className="rounded-md bg-bad/10 px-3 py-2 text-[12.5px] text-bad">{c.error}</p> : null}
          {c.syncs?.length ? (
            <ul aria-label="Recent syncs" className="flex flex-col divide-y divide-divider text-[12.5px]">
              {c.syncs.map((r, i) => (
                <li key={i} className="flex h-8 items-center gap-2.5">
                  {r.ok === false ? <CircleAlert className="size-3.5 text-bad" strokeWidth={2} aria-label="Failed" /> : <CircleCheck className="size-3.5 text-good" strokeWidth={2} aria-label="OK" />}
                  <span className="flex-1 text-ink-2 tabular-nums">{r.at}</span>
                  <span className="text-ink-3 tabular-nums">{r.ok === false ? 'Failed' : `${r.events} new`}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <ConnectForm c={c} onDone={onDone} />
    </>
  )
}

/** Step 1 for app logins: open a real Chrome window, log in with your phone OTP, then close it. */
function LoginStep({ c }: { c: ConnectorItem }) {
  const [pending, start] = useTransition()
  const [state, setState] = useState<'idle' | 'open' | string>('idle')
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-2/60 p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <ol className="flex list-decimal flex-col gap-1 ps-4 text-[13.5px] text-ink-2">
        <li>Open a login window and sign in to {c.name} as usual (OTP included).</li>
        <li>Once you see your account, come back here.</li>
        <li>Press {c.connected ? 'Save' : 'Connect'}. ReLife closes the window, keeps the login and syncs orders every few hours.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={() => start(async () => { const r = await openAppLogin(c.id); setState(r.ok ? 'open' : r.error) })}>
          <ExternalLink className="size-4" strokeWidth={1.5} />{pending ? 'Opening…' : c.connected ? 'Log in again' : 'Open login window'}
        </Button>
        <span role="status" className={cn('text-[12.5px]', state !== 'idle' && state !== 'open' ? 'text-bad' : 'text-ink-3')}>
          {state === 'open' ? 'Window open. Log in, then close it.' : state === 'idle' ? '' : state}
        </span>
      </div>
    </div>
  )
}

/**
 * Sign-in connectors: you make a free app with the service once (ReLife runs on your machine, so there's no
 * shared app), register the address it sends you back to, paste its ID and secret, then sign in.
 */
function SignInStep({ c }: { c: ConnectorItem }) {
  const o = c.oauth!
  const [copied, setCopied] = useState(false)
  const ready = c.connected && !c.missingEnv.length
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-2/60 p-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
      {ready ? (
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/api/oauth/${c.id}/start`} className={buttonClass({ variant: o.signedIn ? 'secondary' : 'accent' })}>
            <LogIn className="size-4" strokeWidth={2} aria-hidden />{o.signedIn ? 'Sign in again' : `Sign in with ${c.name}`}
          </a>
          <span role="status" className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: o.signedIn ? 'var(--good)' : 'var(--warn)' }}>
            {o.signedIn ? <><CircleCheck className="size-3.5" strokeWidth={2} aria-hidden />Signed in</> : 'Not signed in yet'}
          </span>
        </div>
      ) : null}
      <ol className="flex list-decimal flex-col gap-1 ps-4 text-[13.5px] text-ink-2">
        <li>
          Create an app at{' '}
          <a href={o.setupUrl} target="_blank" rel="noreferrer" className="font-medium text-pill-ink underline-offset-2 hover:underline">{new URL(o.setupUrl).host}</a>.
        </li>
        <li className="flex flex-col gap-1.5">
          <span>Add this redirect address to it:</span>
          <span className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-sm bg-surface px-2 py-1.5 font-mono text-[12px] text-ink shadow-[inset_0_0_0_1px_var(--hairline)]" title={o.redirectUri}>{o.redirectUri}</code>
            <Button
              size="icon-sm"
              aria-label={copied ? 'Copied' : 'Copy redirect address'}
              onClick={() => navigator.clipboard?.writeText(o.redirectUri).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
            >
              {copied ? <Check className="size-4 text-good" strokeWidth={2} /> : <Copy className="size-4" strokeWidth={1.5} />}
            </Button>
          </span>
        </li>
        <li>Paste its client ID and secret below, then press {c.connected ? 'Save' : 'Connect'} to sign in.</li>
      </ol>
      {o.httpsOnly && o.redirectUri.startsWith('http:') ? (
        <p className="flex items-start gap-2 text-[12.5px] text-warn">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          {c.name} only accepts https addresses. Open ReLife over https (an HTTPS tunnel such as Tailscale Serve) and connect from there.
        </p>
      ) : null}
    </div>
  )
}

function ConnectForm({ c, onDone }: { c: ConnectorItem; onDone: () => void }) {
  const [state, action, pending] = useActionState(connectIntegration.bind(null, c.id), null)
  const [leaving, startLeave] = useTransition()
  // A `<form action>` clears its inputs when the action finishes. Submit by hand instead, so a rejected key or
  // username stays in the box to be corrected.
  const [, startSubmit] = useTransition()
  const toast = useToast()
  const uid = useId()
  // A new connection ends on the success step (where it shows up, first sync) instead of closing at once.
  const [connectedHere, setConnectedHere] = useState(false)
  // Whether it was connected when the form opened: the refresh after saving flips `c.connected` under us.
  const wasConnected = useRef(c.connected)
  const failed = !!state && !state.ok
  useEffect(() => {
    if (!state?.ok || connectedHere) return
    const icon = <Logo id={c.id} category={c.category} size="xs" />
    // A new or changed app needs a sign-in before anything syncs: go straight there.
    if (c.oauth && (!wasConnected.current || !c.oauth.signedIn)) {
      toast(`Opening ${c.name} sign-in…`, 'neutral', { icon })
      window.location.assign(`/api/oauth/${c.id}/start`)
      return
    }
    if (wasConnected.current) { toast(`${c.name} settings saved`, 'good', { icon }); onDone(); return }
    toast(`${c.name} connected`, 'good', { icon, description: c.sync ? 'Its first sync starts within a minute' : undefined })
    setConnectedHere(true)
  }, [state, connectedHere, c.connected, c.name, c.id, c.category, c.sync, c.oauth, onDone, toast])

  if (connectedHere) return <ConnectSuccess c={c} onDone={onDone} />

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startSubmit(() => action(data)) }}
      className="flex flex-col gap-4"
    >
      {c.login ? <LoginStep c={c} /> : null}
      {c.oauth ? <SignInStep c={c} /> : null}
      {c.fields.length ? c.fields.map((f) => (
        <Field
          key={f.env}
          htmlFor={`${uid}-${f.env}`}
          label={<>{f.label}{f.optional ? <span className="font-normal text-ink-3"> (optional)</span> : null}</>}
          hint={f.hint}
        >
          <Input
            id={`${uid}-${f.env}`}
            name={f.env}
            type={f.secret ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            maxLength={500}
            defaultValue={f.secret ? undefined : f.value}
            placeholder={f.secret && f.saved ? 'Saved. Leave blank to keep it' : f.fromEnv ? (f.envSource === 'dotsafe' ? 'From your dotsafe vault. Leave blank to use it' : 'Found in .env. Leave blank to use it') : f.placeholder}
            aria-invalid={failed || undefined}
            className={cn('font-mono text-small', failed && 'shadow-[0_0_0_1.5px_var(--bad)]')}
          />
        </Field>
      )) : (
        <p className="text-[14px] text-ink-2">No key needed. Connect and ReLife starts syncing within a minute.</p>
      )}

      {c.login ? (
        <p className="flex items-start gap-2 text-[12.5px] text-ink-3">
          <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          Your session stays in this Mac’s Chrome profile for ReLife (data/browser). Not an official integration: it may break when {c.name} changes its site, and you’ll log in again every few weeks.
        </p>
      ) : null}
      {c.fields.some((f) => f.secret) ? (
        <p className="flex items-start gap-2 text-[12.5px] text-ink-3">
          <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          Keys are encrypted in your local database and only sent to {c.name}.
        </p>
      ) : null}

      <FormError message={state && !state.ok ? state.error : undefined} />

      <div className="flex items-center gap-2 pt-1">
        {c.connected ? (
          <Button
            variant="danger"
            disabled={leaving || pending}
            onClick={() => startLeave(async () => {
              try { await disconnectIntegration(c.id); toast(`${c.name} disconnected`, 'neutral', { icon: <Logo id={c.id} category={c.category} size="xs" /> }); onDone() } catch { toast.error(`Couldn’t disconnect ${c.name}`) }
            })}
          >
            {leaving ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending || leaving}>
            {pending ? (c.connected ? 'Saving…' : 'Checking…') : c.connected ? 'Save' : failed ? 'Check again' : 'Connect'}
          </Button>
        </div>
      </div>
    </form>
  )
}
