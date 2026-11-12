import { Brain, Code, HeartPulse, LayoutGrid, MonitorSmartphone, Palette, Sparkles, Sunrise, Target, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react'

// The destinations, as data. The sidebar, the tab bar and the Go-to list read it (`src/ui/components/shell/`).

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

/** Is `path` this destination or something inside it (`/plan/goals/x` is in `/plan`)? */
export function isActive(path: string, href: string) {
  if (href === '/') return path === '/'
  return path === href || path.startsWith(href + '/')
}

/** The Life group: the hub link, then the area pages and Time. */
export const LIFE_HUB = NAV[1].items[0]
export const LIFE_CHILDREN = NAV[1].items.slice(1)

/** Area pages the user did not pick in setup stay out of the list (until you are on one). Time is not an area. */
export const AREA_HREF: Record<string, string> = { health: '/health', mind: '/mind', skills: '/skills', wealth: '/wealth', hobbies: '/hobbies', relationships: '/people' }

/** The Life children to show: `areas` (from onboarding) hides the area pages the user didn't pick; empty shows all. */
export function visibleLifeChildren(areas: string[] | undefined, path: string) {
  const hidden = new Set(areas?.length ? Object.entries(AREA_HREF).filter(([c]) => !areas.includes(c)).map(([, h]) => h) : [])
  return LIFE_CHILDREN.filter((i) => !hidden.has(i.href) || isActive(path, i.href))
}
