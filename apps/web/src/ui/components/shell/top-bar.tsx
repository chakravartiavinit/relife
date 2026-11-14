'use client'

import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { trail } from '@/domain/routes'
import { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/ui/beui/motion/breadcrumb'
import { openCapture, prefetchCapture } from '../capture/capture-data'
import { Wordmark } from '../logo'

// Top bar. Laptop (≥ lg): sticky, 72px, left the breadcrumb, centre the Capture field, right the status trio
// (sync, Coach bell, level avatar). Phone: 56px, wordmark and the two status pieces; it scrolls away.
// Columns share the room 1.2 : 2 : 1 (Capture stops at 520px, the status trio never goes under its own width), so the breadcrumb gets a column
// to itself and never runs into the Capture field; what does not fit it folds (see Crumbs).
// Status pieces arrive as slots, each in its own Suspense island (shell-status.tsx).

/** Stays 72px (`--topbar-h`, which also sets where the Sheet panel starts). */
export function TopBar({ date, sync, bell, avatar }: { date: ReactNode; sync: ReactNode; bell: ReactNode; avatar: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 hidden h-[var(--topbar-h)] grid-cols-[minmax(0,1.2fr)_minmax(200px,2fr)_minmax(min-content,1fr)] items-center gap-6 bg-[color-mix(in_oklch,var(--bg)_86%,transparent)] pr-10 pl-7 backdrop-blur-md lg:grid">
      <Suspense fallback={null}><Crumbs date={date} /></Suspense>
      <div className="flex min-w-0 justify-center"><CaptureField /></div>
      <div className="flex items-center justify-end gap-1">{sync}{bell}{avatar}</div>
    </header>
  )
}

/** Phone: wordmark → Today on the left, sync dot and the avatar (→ You) on the right. `extra` is the mock badge. */
export function PhoneTopBar({ sync, avatar, extra }: { sync: ReactNode; avatar: ReactNode; extra?: ReactNode }) {
  return (
    <header className="flex h-14 items-center justify-between lg:hidden">
      <Link href="/" aria-label={`${brand.name}, Today`} className="relative rounded-sm after:absolute after:inset-[-6px] after:content-[''] focus-visible:outline-2 focus-visible:outline-pill"><Wordmark className="h-7" /></Link>
      <div className="-mr-2 flex items-center">{extra}{sync}{avatar}</div>
    </header>
  )
}

/**
 * Today shows the date next to its name; deeper pages show where you are: Life › Wealth › Spending. The page you are on is the
 * crumb that matters, so it is never squeezed to fit: when the left column is short the trail gives up its other crumbs in steps,
 * `You › Settings › Devices › Phone` → `You › … › Phone` → `… › Phone` → `Phone`, and only the last step lets the name truncate.
 * The hidden crumbs stay one hover or tap away in the `…`. The step is the first one whose trail fits the column, found after
 * layout and before paint, and again when the column or the page changes.
 */
const LAST_STEP = 3

function Crumbs({ date }: { date: ReactNode }) {
  const path = usePathname()
  const crumbs = trail(path)
  const last = crumbs.at(-1)
  const box = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)
  const [fit, setFit] = useState({ key: '', step: 0 })
  const key = `${path}|${room}`
  const step = fit.key === key ? fit.step : 0

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setRoom(Math.round(el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    const ol = box.current?.querySelector('ol')
    if (!ol || step >= LAST_STEP) return
    // Only crumbs that take room: one leaving the page is already out of the flow.
    const right = Math.max(0, ...[...ol.children].filter((c) => getComputedStyle(c).position !== 'absolute').map((c) => (c as HTMLElement).offsetLeft + (c as HTMLElement).offsetWidth))
    if (right > ol.clientWidth) setFit({ key, step: step + 1 })
  }, [key, step])

  if (!last) return <div ref={box} className="min-w-0" />
  const n = crumbs.length
  const link = (c: (typeof crumbs)[number], i: number) => (
    <BreadcrumbItem key={c.path} className="shrink-0">
      {i > 0 ? <BreadcrumbSeparator /> : null}
      <BreadcrumbLink href={c.path} render={(p) => <Link {...p} href={c.path} />} className="text-ink-3">{c.label}</BreadcrumbLink>
    </BreadcrumbItem>
  )
  const page = (i: number) => (
    <BreadcrumbItem key={last.path} className={step === LAST_STEP ? 'min-w-0' : 'shrink-0'}>
      {i > 0 ? <BreadcrumbSeparator /> : null}
      <BreadcrumbPage className="block truncate text-heading">{last.label}</BreadcrumbPage>
    </BreadcrumbItem>
  )
  // What each step shows: the crumbs from `keep` on stay, the ones before `hide` fold into the `…`.
  const hidden = step === 0 || n < 2 ? 0 : step === 1 ? (n > 2 ? n - 2 : 0) : n - 1
  const items = step === LAST_STEP ? [page(0)] : step === 0 || hidden === 0 ? crumbs.map((c, i) => (c === last ? page(i) : link(c, i))) : [
    ...(step === 1 ? [link(crumbs[0], 0)] : []),
    <BreadcrumbItem key="breadcrumb-overflow">
      {step === 1 ? <BreadcrumbSeparator /> : null}
      <BreadcrumbEllipsis>{crumbs.slice(step === 1 ? 1 : 0, -1).map((c, i) => link(c, step === 1 ? i + 1 : i))}</BreadcrumbEllipsis>
    </BreadcrumbItem>,
    page(1),
  ]
  return (
    <div ref={box} className="min-w-0">
      <Breadcrumb>
        <BreadcrumbList maxItems={step === 0 ? 4 : Infinity} className="flex-nowrap overflow-hidden text-body">
          {items}
          {path === '/' && date ? <li className="ml-2 text-small whitespace-nowrap text-ink-3 tabular-nums">{date}</li> : null}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}

/**
 * The one visible "do anything" entry: a button styled as a field. Click, ⌘K, or just typing opens Capture, and the
 * first character typed carries into its input. 520px, 44px tall, 40px+ hit area. Hovering or focusing it starts
 * fetching Capture's suggestions.
 */
function CaptureField() {
  return (
    <button
      type="button"
      data-tour="command"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => openCapture()}
      onPointerEnter={prefetchCapture}
      onFocus={prefetchCapture}
      onKeyDown={(e) => { if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== ' ') { e.preventDefault(); openCapture(e.key) } }}
      className="flex h-11 w-full max-w-[520px] items-center gap-2.5 rounded-full bg-surface pr-2 pl-4 text-left text-body text-ink-3 shadow-1 transition-[box-shadow,color] duration-150 ease-out-quint hover:text-ink-2 hover:shadow-2 focus-visible:outline-2 focus-visible:outline-pill"
    >
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-bg"><Plus className="size-4" strokeWidth={2} /></span>
      <span className="flex-1 truncate">Log, check off or ask…</span>
      <kbd className="rounded-xs bg-surface-2 px-1.5 text-caption leading-5 font-medium text-ink-3 shadow-[inset_0_0_0_1px_var(--hairline)]">⌘K</kbd>
    </button>
  )
}
