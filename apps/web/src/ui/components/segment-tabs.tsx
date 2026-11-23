'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/ui/beui/motion/tabs'
import { cn } from '../cn'

export type SegmentTab = { href: string; label: React.ReactNode; icon?: React.ReactNode }

/**
 * The pill tab row for route segments (Plan, Coach, You, every area): the active tab comes from the pathname,
 * a click goes to that tab's URL, and the pill glides between them. The tab body stays a server page, so the
 * layout above it never re-renders. 40px tall, scrolls sideways when it does not fit a phone.
 *
 * Reads the pathname, so a layout that renders it should wrap it in <Suspense> with a same-sized placeholder.
 * Query strings in `href` are sent along but ignored when picking the active tab.
 *
 * `variant="underline"` is the row under a page head (see `PageHeader`): plain text tabs on a hairline, the current
 * one in ink with a 2px underline. Nothing moves when the tab changes (colour only). The pill stays for switches
 * inside a card (filters, November / All time).
 */
export function SegmentTabs({ tabs, label, className, pathname: given, onNavigate, variant = 'pill' }: {
  tabs: SegmentTab[]; label: string; className?: string
  variant?: 'pill' | 'underline'
  /** For galleries and tests: pretend we are on this path, and call this instead of navigating. */
  pathname?: string; onNavigate?: (href: string) => void
}) {
  const current = usePathname()
  const pathname = given ?? current
  const router = useRouter()
  const path = (href: string) => href.split(/[?#]/)[0]
  // The longest matching prefix wins, so /plan is active on /plan itself and on /plan/goals/x, but not on /plan/routines.
  const active = tabs
    .filter((t) => pathname === path(t.href) || pathname.startsWith(`${path(t.href)}/`))
    .sort((a, b) => path(b.href).length - path(a.href).length)[0]

  if (variant === 'underline') {
    return (
      <nav aria-label={label} className={cn('flex max-w-full overflow-x-auto [scrollbar-width:none]', className)}>
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t === active ? 'page' : undefined}
            onClick={onNavigate ? (e) => { e.preventDefault(); onNavigate(t.href) } : undefined}
            className="relative inline-flex h-11 shrink-0 items-center px-3 text-body whitespace-nowrap text-ink-3 transition-colors duration-150 ease-out-quint hover-fine:text-ink active:text-ink aria-[current=page]:text-ink aria-[current=page]:shadow-[inset_0_-2px_0_var(--ink)] focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-pill"
          >
            {/* The current tab is medium weight; the same label, invisible and medium, holds the width so no neighbour shifts. */}
            <span className="inline-grid">
              <span aria-hidden className="invisible col-start-1 row-start-1 font-medium">{t.label}</span>
              <span className={cn('col-start-1 row-start-1', t === active && 'font-medium')}>{t.label}</span>
            </span>
          </Link>
        ))}
      </nav>
    )
  }

  return (
    <nav aria-label={label} className={cn('max-w-full', className)}>
      <Tabs variant="pill" value={active?.href ?? ''} onValueChange={(href) => (onNavigate ? onNavigate(href) : router.push(href))} className="max-w-full">
        <TabsList
          wrapperClassName="max-w-full"
          className="gap-0 bg-surface-2"
        >
          {tabs.map((t) => (
            <TabsTrigger
              key={t.href}
              value={t.href}
              icon={t.icon}
              aria-current={t === active ? 'page' : undefined}
              onPointerEnter={() => { if (!onNavigate) router.prefetch(t.href) }}
              onFocus={() => { if (!onNavigate) router.prefetch(t.href) }}
              indicatorClassName="bg-surface shadow-1"
              // The selected label is drawn twice (see tabs.tsx): the copy on top of the pill takes ink, not the default white.
              className="h-10 px-4 text-small font-medium text-ink-3 transition-colors duration-150 ease-out-quint hover:text-ink [&_[data-tabs-label]]:text-ink"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  )
}

/**
 * `SegmentTabs` for a server layout: the Suspense and the same-sized placeholder (the row with nothing selected)
 * are built in, so reading the pathname never blocks the layout's static shell.
 */
export function RouteTabs(props: { tabs: SegmentTab[]; label: string; className?: string; variant?: 'pill' | 'underline' }) {
  return (
    <Suspense fallback={<SegmentTabs {...props} pathname="" onNavigate={() => {}} />}>
      <SegmentTabs {...props} />
    </Suspense>
  )
}
