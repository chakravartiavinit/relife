'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useEffect, type ReactNode } from 'react'
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import {
  AnimatedSidebar, AnimatedSidebarMenu, AnimatedSidebarMenuButton, AnimatedSidebarMenuItem, AnimatedSidebarProvider, useAnimatedSidebar,
} from '@/ui/beui/motion/animated-sidebar'
import type { Category } from '@/db/schema'
import type { AreaToday } from '@/domain/shell'
import { cn } from '../../cn'
import { CapsuleMark, Wordmark } from '../logo'
import { ThemeToggle } from '../theme-toggle'
import { AREA_HREF, isActive, LIFE_CHILDREN, LIFE_HUB, NAV, visibleLifeChildren, type NavItem } from '../nav'
import { useLifeOpen, useSidebarRail } from './sidebar-state'

// Desktop sidebar (≥ lg): 240px, or a 72px icon rail. The choice is remembered (shell/sidebar-state.ts) and drawn from
// <html data-sidebar> before paint. Built on beUI animated-sidebar; the phone has the tab bar instead.
// The status pieces (Coach count, area dots) arrive as slots, each in its own Suspense island from shell-status.tsx.

/** Wraps the page: holds the collapsed state, ⌘\ toggles it. */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [rail, setRail] = useSidebarRail()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setRail(!rail) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rail, setRail])
  // Once the first load has settled, hand the width back to the spring (see "Sidebar, before hydration" in globals.css).
  useEffect(() => {
    const t = setTimeout(() => { document.documentElement.dataset.sidebarReady = '' }, 800)
    return () => clearTimeout(t)
  }, [])
  return (
    <AnimatedSidebarProvider
      open={!rail}
      onOpenChange={(open) => setRail(!open)}
      className="mx-auto min-h-dvh max-w-[1480px]"
      style={{ '--sidebar-width': '240px', '--sidebar-width-icon': '72px' }}
    >
      {children}
    </AnimatedSidebarProvider>
  )
}

type Slots = {
  /** Shown in the Coach row when expanded: the count pill. */
  coachBadge: ReactNode
  /** Shown on the Coach icon in the rail: a dot instead of the number. */
  coachDot: ReactNode
  /** The Life group's children: the area list and, in the rail, the stacked dots. */
  areas: ReactNode
  /** The Mock-mode badge, only present in mock mode. */
  mock?: ReactNode
}

export function Sidebar(slots: Slots) {
  return (
    // `lg:flex` so the aside stretches to the page's height and its sticky panel can stay in view while the page scrolls.
    <div className="hidden shrink-0 lg:flex">
      <AnimatedSidebar mobile={false} collapsible="icon" ariaLabel="Main" panelClassName="bg-transparent p-3">
        {/* Floating glass panel: radius 24 with 12px padding, so rows inside use 12. */}
        <div className="flex h-full min-h-0 flex-col gap-4 rounded-xl bg-glass px-3 py-4 shadow-1 backdrop-blur-xl rail:px-1">
          <div className="flex h-10 shrink-0 items-center px-2 rail:justify-center rail:px-0">
            <Link href="/" aria-label="ReLife, Today" className="relative rounded-sm after:absolute after:inset-[-4px] after:content-[''] focus-visible:outline-2 focus-visible:outline-pill">
              <Wordmark className="h-[30px] rail:hidden" />
              <CapsuleMark className="hidden size-9 rail:block" />
            </Link>
          </div>
          {slots.mock ? <div className="rail:hidden">{slots.mock}</div> : null}
          <div className="scroll-fade -mx-1 -my-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 py-2">
            {/* Active states read the pathname, so the first paint is the same rows with nothing marked. */}
            <Suspense fallback={<SidebarNav {...slots} path="" />}><SidebarNavLive {...slots} /></Suspense>
          </div>
          <SidebarFoot />
        </div>
      </AnimatedSidebar>
    </div>
  )
}

function SidebarNavLive(slots: Slots) {
  return <SidebarNav {...slots} path={usePathname()} />
}

const rowClass = (active: boolean, here = false) =>
  cn('min-h-10 gap-3 px-2.5 text-body', active ? 'font-semibold text-ink' : here ? 'text-ink' : 'text-ink-2 hover:text-ink')

function SidebarNav({ coachBadge, coachDot, areas, path }: Slots & { path: string }) {
  const item = (href: string) => NAV.flatMap((g) => g.items).find((i) => i.href === href)!
  const [today, plan, coach, you] = ['/', '/plan', '/coach', '/you'].map(item)
  const onLifeChild = LIFE_CHILDREN.some((c) => isActive(path, c.href))
  const row = (i: NavItem, active = isActive(path, i.href)) => (
    <AnimatedSidebarMenuButton
      href={i.href}
      isActive={active}
      icon={<i.icon className={cn('size-5', active && 'text-pill-ink')} strokeWidth={active ? 2 : 1.5} />}
      className={rowClass(active)}
    >
      {i.label}
    </AnimatedSidebarMenuButton>
  )
  return (
    <nav aria-label="Main" className="w-full">
      <AnimatedSidebarMenu>
        <AnimatedSidebarMenuItem data-tour="/" className="rounded-md">{row(today)}</AnimatedSidebarMenuItem>
        <AnimatedSidebarMenuItem data-tour="areas" className="rounded-md">
          <LifeRow path={path} here={onLifeChild} />
          {areas}
        </AnimatedSidebarMenuItem>
        <AnimatedSidebarMenuItem className="rounded-md">{row(plan)}</AnimatedSidebarMenuItem>
        <AnimatedSidebarMenuItem className="rounded-md">
          <AnimatedSidebarMenuButton
            href={coach.href}
            isActive={isActive(path, coach.href)}
            icon={<coach.icon className={cn('size-5', isActive(path, coach.href) && 'text-pill-ink')} strokeWidth={isActive(path, coach.href) ? 2 : 1.5} />}
            badge={coachBadge}
            className={rowClass(isActive(path, coach.href))}
          >
            {coach.label}
          </AnimatedSidebarMenuButton>
          <span className="pointer-events-none absolute top-1.5 right-2 z-20 hidden rail:block">{coachDot}</span>
        </AnimatedSidebarMenuItem>
        <AnimatedSidebarMenuItem data-tour="/you" className="rounded-md">{row(you)}</AnimatedSidebarMenuItem>
      </AnimatedSidebarMenu>
    </nav>
  )
}

/** Life opens the hub; the chevron folds the area list underneath (remembered). Hidden in the rail. */
function LifeRow({ path, here }: { path: string; here: boolean }) {
  const [open, setOpen] = useLifeOpen()
  const active = path === LIFE_HUB.href
  return (
    <div className="relative">
      <AnimatedSidebarMenuButton
        href={LIFE_HUB.href}
        isActive={active}
        icon={<LIFE_HUB.icon className={cn('size-5', active && 'text-pill-ink')} strokeWidth={active ? 2 : 1.5} />}
        className={cn(rowClass(active, here), 'pr-11')}
      >
        Life
      </AnimatedSidebarMenuButton>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Hide the areas under Life' : 'Show the areas under Life'}
        onClick={() => setOpen(!open)}
        className="absolute top-0 right-0 z-20 grid size-10 place-items-center rounded-md text-ink-3 transition-[color,scale] duration-150 ease-out-quint hover:text-ink active:scale-96 focus-visible:outline-2 focus-visible:outline-pill rail:hidden"
      >
        <ChevronDown className={cn('size-4 transition-transform duration-150 ease-out-quint', !open && '-rotate-90')} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  )
}

const CATEGORY_OF: Record<string, Category> = Object.fromEntries(Object.entries(AREA_HREF).map(([c, h]) => [h, c as Category]))

const STATUS_TEXT: Record<AreaToday, string> = { done: 'done today', due: 'something due today', none: 'nothing due today' }

/** One 6px dot in the area's colour: filled = all due done, ring = something due, faint = nothing due today. */
function AreaDot({ color, status }: { color?: string; status?: AreaToday }) {
  return (
    <>
      <span
        aria-hidden
        className={cn('size-1.5 shrink-0 rounded-full', status === 'none' && 'opacity-30')}
        style={{ '--c': color, background: status === 'due' ? 'transparent' : 'var(--c)', boxShadow: status === 'due' ? 'inset 0 0 0 1.5px var(--c)' : undefined } as React.CSSProperties}
      />
      {status ? <span className="sr-only">, {STATUS_TEXT[status]}</span> : null}
    </>
  )
}

/** The areas under Life (and Time): a list when expanded, stacked dots in the rail. Reads the pathname. */
export function AreaLinks(props: { areas?: string[]; today?: Record<Category, AreaToday> }) {
  return <AreaLinksView {...props} path={usePathname()} />
}

/** The same links with nothing marked and no status, for Suspense fallbacks. */
export function AreaLinksPlaceholder() {
  return <AreaLinksView path="" />
}

function AreaLinksView({ areas, today, path }: { areas?: string[]; today?: Record<Category, AreaToday>; path: string }) {
  const [open] = useLifeOpen()
  const { open: expanded } = useAnimatedSidebar()
  const kids = visibleLifeChildren(areas, path)
  const status = (href: string) => (CATEGORY_OF[href] ? today?.[CATEGORY_OF[href]] : undefined)
  return (
    <>
      <div className="nav-sub grid rail:hidden" data-open>
        <div className="min-h-0 overflow-hidden">
          <ul inert={!open || !expanded} className="mt-0.5 mb-1.5 ml-[21px] flex flex-col border-l border-divider pl-3">
            {kids.map((k) => {
              const active = isActive(path, k.href)
              return (
                <li key={k.href}>
                  <Link
                    href={k.href}
                    aria-current={path === k.href ? 'page' : undefined}
                    className={cn(
                      'relative flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-small transition-[background-color,color,box-shadow] duration-150 ease-out-quint after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""] focus-visible:outline-2 focus-visible:outline-pill',
                      active ? 'bg-surface font-medium text-ink shadow-1' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <AreaDot color={k.color} status={status(k.href)} />
                    {k.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      {/* Rail: the same destinations as dots under the Life icon, each a link (name on hover). */}
      <div className="mb-1 hidden flex-col items-center pt-1 rail:flex">
        {kids.map((k) => (
          <Link
            key={k.href}
            href={k.href}
            title={k.label}
            aria-current={path === k.href ? 'page' : undefined}
            className={cn(
              'grid size-10 place-items-center rounded-md transition-[background-color] duration-150 ease-out-quint focus-visible:outline-2 focus-visible:outline-pill',
              isActive(path, k.href) ? 'bg-surface shadow-1' : 'hover:bg-surface-2',
            )}
          >
            <AreaDot color={k.color} status={status(k.href)} />
            <span className="sr-only">{k.label}</span>
          </Link>
        ))}
      </div>
    </>
  )
}

function SidebarFoot() {
  const { open, toggleSidebar } = useAnimatedSidebar()
  return (
    <div className="flex shrink-0 items-center justify-between px-0.5 rail:flex-col rail:gap-1 rail:px-0">
      <ThemeToggle />
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-keyshortcuts="Control+\ Meta+\"
        title={`${open ? 'Collapse' : 'Expand'} sidebar (⌘\\)`}
        className="relative grid size-8 place-items-center rounded-md text-ink-2 transition-[background-color,color,scale] duration-150 ease-out-quint after:absolute after:inset-[-4px] after:content-[''] hover:bg-surface-2 hover:text-ink active:scale-96 focus-visible:outline-2 focus-visible:outline-pill"
      >
        {open ? <PanelLeftClose className="size-[18px]" strokeWidth={1.5} /> : <PanelLeftOpen className="size-[18px]" strokeWidth={1.5} />}
      </button>
    </div>
  )
}
