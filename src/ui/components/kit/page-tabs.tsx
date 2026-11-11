import Link from 'next/link'
import { cn } from '../../cn'

export type PageTab = { href: string; label: string; count?: number | string }

/**
 * Tabs under a hero. `route`: each tab is its own page, so the page passes `current` (no usePathname).
 * `jump`: in-page anchors (`#sleep`), labelled "On this page", the first one marked. Scrolls sideways on phones.
 */
export function PageTabs({ label, current, items, mode = 'route' }: { label?: string; current: string; items: PageTab[]; mode?: 'route' | 'jump' }) {
  return (
    <nav aria-label={mode === 'jump' ? 'On this page' : label} className="flex h-12 gap-6 overflow-x-auto [scrollbar-width:none]">
      {items.map((t, i) => {
        const active = mode === 'jump' ? i === 0 : current === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active && mode === 'route' ? 'page' : undefined}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-2 text-[13px] leading-5 font-medium whitespace-nowrap transition-[color] duration-150',
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
              active && "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent after:content-['']",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="font-mono text-[12px] font-normal text-ink-3">{t.count}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
