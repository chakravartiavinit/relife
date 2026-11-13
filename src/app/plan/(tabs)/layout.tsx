import { connection } from 'next/server'
import { Suspense } from 'react'
import { dueReviewCount } from '@/core/goals'
import { getUser } from '@/core/user'
import { PageHeader } from '@/ui/components/card'
import { RouteTabs, type SegmentTab } from '@/ui/components/segment-tabs'

const TABS: SegmentTab[] = [
  { href: '/plan', label: 'Goals' },
  { href: '/plan/routines', label: 'Routines' },
  { href: '/plan/trackers', label: 'Trackers' },
  { href: '/plan/review', label: 'Review' },
]

/** Header and tab row stay mounted while a tab changes; only the tab body below re-renders. */
export default function PlanLayout({ children }: LayoutProps<'/plan'>) {
  return (
    <>
      <PageHeader
        eyebrow="Plan" title="Plan"
        description="Up to 3 outcomes you want to change, the routines that serve them, the numbers you count, and your weekly review."
      />
      <Suspense fallback={<PlanTabs />}><PlanTabsWithDot /></Suspense>
      {children}
    </>
  )
}

function PlanTabs({ due = 0 }: { due?: number }) {
  const tabs = TABS.map((t) => t.href === '/plan/review' && due
    ? { ...t, label: <span className="inline-flex items-center gap-1.5">Review<span role="img" aria-label={`${due} due`} className="size-1.5 rounded-full bg-pill" /></span> }
    : t)
  return <RouteTabs tabs={tabs} label="Plan" className="mb-6" />
}

/** The dot on Review needs the database, so it streams in. The row itself is already there. */
async function PlanTabsWithDot() {
  await connection()
  return <PlanTabs due={await dueReviewCount(await getUser())} />
}
