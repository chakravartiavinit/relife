'use client'

import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { trail } from '@/domain/routes'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/ui/beui/motion/breadcrumb'
import { openCapture, prefetchCapture } from '../capture/capture-data'
import { Wordmark } from '../logo'

// Top bar. Laptop (≥ lg): sticky, 72px, left the breadcrumb, centre the Capture field, right the status trio
// (sync, Coach bell, level avatar). Phone: 56px, wordmark and the two status pieces; it scrolls away.
// The breadcrumb never runs into the Capture field: the left column can shrink to nothing, the last crumb truncates and the rest keep their size.
// Status pieces arrive as slots, each in its own Suspense island (shell-status.tsx).

/** Stays 72px (`--topbar-h`, which also sets where the Sheet panel starts). */
export function TopBar({ date, sync, bell, avatar }: { date: ReactNode; sync: ReactNode; bell: ReactNode; avatar: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 hidden h-[var(--topbar-h)] grid-cols-[minmax(0,1fr)_minmax(0,520px)_minmax(0,1fr)] items-center gap-6 bg-[color-mix(in_oklch,var(--bg)_86%,transparent)] pr-10 pl-7 backdrop-blur-md lg:grid">
      <Suspense fallback={null}><Crumbs date={date} /></Suspense>
      <CaptureField />
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

/** Today shows the date next to its name; deeper pages show where you are: Life › Wealth › Spending. */
function Crumbs({ date }: { date: ReactNode }) {
  const path = usePathname()
  const crumbs = trail(path)
  const last = crumbs.at(-1)
  if (!last) return <div />
  return (
    <Breadcrumb className="max-w-full justify-self-start">
      <BreadcrumbList maxItems={4} className="flex-nowrap overflow-hidden text-body">
        {crumbs.map((c, i) => (
          <BreadcrumbItem key={c.path} className={c === last ? 'min-w-0' : 'shrink-0'}>
            {i > 0 ? <BreadcrumbSeparator /> : null}
            {c === last ? (
              <BreadcrumbPage className="block truncate text-heading">{c.label}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink href={c.path} render={(p) => <Link {...p} href={c.path} />} className="text-ink-3">{c.label}</BreadcrumbLink>
            )}
          </BreadcrumbItem>
        ))}
        {path === '/' && date ? <li className="ml-2 text-small whitespace-nowrap text-ink-3 tabular-nums">{date}</li> : null}
      </BreadcrumbList>
    </Breadcrumb>
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
      className="flex h-11 w-full items-center gap-2.5 rounded-full bg-surface pr-2 pl-4 text-left text-body text-ink-3 shadow-1 transition-[box-shadow,color] duration-150 ease-out-quint hover:text-ink-2 hover:shadow-2 focus-visible:outline-2 focus-visible:outline-pill"
    >
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-bg"><Plus className="size-4" strokeWidth={2} /></span>
      <span className="flex-1 truncate">Log, check off or ask…</span>
      <kbd className="rounded-xs bg-surface-2 px-1.5 text-caption leading-5 font-medium text-ink-3 shadow-[inset_0_0_0_1px_var(--hairline)]">⌘K</kbd>
    </button>
  )
}
