import { CalendarDays, Plug, Repeat, Settings, Shield, Sparkles, type LucideIcon } from 'lucide-react'
import type { Category } from '@/db/schema'
import { AREA_ICON } from './area-art'
import { CATEGORY } from './tokens'

// One model drives the rail, the phone sheets, ⌘K and the page tabs. It lives in a plain module (not nav.tsx, a
// client component) so server pages can read TABS too.

export type NavItem = {
  href: string; label: string; icon: LucideIcon
  /** The ⌘K subtitle. */
  sub: string
  /** Set on the six life areas. */
  area?: Category
  /** More paths that keep this row active (the row's own path and everything under it already do). */
  also?: string[]
  /** Old page names, so ⌘K still finds "Habits" or "Inbox". */
  keywords?: string[]
}

export const PLAY: NavItem[] = [
  { href: '/', label: 'Today', icon: CalendarDays, sub: 'Quests and routines for today' },
  { href: '/character', label: 'Character', icon: Shield, sub: 'Level, streak and achievements', keywords: ['Progress', 'Profile', 'Overview'] },
  { href: '/routines', label: 'Routines', icon: Repeat, sub: 'Routines, medicines and trackers', also: ['/routines/trackers'], keywords: ['Habits', 'Schedules', 'Trackers'] },
  { href: '/coach', label: 'Coach', icon: Sparkles, sub: 'Nudges, patterns and screen time', also: ['/coach/screen-time'], keywords: ['Insights', 'Activity', 'Screen time'] },
]

/** One per life area, in the order of `CATEGORY`. People lives at /people; its category key stays `relationships`. */
export const AREA_HREF: Record<Category, string> = {
  health: '/health', mind: '/mind', skills: '/skills', wealth: '/wealth', hobbies: '/hobbies', relationships: '/people',
}
export const STATS: NavItem[] = (Object.keys(CATEGORY) as Category[]).map((area) => ({
  href: AREA_HREF[area], label: CATEGORY[area].label, icon: AREA_ICON[area], sub: CATEGORY[area].blurb, area,
}))

export const FOOTER: NavItem[] = [
  { href: '/sources', label: 'Sources', icon: Plug, sub: 'Connected apps and data', also: ['/sources/review', '/sources/browse'], keywords: ['Connectors', 'Inbox', 'Needs a look'] },
  { href: '/settings', label: 'Settings', icon: Settings, sub: 'Profile, the System and notifications' },
]

export const TABS = {
  '/routines': [{ href: '/routines', label: 'Routines' }, { href: '/routines/trackers', label: 'Trackers' }],
  '/coach': [{ href: '/coach', label: 'Nudges' }, { href: '/coach/screen-time', label: 'Screen time' }],
  '/wealth': [
    { href: '/wealth', label: 'Overview' }, { href: '/wealth/spending', label: 'Spending' },
    { href: '/wealth/portfolio', label: 'Portfolio' }, { href: '/wealth/subscriptions', label: 'Subscriptions' },
  ],
  '/sources': [{ href: '/sources', label: 'Connected' }, { href: '/sources/review', label: 'Needs a look' }, { href: '/sources/browse', label: 'Browse' }],
} satisfies Record<string, { href: string; label: string }[]>

/** Numbers beside rows. All optional: the rail renders without them while they load. */
export type NavCounts = { today?: number; sources?: number; nudges?: number; levels?: Partial<Record<Category, number>> }

/** Exact for Today; otherwise the row's path, anything under it (/routines/trackers/water, /coach/screen-time, /sources/review) or an `also` prefix. */
export function isActive(path: string, item: Pick<NavItem, 'href' | 'also'>) {
  if (item.href === '/') return path === '/'
  return [item.href, ...(item.also ?? [])].some((h) => path === h || path.startsWith(h + '/'))
}
