import { SystemLabel } from '@/ui/components/card'
import { RouteTabs, type SegmentTab } from '@/ui/components/segment-tabs'

const TABS: SegmentTab[] = [
  { href: '/you', label: 'Progress' },
  { href: '/you/connections', label: 'Connections' },
  { href: '/you/notifications', label: 'Notifications' },
  { href: '/you/settings', label: 'Settings' },
]

/** One compact header and tab row for the four You pages; only the tab body below changes on a tab click. */
export default function YouLayout({ children }: LayoutProps<'/you'>) {
  return (
    <>
      <header className="mb-4">
        <SystemLabel>You</SystemLabel>
        <h1 className="mt-0.5 font-display text-title font-extrabold tracking-[-0.03em] text-ink">Progress, sources and settings</h1>
      </header>
      <RouteTabs tabs={TABS} label="You" className="mb-6" />
      {children}
    </>
  )
}
