import { History, MessageCircle, Waypoints } from 'lucide-react'
import { RouteTabs, type SegmentTab } from '../segment-tabs'

const ICON = 'size-4'
const TABS: SegmentTab[] = [
  { href: '/coach', label: <span className="inline-flex items-center gap-1.5"><MessageCircle className={ICON} strokeWidth={1.5} aria-hidden />Ask</span> },
  { href: '/coach/patterns', label: <span className="inline-flex items-center gap-1.5"><Waypoints className={ICON} strokeWidth={1.5} aria-hidden />Patterns</span> },
  { href: '/coach/history', label: <span className="inline-flex items-center gap-1.5"><History className={ICON} strokeWidth={1.5} aria-hidden />History</span> },
]

/** Ask · Patterns · History, one row of route tabs that sits above the Ask pane and on the two sub-pages. */
export function CoachTabs({ className }: { className?: string }) {
  return <RouteTabs tabs={TABS} label="Coach" className={className} />
}
