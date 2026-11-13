import type { LucideIcon } from 'lucide-react'
import { CATEGORY } from '../../tokens'
import { NAV, type NavItem } from '../nav'

// Capture's "Go to" rows: the sidebar destinations, then the tabs inside Plan, You and Wealth (reachable here,
// not in the sidebar). Labels and order come from `NAV`; only the one-line descriptions live here.

export type Page = { href: string; label: string; icon: LucideIcon; color?: string; sub: string; parent?: string }

const SUB: Record<string, string> = {
  '/': 'Quests and routines for today', '/life': 'All six areas and Time at a glance', '/time': 'Where your time on the laptop goes',
  '/plan': 'Goals, routines, trackers and the weekly review', '/coach': 'Ask, patterns and what needs you', '/you': 'Level, streak, connections and settings',
  '/plan/routines': 'Check off and manage routines', '/plan/trackers': 'Every number you count', '/plan/review': 'Decide on this week’s goals',
  '/you/connections': 'Apps and data sources', '/you/notifications': 'Telegram reminders and quiet hours', '/you/settings': 'Profile, the System and appearance',
  '/wealth/spending': 'Where your money goes', '/wealth/portfolio': 'Holdings and P&L', '/wealth/subscriptions': 'Bills and renewals',
}
const AREA_SUB = Object.fromEntries(Object.values(CATEGORY).map((c) => [c.label, c.blurb]))

const MORE: { href: string; label: string; parent: string }[] = [
  { href: '/plan/routines', label: 'Routines', parent: 'Plan' }, { href: '/plan/trackers', label: 'Trackers', parent: 'Plan' }, { href: '/plan/review', label: 'Review', parent: 'Plan' },
  { href: '/you/connections', label: 'Connections', parent: 'You' }, { href: '/you/notifications', label: 'Notifications', parent: 'You' }, { href: '/you/settings', label: 'Settings', parent: 'You' },
  { href: '/wealth/spending', label: 'Spending', parent: 'Wealth' }, { href: '/wealth/portfolio', label: 'Portfolio', parent: 'Wealth' },
  { href: '/wealth/subscriptions', label: 'Subscriptions', parent: 'Wealth' },
]

const ALL: NavItem[] = NAV.flatMap((g) => g.items)
const entry = (n: NavItem): Page => ({ href: n.href, label: n.href === '/life' ? 'Life' : n.label, icon: n.icon, color: n.color, sub: SUB[n.href] ?? AREA_SUB[n.label] ?? '' })

export const PAGES: Page[] = [
  ...ALL.map(entry),
  ...MORE.map((m): Page => {
    const p = ALL.find((i) => i.label === m.parent)!
    return { href: m.href, label: m.label, icon: p.icon, color: p.color, sub: SUB[m.href] ?? '', parent: m.parent }
  }),
]
