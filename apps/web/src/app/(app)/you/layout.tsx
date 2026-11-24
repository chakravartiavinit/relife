import { PageHeader } from '@/ui/components/card'
import { RouteTabs, type SegmentTab } from '@/ui/components/segment-tabs'

const TABS: SegmentTab[] = [
  { href: '/you', label: 'Progress' },
  { href: '/you/connections', label: 'Connections' },
  { href: '/you/notifications', label: 'Notifications' },
  { href: '/you/settings', label: 'Settings' },
]

/** One compact head and tab row for the four You pages; only the tab body below changes on a tab click. */
export default function YouLayout({ children }: LayoutProps<'/you'>) {
  return (
    <>
      <PageHeader title="You" description="Progress, sources and settings." tabs={<RouteTabs variant="underline" tabs={TABS} label="You" />} />
      {children}
    </>
  )
}
