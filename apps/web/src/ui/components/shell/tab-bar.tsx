'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CircleCheck, Plus } from 'lucide-react'
import { closed, type NavStatus } from '@/domain/shell'
import { cn } from '../../cn'
import { openCapture, prefetchCapture } from '../capture/capture-data'
import { isActive, LIFE_CHILDREN, LIFE_HUB, NAV, visibleLifeChildren, type NavItem } from '../nav'
import { CountPill } from './count-pill'
import { rowStatus } from './nav-status'

// Phone tab bar: Today, Life, a raised ink + (Capture), Plan, Coach with its count; each a 3D picture over its name. Life
// opens a tray (Overview, the six areas with today's state, Time) that grows from the Life tab. You is the avatar in the
// top bar. Status arrives as `NavStatus` from a Suspense island (shell-status.tsx); until it does the tabs are just names.

const ALL = NAV.flatMap((g) => g.items)
const tab = (href: string) => ALL.find((i) => i.href === href)!
const LEFT = [tab('/'), { ...LIFE_HUB, label: 'Life' }]
const RIGHT = [tab('/plan'), tab('/coach')]

/** Goes in a Suspense island (its fallback is `<TabBarFallback />`), since it reads the pathname. */
export function TabBar(props: { areas?: string[]; status?: NavStatus }) {
  return <TabBarView {...props} path={usePathname()} />
}

export function TabBarFallback() {
  return <TabBarView path="" />
}

function Picture({ src, className }: { src?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small local PNG
  return src ? <img src={src} alt="" width={26} height={26} className={cn('size-[26px] outline-none', className)} /> : null
}

/**
 * The bar for a given path and status (the live one above reads the pathname). `demo` draws it inside a `relative` box
 * instead of pinning it to the window, and can start with the tray open: /dev/ui uses both.
 */
export function TabBarView({ areas, status, path, demo }: { areas?: string[]; status?: NavStatus; path: string; demo?: { open?: boolean } }) {
  // The tray belongs to the page it was opened on: going anywhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(demo?.open ? path : null)
  const pin = demo ? 'absolute' : 'fixed lg:hidden'
  const open = openOn === path
  const tabRef = useRef<HTMLButtonElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  // Focus goes into the tray when it opens and back to the Life tab when it is dismissed (not when a row was followed).
  const refocus = useRef(false)
  const wasOpen = useRef(!!demo?.open)
  const dismiss = () => { refocus.current = true; setOpenOn(null) }
  const close = () => setOpenOn(null)
  useEffect(() => {
    if (open === wasOpen.current) return
    wasOpen.current = open
    if (open) trayRef.current?.querySelector('a')?.focus()
    else if (refocus.current) tabRef.current?.focus()
    refocus.current = false
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // The Life tab stands for the hub, every area page and Time.
  const onLife = [LIFE_HUB, ...LIFE_CHILDREN].some((i) => isActive(path, i.href))
  const ind = 'relative grid h-8 w-14 place-items-center rounded-full transition-[background-color,scale] duration-150 ease-out-quint group-active:scale-96'
  const label = (current: boolean) => cn('group flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-caption font-medium transition-colors duration-150 ease-out-quint focus-visible:outline-2 focus-visible:outline-pill touch-manipulation', current ? 'text-ink' : 'text-ink-3')

  const link = (t: NavItem) => {
    const active = isActive(path, t.href)
    const st = rowStatus(t.href, status)
    return (
      <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={label(active)}>
        <span className={cn(ind, active && !open && 'bg-surface-3')}>
          <Picture src={t.picture} />
          {st.count ? <CountPill n={st.count} className="absolute -top-[3px] left-[34px] h-[18px] min-w-[18px] px-1 text-label shadow-[0_0_0_2px_var(--bg)]" /> : null}
        </span>
        {t.label}
        <span className="sr-only">{st.sr}</span>
      </Link>
    )
  }
  const [today, plan, coach] = [LEFT[0], RIGHT[0], RIGHT[1]]
  const life = LEFT[1]
  return (
    <>
      <nav
        aria-label="Tabs"
        className={cn(pin, 'inset-x-0 bottom-0 z-40 grid h-[var(--tabbar-h)] grid-cols-5 items-start px-2 pt-1.5 bg-glass shadow-[inset_0_1px_0_var(--hairline)] backdrop-blur-xl')}
      >
        {link(today)}
        <button
          type="button"
          id="life-tab"
          ref={tabRef}
          aria-current={onLife ? 'page' : undefined}
          aria-expanded={open}
          aria-controls="life-tray"
          onClick={() => setOpenOn(open ? null : path)}
          className={label(onLife || open)}
        >
          <span className={cn(ind, (open || onLife) && 'bg-surface-3')}>
            <Picture src={life.picture} />
          </span>
          {life.label}
        </button>
        <button
          type="button"
          aria-label="Capture: log, check off or ask"
          aria-haspopup="dialog"
          onClick={() => openCapture()}
          onPointerEnter={prefetchCapture}
          onFocus={prefetchCapture}
          onTouchStart={prefetchCapture}
          className="group relative flex h-14 -translate-y-3.5 items-center justify-center focus-visible:outline-none touch-manipulation"
        >
          <span className="grid size-14 place-items-center rounded-full bg-ink text-bg shadow-[0_0_0_4px_var(--bg),var(--elev-2)] transition-[scale] duration-150 ease-out-quint group-active:scale-96 group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-pill">
            <Plus className="size-7" strokeWidth={1.5} aria-hidden />
          </span>
        </button>
        {link(plan)}
        {link(coach)}
      </nav>
      {/* After the nav, so a screen reader reads the tray where the Life tab opened it. */}
      {open ? <button type="button" aria-label="Close Life" tabIndex={-1} onClick={dismiss} className={cn(pin, 'inset-0 z-30 bg-scrim')} /> : null}
      {open ? <LifeTray ref={trayRef} path={path} areas={areas} status={status} onNavigate={close} pin={pin} /> : null}
    </>
  )
}

/** Overview, the areas the user picked with today's state, then Time. Grows from the Life tab (200ms; shown in place under reduced motion). */
function LifeTray({ ref, path, areas, status, onNavigate, pin }: { ref: React.Ref<HTMLDivElement>; path: string; areas?: string[]; status?: NavStatus; onNavigate: () => void; pin: string }) {
  const kids = visibleLifeChildren(areas, path)
  const row = (i: NavItem) => {
    const active = isActive(path, i.href)
    const st = rowStatus(i.href, status)
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        className={cn(
          'grid h-12 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-3 text-heading font-normal text-ink transition-colors duration-150 ease-out-quint focus-visible:outline-2 focus-visible:outline-pill touch-manipulation',
          active ? 'bg-surface-2 font-medium' : 'active:bg-surface-2',
        )}
      >
        <Picture src={i.picture} />
        <span className="truncate">{i.label === 'Overview' ? 'Life overview' : i.label}</span>
        {st.text || st.done ? (
          <span className={cn('flex items-center gap-1.5 text-body tabular-nums', st.done ? 'text-good' : 'text-ink-3')}>
            {st.done ? <CircleCheck className="size-[18px]" strokeWidth={1.5} aria-hidden /> : null}
            {st.done ? 'Done' : st.text}
          </span>
        ) : null}
        <span className="sr-only">{st.sr}</span>
      </Link>
    )
  }
  const rule = <div role="separator" className="mx-3 my-1 h-px bg-divider" />
  const { today } = status ?? {}
  return (
    <div ref={ref} id="life-tray" role="region" aria-label="Life" className={cn(pin, 'tray-in inset-x-3 bottom-[calc(var(--tabbar-h)+16px)] z-40 rounded-xl bg-surface p-1.5 shadow-3')}>
      <div className="flex h-9 items-center justify-between px-3 text-small font-medium text-ink-3">
        <span>Life</span>
        {today?.total ? <span className="font-normal tabular-nums">{closed(today)} of {today.total} {today.skipped ? 'done or skipped' : 'done'} today</span> : null}
      </div>
      {row(LIFE_HUB)}
      {rule}
      {kids.filter((k) => k.href !== '/time').map(row)}
      {kids.some((k) => k.href === '/time') ? <>{rule}{row(kids.find((k) => k.href === '/time')!)}</> : null}
    </div>
  )
}
