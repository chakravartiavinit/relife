'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Brain, Code, HeartPulse, Inbox, Menu, MonitorSmartphone, Palette, Cable, Repeat, Settings, Sparkles, Sunrise, Target, Trophy, Users, Wallet, type LucideIcon } from 'lucide-react'
import { Dialog } from './forms/dialog'
import { SystemLabel } from './card'
import { cn } from '../cn'

type Item = { href: string; label: string; icon: LucideIcon; color?: string; children?: { href: string; label: string }[] }

// Play (Today, Progress, Habits, Insights) · Areas. Setup pages sit in a small footer group.
export const NAV: { label?: string; items: Item[] }[] = [
  {
    items: [
      { href: '/', label: 'Today', icon: Sunrise },
      { href: '/goals', label: 'Goals', icon: Target },
      { href: '/profile', label: 'Progress', icon: Trophy },
      { href: '/habits', label: 'Habits', icon: Repeat },
      { href: '/insights', label: 'Coach', icon: Sparkles },
      { href: '/activity', label: 'Activity', icon: MonitorSmartphone },
    ],
  },
  {
    label: 'Areas',
    items: [
      { href: '/health', label: 'Health', icon: HeartPulse, color: 'var(--cat-health)' },
      { href: '/mind', label: 'Mind', icon: Brain, color: 'var(--cat-mind)' },
      { href: '/skills', label: 'Skills', icon: Code, color: 'var(--cat-skills)' },
      {
        href: '/wealth', label: 'Wealth', icon: Wallet, color: 'var(--cat-wealth)',
        children: [
          { href: '/wealth/spending', label: 'Spending' },
          { href: '/wealth/portfolio', label: 'Portfolio' },
          { href: '/wealth/subscriptions', label: 'Subscriptions' },
        ],
      },
      { href: '/hobbies', label: 'Hobbies', icon: Palette, color: 'var(--cat-hobbies)' },
      { href: '/relationships', label: 'People', icon: Users, color: 'var(--cat-relationships)' },
    ],
  },
]

export const SYSTEM_NAV: Item[] = [
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/connectors', label: 'Connectors', icon: Cable },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function isActive(path: string, href: string) {
  if (href === '/') return path === '/'
  // Trackers' detail pages belong to Habits.
  if (href === '/habits' && path.startsWith('/trackers')) return true
  if (href === '/profile' && path === '/overview') return true
  return path === href || path.startsWith(href + '/')
}

const AREA_HREF: Record<string, string> = { health: '/health', mind: '/mind', skills: '/skills', wealth: '/wealth', hobbies: '/hobbies', relationships: '/relationships' }

/** `areas` (from onboarding) hides the area pages the user didn't pick; empty shows all. */
export function Nav(props: { badges?: Record<string, number>; areas?: string[] }) {
  return <NavView {...props} path={usePathname()} />
}

/** Same rows with nothing marked active, for Suspense fallbacks (reading the URL there blocks prerendering). */
export function NavPlaceholder() {
  return <NavView path="" />
}

function NavView({ badges = {}, areas, path }: { badges?: Record<string, number>; areas?: string[]; path: string }) {
  const hidden = new Set(areas?.length ? Object.entries(AREA_HREF).filter(([c]) => !areas.includes(c)).map(([, h]) => h) : [])
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV.map((group, gi) => (
        <div key={gi} data-tour={group.label === 'Areas' ? 'areas' : undefined} className="flex flex-col gap-0.5">
          {group.label ? <div className="px-2.5 pb-2"><SystemLabel color="var(--ink-3)">{group.label}</SystemLabel></div> : null}
          {group.items.filter((item) => !hidden.has(item.href) || isActive(path, item.href)).map((item) => <NavRow key={item.href} item={item} path={path} badge={badges[item.href]} />)}
        </div>
      ))}
    </nav>
  )
}

function NavRow({ item, path, badge }: { item: Item; path: string; badge?: number }) {
  const active = isActive(path, item.href)
  const { icon: Icon, color } = item
  return (
    <div>
      <Link
        href={item.href}
        data-tour={item.href}
        aria-current={active && path === item.href ? 'page' : undefined}
        className={cn(
          'group relative flex h-10 items-center gap-2.5 rounded-md px-1.5 text-[14px] transition-[background-color,color,box-shadow] duration-150',
          active ? 'bg-surface font-medium text-ink shadow-1' : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink dark:hover:bg-white/[0.05]',
        )}
      >
        {/* 28px chip in a 40px row: 6px inset, so radius 12 - 6 = 6. */}
        <span
          aria-hidden
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-[6px] transition-[background-color,color] duration-150',
            !color && (active ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 group-hover:text-ink'),
          )}
          style={color ? { color, background: `color-mix(in oklch, ${color} ${active ? 18 : 12}%, transparent)` } : undefined}
        >
          <Icon className="size-[16px]" strokeWidth={active ? 2 : 1.5} />
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        {badge ? <Count n={badge} /> : null}
      </Link>
      {item.children ? (
        // Rows below slide down instead of jumping when the sub-pages open (grid 0fr to 1fr).
        <div className="nav-sub grid" data-open={active || undefined} inert={!active}>
          <div className="min-h-0 overflow-hidden">
            <div className="mt-1 mb-1.5 ml-[20px] flex flex-col gap-0.5 border-l border-divider pl-3.5">
              {item.children.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  aria-current={path === c.href ? 'page' : undefined}
                  className={cn(
                    'relative flex h-8 items-center rounded-sm px-2 text-[13px] transition-[background-color,color] duration-150',
                    path === c.href ? 'font-medium text-ink' : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink dark:hover:bg-white/[0.05]',
                  )}
                >
                  {path === c.href ? <span aria-hidden className="absolute top-1.5 bottom-1.5 -left-[16px] w-[3px] rounded-full" style={{ background: color }} /> : null}
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="mr-1 min-w-5 rounded-full bg-pill-wash px-1.5 text-center text-[11px] leading-5 font-medium text-pill-ink tabular-nums">{n}</span>
}

/** Setup pages: quieter rows above the profile. */
export function SystemNav(props: { badges?: Record<string, number> }) {
  return <SystemNavView {...props} path={usePathname()} />
}

export function SystemNavPlaceholder() {
  return <SystemNavView path="" />
}

function SystemNavView({ badges = {}, path }: { badges?: Record<string, number>; path: string }) {
  return (
    <nav aria-label="Setup" className="grid grid-cols-3 gap-0.5">
      {SYSTEM_NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(path, href)
        const n = badges[href]
        return (
          <Link
            key={href}
            href={href}
            data-tour={href}
            aria-current={active ? 'page' : undefined}
            aria-label={n ? `${label}, ${n} to review` : undefined}
            className={cn(
              'relative flex h-[52px] flex-col items-center justify-center gap-1 rounded-md text-[11px] tracking-[-0.01em] transition-[background-color,color,scale] duration-150 ease-[var(--ease-out-quint)] active:scale-[0.96]',
              active ? 'bg-surface font-medium text-ink shadow-1' : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink dark:hover:bg-white/[0.05]',
            )}
          >
            <Icon className="size-4" strokeWidth={active ? 2 : 1.5} aria-hidden />
            <span className="max-w-full truncate">{label}</span>
            {n ? <span aria-hidden className="absolute top-1.5 left-[calc(50%+4px)] min-w-4 rounded-full bg-ink px-1 text-center text-[10px] leading-4 font-semibold text-bg tabular-nums shadow-[0_0_0_2px_var(--glass)]">{n > 99 ? '99+' : n}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}

const TABS = ['/', '/profile', '/habits', '/insights']

/** Bottom tab bar for phones: the four daily pages plus a menu with everything else. */
export function TabBar() {
  const path = usePathname()
  const [menu, setMenu] = useState(false)
  const all = NAV.flatMap((g) => g.items)
  const tabs = TABS.map((h) => all.find((i) => i.href === h)!)
  const inMenu = !tabs.some((t) => isActive(path, t.href))
  return (
    <>
      <nav aria-label="Tabs" className="fixed inset-x-3 bottom-3 z-40 rounded-xl bg-glass pb-[env(safe-area-inset-bottom)] shadow-2 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          {tabs.map((t) => {
            const active = isActive(path, t.href)
            const Icon = t.icon
            return (
              <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
                className={cn('flex h-14 w-16 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-150', active ? 'text-ink' : 'text-ink-3')}>
                <Icon className="size-5" strokeWidth={active ? 2 : 1.5} />
                {t.label}
              </Link>
            )
          })}
          <button type="button" onClick={() => setMenu(true)} aria-haspopup="dialog"
            className={cn('flex h-14 w-16 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-150', inMenu ? 'text-ink' : 'text-ink-3')}>
            <Menu className="size-5" strokeWidth={inMenu ? 2 : 1.5} />
            Menu
          </button>
        </div>
      </nav>
      <Dialog open={menu} onClose={() => setMenu(false)} title="Menu" width="max-w-[420px]">
        <div onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMenu(false) }} className="flex flex-col gap-5">
          <Nav />
          <div className="border-t border-divider pt-3"><SystemNav /></div>
        </div>
      </Dialog>
    </>
  )
}
