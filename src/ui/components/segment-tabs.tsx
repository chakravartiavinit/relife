'use client'

import { usePathname, useRouter } from 'next/navigation'
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
 */
export function SegmentTabs({ tabs, label, className, pathname: given, onNavigate }: {
  tabs: SegmentTab[]; label: string; className?: string
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

  return (
    <nav aria-label={label} className={cn('max-w-full', className)}>
      <Tabs variant="pill" value={active?.href ?? ''} onValueChange={(href) => (onNavigate ? onNavigate(href) : router.push(href))} className="max-w-full">
        <TabsList
          wrapperClassName="max-w-full"
          className="gap-0 bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]"
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
              className="h-10 px-4 text-body font-medium text-ink-3 transition-colors duration-150 hover:text-ink [&_[data-tabs-label]]:text-ink"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </nav>
  )
}
