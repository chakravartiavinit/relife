import Link from 'next/link'
import { CalendarCheck } from 'lucide-react'
import type { AreaDef } from '@/core/areas'
import { loadDayPlan } from '@/core/day-plan'
import type { User } from '@/core/user'
import { Agenda, Goals } from '../agenda'
import { buttonClass } from '../button'
import { Card, CardHeader } from '../card'
import { NewScheduleButton } from '../forms/schedule-form'
import { RoutinesCard } from '../category/routines-card'

/**
 * Today's routines of one area with the check-off right here: quantity goals first (water +250), then the rows
 * by time of day. Both come from the same day plan as Today and Capture, so a tap here shows there too.
 */
export async function TodayRoutines({ user, def, title = 'Today’s routines' }: { user: User; def: AreaDef; title?: string }) {
  const plan = await loadDayPlan(user)
  const rows = plan.rows.filter((r) => r.area === def.category)
  const goals = plan.goals.filter((g) => g.area === def.category)
  const total = rows.length + goals.length
  const done = rows.filter((r) => r.status === 'done').length + goals.filter((g) => g.value >= g.target).length
  return (
    <Card>
      <CardHeader
        title={title} icon={<CalendarCheck strokeWidth={2} />} color={def.color}
        description={total ? `${done} of ${total} done` : undefined}
        action={<Link href={`/${def.slug}/routines`} className={buttonClass({ variant: 'ghost', size: 'sm' })}>All routines</Link>}
      />
      {total ? (
        <>
          {goals.length ? <div className={rows.length ? 'mb-5 border-b border-divider pb-5' : undefined}><Goals rows={goals} /></div> : null}
          {rows.length ? <Agenda rows={rows} /> : null}
        </>
      ) : (
        <p className="text-small text-ink-3">Nothing due today. <Link href={`/${def.slug}/routines`} className="font-medium text-pill-ink hover:underline">See every routine</Link>.</p>
      )}
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
