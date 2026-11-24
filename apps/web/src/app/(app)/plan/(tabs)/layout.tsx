import { connection } from 'next/server'
import { Suspense } from 'react'
import { loadDayPlan } from '@/core/day-plan'
import { loadGoalsPageOnce } from '@/core/goals'
import { getUser } from '@/core/user'
import { MAX_ACTIVE, actionStatus } from '@/domain/goals'
import { planOpening } from '@/domain/plan-opening'
import type { PeekRef } from '@/domain/peek'
import { buttonLinkClass } from '@/ui/components/button'
import { PageHeader } from '@/ui/components/card'
import { actionPeeks, paceOf } from '@/ui/components/goals/format'
import { PeekLink } from '@/ui/components/peek/peek-link'
import { RouteTabs, type SegmentTab } from '@/ui/components/segment-tabs'

const TABS: SegmentTab[] = [
  { href: '/plan', label: 'Goals' },
  { href: '/plan/routines', label: 'Routines' },
  { href: '/plan/trackers', label: 'Trackers' },
  { href: '/plan/review', label: 'Review' },
]

/** The head and tab row stay mounted while a tab changes; only the tab body below re-renders. The opening line and counts stream in. */
export default function PlanLayout({ children }: LayoutProps<'/plan'>) {
  return (
    <>
      <Suspense fallback={<PageHeader title="Plan" eyebrow="Plan" description={<span aria-hidden className="block h-5 w-72 max-w-full animate-pulse rounded-md bg-ink/[0.05] dark:bg-white/[0.06]" />} tabs={<PlanTabs />} />}>
        <PlanHead />
      </Suspense>
      {children}
    </>
  )
}

const count = (n: number) => <span className="ml-1.5 text-caption font-normal text-ink-3 tabular-nums">{n}</span>

function PlanTabs({ due = 0, routines, trackers }: { due?: number; routines?: number; trackers?: number }) {
  const tabs = TABS.map((t) => t.href === '/plan/review' && due ? { ...t, label: <>Review<span className="ml-1.5 text-caption font-normal text-ink-3">due</span></> }
    : t.href === '/plan/routines' && routines ? { ...t, label: <>Routines{count(routines)}</> }
      : t.href === '/plan/trackers' && trackers ? { ...t, label: <>Trackers{count(trackers)}</> }
        : t)
  return <RouteTabs variant="underline" tabs={tabs} label="Plan" />
}

/** The sentence Plan opens with (goals against pace, what slipped, Why? opening the goal or action it is about) and the tab counts. */
async function PlanHead() {
  await connection()
  const user = await getUser()
  const [data, plan] = await Promise.all([loadGoalsPageOnce(user), loadDayPlan(user)])
  const slipping: { name: string; peek: PeekRef | null }[] = []
  for (const g of data.active) {
    const peeks = actionPeeks(g, data.picker.trackers)
    g.snapshot?.actions.forEach((a, i) => { if (actionStatus(a) === 'Slipping') slipping.push({ name: g.actionNames[i], peek: peeks[i] }) })
  }
  const paces = data.active.map((g) => paceOf(g, data.today))
  const behind = data.active.find((_, i) => paces[i]?.label === 'Behind')
  const why: PeekRef | null = behind ? { type: 'goal', id: behind.id } : slipping.find((s) => s.peek)?.peek ?? (data.active[0] ? { type: 'goal', id: data.active[0].id } : null)
  return (
    <PageHeader
      title="Plan"
      eyebrow={`${data.activeCount} of ${MAX_ACTIVE} goals active`}
      description={<>{planOpening({ paces: paces.map((p) => p?.label ?? null), slipping: slipping.map((s) => s.name) })}{why ? <> <PeekLink to={why} className={buttonLinkClass()}>Why?</PeekLink></> : null}</>}
      tabs={<PlanTabs due={data.due.length} routines={plan.total} trackers={data.picker.trackers.length} />}
    />
  )
}
