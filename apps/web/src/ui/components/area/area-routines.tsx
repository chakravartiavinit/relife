import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { AreaDef } from '@/core/areas'
import { loadDayPlan } from '@/core/day-plan'
import type { User } from '@/core/user'
import { Agenda, Goals } from '../agenda'
import { Card, CardHeader } from '../card'
import { NewScheduleButton } from '../forms/schedule-form'
import { RoutinesCard } from '../category/routines-card'

/**
 * Today's routines of one area with the check-off right here: quantity goals first (water +250), then the rows
 * by time of day. Both come from the same day plan as Today and Capture, so a tap here shows there too.
 * `foot` sits at the bottom of the card (the Overview puts its sources line there). On a phone, with `foot` given (the
 * Overview), only the next two open routines show and "N more today" opens the rest (counting open ones only); from 640px the whole list shows.
 */
export async function TodayRoutines({ user, def, title = 'Today’s routines', foot }: { user: User; def: AreaDef; title?: string; foot?: React.ReactNode }) {
  const plan = await loadDayPlan(user)
  const rows = plan.rows.filter((r) => r.area === def.category)
  const goals = plan.goals.filter((g) => g.area === def.category)
  const total = rows.length + goals.length
  const done = rows.filter((r) => r.status === 'done').length + goals.filter((g) => g.value >= g.target).length
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={title}
        description={total ? `${done} of ${total} done` : undefined}
        action={<Link href={`/${def.slug}/routines`} className="relative inline-flex min-h-8 items-center gap-1 rounded-sm text-small font-medium text-ink-2 transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] hover-fine:text-ink focus-visible:outline-2 focus-visible:outline-pill">All routines<ChevronRight aria-hidden className="size-3.5" strokeWidth={1.5} /></Link>}
      />
      {total ? (
        <>
          {goals.length ? <div className={rows.length ? 'mb-5 border-b border-divider pb-5' : undefined}><Goals rows={goals} /></div> : null}
          {rows.length ? <Agenda rows={rows} phoneOpen={foot ? 2 : undefined} /> : null}
        </>
      ) : (
        <p className="text-small text-ink-3">Nothing due today. <Link href={`/${def.slug}/routines`} className="font-medium text-pill-ink hover:underline">See every routine</Link>.</p>
      )}
      {foot ? <div className="mt-auto pt-5"><div className="-mx-5 -mb-5">{foot}</div></div> : null}
    </Card>
  )
}

/** The Routines tab: today's check-off, every routine with its 14-day strip, and a new routine pre-set to this area. */
export async function AreaRoutines({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end"><NewScheduleButton today={today} category={def.category!} /></div>
      <TodayRoutines user={user} def={def} title="Today" />
      <RoutinesCard user={user} category={def.category!} title="All routines & medicines" />
    </div>
  )
}
