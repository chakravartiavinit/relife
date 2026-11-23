'use client'

import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Check, ChevronDown, CircleCheck, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { NavStatus } from '@/domain/shell'
import { cn } from '../../cn'
import { CapsuleMark, Wordmark } from '../logo'
import { ThemeToggle } from '../theme-toggle'
import { isActive, LIFE_HUB, NAV, visibleLifeChildren, type NavItem } from '../nav'
import { CountPill } from './coach-bell'
import { rowStatus } from './nav-status'
import { useLifeOpen, useSidebarRail } from './sidebar-state'

// Desktop sidebar (≥ lg): 240px, or a 72px rail. One list of 34px rows, each a 3D picture, the name and its status for
// today ("5 of 11", "3 left", a check, the Coach count); at the foot the You card (sidebar-profile.tsx), the sync line,
// the theme toggle and the collapse button. The choice is remembered (shell/sidebar-state.ts) and drawn from
// <html data-sidebar> before paint by the `rail:` variant: the same elements switch layout, nothing is rendered twice.
// The phone has the tab bar instead. The status arrives as `NavStatus` from a Suspense island (shell-status.tsx); until
// it does the rows are just names.

/** Wraps the page; ⌘\ toggles the rail with no animation (the collapse button eases the width, see SidebarFoot). */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [rail, setRail] = useSidebarRail()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setRail(!rail) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rail, setRail])
  return <div className="mx-auto flex min-h-dvh w-full max-w-[1480px] min-w-0">{children}</div>
}

type Slots = {
  /** The rows: `SidebarNav` inside its Suspense island (names alone while the status loads). */
  nav: ReactNode
  /** The You card (expanded) or level ring (rail). */
  you: ReactNode
  /** The sync line (expanded) or dot (rail). */
  sync: ReactNode
  /** The Mock-mode badge, only present in mock mode. */
  mock?: ReactNode
}

export function Sidebar({ nav, you, sync, mock }: Slots) {
  return (
    // `lg:flex` so the aside stretches to the page's height and its sticky panel can stay in view while the page scrolls.
    <div className="hidden shrink-0 lg:flex">
      <aside aria-label="Sidebar" data-sidebar-panel className="relative z-20 w-60 shrink-0 rail:w-[72px]">
        <div className="sticky top-0 flex h-svh flex-col overflow-hidden border-r border-divider px-3 pt-5 pb-3 rail:items-center rail:overflow-visible rail:px-0">
          <div className="flex h-10 shrink-0 items-center px-2 rail:justify-center rail:px-0">
            <Link href="/" aria-label={`${brand.name}, Today`} className="relative rounded-sm after:absolute after:inset-[-4px] after:content-[''] focus-visible:outline-2 focus-visible:outline-pill">
              <Wordmark className="h-[30px] rail:hidden" />
              <CapsuleMark className="hidden size-9 rail:block" />
            </Link>
          </div>
          {mock ? <div className="mt-1 rail:hidden">{mock}</div> : null}
          <div className="scroll-fade -mx-1 mt-2 -mb-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 py-2 rail:mx-0 rail:w-full rail:overflow-visible rail:mask-none rail:px-0">
            {nav}
          </div>
          <div className="mt-3 w-full shrink-0">{you}</div>
          <SidebarFoot sync={sync} />
        </div>
      </aside>
    </div>
  )
}

/** The rows with the status, reading the pathname. Goes in a Suspense island whose fallback is `SidebarNavFallback`. */
export function SidebarNav(props: { areas?: string[]; status?: NavStatus }) {
  return <NavRows {...props} path={usePathname()} />
}

/** The same rows with nothing marked and no status, for Suspense fallbacks. */
export function SidebarNavFallback() {
  return <NavRows path="" />
}

/** The rows for a given path and status (the live ones above read the pathname; /dev/ui draws them directly). */
export function NavRows({ areas, status, path }: { areas?: string[]; status?: NavStatus; path: string }) {
  const item = (href: string) => NAV.flatMap((g) => g.items).find((i) => i.href === href)!
  const [open] = useLifeOpen()
  const [rail] = useSidebarRail()
  const row = (i: NavItem, tour?: string) => <Row key={i.href} item={i} path={path} status={status} tour={tour} />
  return (
    <nav aria-label="Main" className="flex w-full flex-col gap-0.5">
      {row(item('/'), '/')}
      <LifeFold />
      <Rule className="hidden rail:block" />
      <div role="group" aria-labelledby="life-label" data-tour="areas" className="flex flex-col gap-0.5">
        {row(LIFE_HUB)}
        <div className="nav-sub grid" data-open>
          <div className="min-h-0 overflow-hidden rail:overflow-visible">
            <ul inert={!open && !rail} className="flex flex-col gap-0.5">
              {visibleLifeChildren(areas, path).map((k) => <li key={k.href}>{row(k)}</li>)}
            </ul>
          </div>
        </div>
      </div>
      <Rule className="h-3 rail:h-px" />
      {row(item('/plan'))}
      {row(item('/coach'))}
    </nav>
  )
}

/** A hairline in the rail, plain space when expanded. */
function Rule({ className }: { className?: string }) {
  return <span aria-hidden className={cn('rail:mx-auto rail:my-[7px] rail:h-px rail:w-6 rail:bg-divider', className)} />
}

/** The "Life" group label with its fold button (remembered). Hidden in the rail, where the group is always open. */
function LifeFold() {
  const [open, setOpen] = useLifeOpen()
  return (
    <div className="mt-3 mb-0.5 flex h-7 items-center justify-between pr-1 pl-2.5 text-small font-medium text-ink-3 rail:hidden">
      <span id="life-label">Life</span>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Hide the areas under Life' : 'Show the areas under Life'}
        onClick={() => setOpen(!open)}
        className="relative grid size-7 place-items-center rounded-sm text-ink-3 transition-[color,scale] duration-150 ease-out-quint after:absolute after:-inset-1 after:content-[''] hover-fine:text-ink active:scale-96 focus-visible:outline-2 focus-visible:outline-pill"
      >
        <ChevronDown className={cn('size-4 transition-transform duration-150 ease-out-quint', !open && '-rotate-90')} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  )
}

/**
 * One destination: picture, name, status. Colour is the only thing that changes between states (150ms); the active row
 * lifts onto a surface with a hairline. In the rail the row is a 48 x 40 cell: the name goes to screen readers only, the
 * status becomes a ring or check on the picture (the Coach count stays a pill), and a tooltip grows from its left edge on
 * hover (fine pointers) or keyboard focus.
 */
function Row({ item, path, status, tour }: { item: NavItem; path: string; status?: NavStatus; tour?: string }) {
  const active = isActive(path, item.href)
  const st = rowStatus(item.href, status)
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      data-tour={tour}
      className={cn(
        'group relative grid h-[34px] grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-md pr-2.5 pl-2 text-body transition-colors duration-150 ease-out-quint focus-visible:outline-2 focus-visible:outline-pill',
        'rail:mx-auto rail:h-10 rail:w-12 rail:grid-cols-1 rail:place-items-center rail:p-0',
        active ? 'bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--hairline)] [--halo:var(--surface)]' : 'text-ink-2 [--halo:var(--bg)] hover-fine:bg-surface-2 hover-fine:text-ink',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small local PNG */}
      <span className="grid size-6 place-items-center">{item.picture ? <img src={item.picture} alt="" width={20} height={20} className="size-5 outline-none" /> : null}</span>
      <span className="truncate rail:sr-only">{item.label}</span>
      {st.text || st.done ? (
        <span className={cn('flex items-center gap-1 text-caption tabular-nums rail:hidden', st.done ? 'text-good' : 'text-ink-3')}>
          {st.text}
          {st.done ? <CircleCheck className="size-4" strokeWidth={1.5} aria-hidden /> : null}
        </span>
      ) : null}
      {st.count ? <CountPill n={st.count} className="rail:absolute rail:top-px rail:right-[3px] rail:h-4 rail:min-w-4 rail:px-1 rail:shadow-[0_0_0_2px_var(--halo)]" /> : null}
      {st.mark === 'due' ? <span aria-hidden className="absolute right-[9px] bottom-1.5 hidden size-[9px] rounded-full bg-(--halo) shadow-[inset_0_0_0_1.5px_var(--ink-2),0_0_0_2px_var(--halo)] rail:block" /> : null}
      {st.mark === 'done' ? <span aria-hidden className="absolute right-2 bottom-[5px] hidden size-3 place-items-center rounded-full bg-good text-bg shadow-[0_0_0_2px_var(--halo)] rail:grid"><Check className="size-2" strokeWidth={3} /></span> : null}
      <span className="sr-only">{st.sr}</span>
      <span aria-hidden className="tip-in pointer-events-none absolute left-16 z-50 hidden h-8 items-center gap-2 rounded-md bg-ink px-2.5 text-small whitespace-nowrap text-bg shadow-3 rail:group-focus-visible:flex rail:group-hover-fine:flex">
        {item.label}
        {st.tip ? <span className="opacity-70">· {st.tip}</span> : null}
      </span>
    </Link>
  )
}

/** Sync, theme and collapse. The button eases the width (200ms); ⌘\ does not (see globals.css, `data-sidebar-animate`). */
function SidebarFoot({ sync }: { sync: ReactNode }) {
  const [rail, setRail] = useSidebarRail()
  const toggle = () => {
    const html = document.documentElement
    html.dataset.sidebarAnimate = ''
    setRail(!rail)
    setTimeout(() => { delete html.dataset.sidebarAnimate }, 260)
  }
  return (
    <div className="mt-2 flex shrink-0 items-center gap-0.5 rail:flex-col rail:gap-1">
      <div className="mr-auto min-w-0 rail:mr-0">{sync}</div>
      <ThemeToggle />
      <button
        type="button"
        onClick={toggle}
        aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-keyshortcuts="Control+\ Meta+\"
        title={`${rail ? 'Expand' : 'Collapse'} sidebar (⌘\\)`}
        className="relative grid size-8 place-items-center rounded-sm text-ink-2 transition-[background-color,color,scale] duration-150 ease-out-quint after:absolute after:inset-[-4px] after:content-[''] hover-fine:bg-ink/[0.05] hover-fine:text-ink active:scale-96 focus-visible:outline-2 focus-visible:outline-pill"
      >
        {rail ? <PanelLeftOpen className="size-[18px]" strokeWidth={1.5} /> : <PanelLeftClose className="size-[18px]" strokeWidth={1.5} />}
      </button>
    </div>
  )
}
