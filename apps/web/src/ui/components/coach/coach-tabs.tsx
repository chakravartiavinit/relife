import { RouteTabs, type SegmentTab } from '../segment-tabs'

const TABS: SegmentTab[] = [
  { href: '/coach', label: 'Ask' },
  { href: '/coach/patterns', label: 'Patterns' },
  { href: '/coach/history', label: 'History' },
]

/** Ask · Patterns · History, the underline tab row of the Coach head (`coach/layout.tsx`). */
export function CoachTabs() {
  return <RouteTabs variant="underline" tabs={TABS} label="Coach" />
}
