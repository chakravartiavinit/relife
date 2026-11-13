'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Brain, Code, HeartPulse, LayoutGrid, MonitorSmartphone, Palette, Sparkles, Sunrise, Target, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react'
import { SystemLabel } from './card'
import { cn } from '../cn'

export type NavItem = { href: string; label: string; icon: LucideIcon; color?: string }

// Today · Life (hub, six areas, Time) · Plan, Coach, You. Plan, Coach and You hold their own tabs.
export const NAV: { label?: string; items: NavItem[] }[] = [
  { items: [{ href: '/', label: 'Today', icon: Sunrise }] },
  {
    label: 'Life',
    items: [
      { href: '/life', label: 'Overview', icon: LayoutGrid },
      { href: '/health', label: 'Health', icon: HeartPulse, color: 'var(--cat-health)' },
      { href: '/mind', label: 'Mind', icon: Brain, color: 'var(--cat-mind)' },
      { href: '/skills', label: 'Skills', icon: Code, color: 'var(--cat-skills)' },
      { href: '/wealth', label: 'Wealth', icon: Wallet, color: 'var(--cat-wealth)' },
      { href: '/hobbies', label: 'Hobbies', icon: Palette, color: 'var(--cat-hobbies)' },
      { href: '/people', label: 'People', icon: Users, color: 'var(--cat-relationships)' },
      { href: '/time', label: 'Time', icon: MonitorSmartphone, color: 'var(--line-blue)' },
    ],
  },
  {
    items: [
      { href: '/plan', label: 'Plan', icon: Target },
      { href: '/coach', label: 'Coach', icon: Sparkles },
      { href: '/you', label: 'You', icon: UserRound },
    ],
  },
]

function isActive(path: string, href: string) {
  if (href === '/') return path === '/'
  return path === href || path.startsWith(href + '/')
}

/** Area pages the user did not pick in setup stay out of the list (until you are on one). Time is not an area. */
const AREA_HREF: Record<string, string> = { health: '/health', mind: '/mind', skills: '/skills', wealth: '/wealth', hobbies: '/hobbies', relationships: '/people' }

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
        <div key={gi} data-tour={group.label === 'Life' ? 'areas' : undefined} className="flex flex-col gap-0.5">
          {group.label ? <div className="px-2.5 pb-2"><SystemLabel color="var(--ink-3)">{group.label}</SystemLabel></div> : null}
          {group.items.filter((item) => !hidden.has(item.href) || isActive(path, item.href)).map((item) => <NavRow key={item.href} item={item} path={path} badge={badges[item.href]} />)}
        </div>
      ))}
    </nav>
  )
}

function NavRow({ item, path, badge }: { item: NavItem; path: string; badge?: number }) {
  const active = isActive(path, item.href)
  const { icon: Icon, color } = item
  return (
    <Link
      href={item.href}
      data-tour={item.href}
      aria-current={active && path === item.href ? 'page' : undefined}
      aria-label={badge ? `${item.label}, ${badge} to review` : undefined}
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
  )
}

function Count({ n }: { n: number }) {
  return <span aria-hidden className="mr-1 min-w-5 rounded-full bg-pill-wash px-1.5 text-center text-[11px] leading-5 font-medium text-pill-ink tabular-nums">{n > 99 ? '99+' : n}</span>
}

const TABS = ['/', '/life', '/plan', '/coach', '/you']

/** Bottom tab bar for phones: the five destinations. The areas are one tap away on the Life page. */
export function TabBar({ badges = {} }: { badges?: Record<string, number> }) {
  const path = usePathname()
  const all = NAV.flatMap((g) => g.items)
  const tabs = TABS.map((h) => all.find((i) => i.href === h)!)
  // The Life tab stands for every area page and Time too.
  const lifeHrefs = NAV[1].items.map((i) => i.href)
  const onLife = lifeHrefs.some((h) => isActive(path, h))
  return (
    <nav aria-label="Tabs" className="fixed inset-x-3 bottom-3 z-40 rounded-xl bg-glass pb-[env(safe-area-inset-bottom)] shadow-2 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-md justify-around">
        {tabs.map((t) => {
          const active = t.href === '/life' ? onLife : isActive(path, t.href)
          const Icon = t.icon
          const n = badges[t.href]
          return (
            <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} aria-label={n ? `${t.label}, ${n} to review` : undefined}
              className={cn('relative flex h-14 w-16 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-150', active ? 'text-ink' : 'text-ink-3')}>
              <Icon className="size-5" strokeWidth={active ? 2 : 1.5} />
              {t.href === '/life' ? 'Life' : t.label}
              {n ? <span aria-hidden className="absolute top-1.5 left-[calc(50%+6px)] min-w-4 rounded-full bg-ink px-1 text-center text-[10px] leading-4 font-semibold text-bg tabular-nums">{n > 99 ? '99+' : n}</span> : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
