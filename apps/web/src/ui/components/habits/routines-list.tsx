import Link from 'next/link'
import { ArrowUpRight, CalendarCheck, Pill, Repeat, Sunrise } from 'lucide-react'
import type { User } from '@/core/user'
import { loadDayPlan } from '@/core/day-plan'
import { formatTime } from '@/core/time'
import { scheduleInitial } from '@/core/schedules'
import { Card, CardHeader } from '../card'
import { EmptyState } from '../empty'
import { buttonClass } from '../button'
import { AdherenceLegend } from '../category/adherence-strip'
import { AdherenceRow } from '../category/routines-card'
import { loadAdherence, type ScheduleAdherence } from '@/core/adherence'
import { ScheduleActions } from '../forms/schedule-actions'
import { Agenda, Goals } from '../agenda'
import { Capsule } from '../capsule'

/**
 * The Routines tab: today's check-off first (quantity goals like water, then Morning, Afternoon, Evening with a Now
 * line, the same rows and Undo toasts as Today), then every routine with its 14-day strip. Check-offs share
 * `loadDayPlan` with Today, Capture and the shell dots, so a tap here shows everywhere.
 */
export async function PlanRoutines({ user }: { user: User }) {
  const { rows, goals, total, done } = await loadDayPlan(user)
  const now = formatTime(new Date(), user.timezone)
  const left = total - done
  return (
    <div className="flex flex-col gap-6">
      <Card id="today-checkoff" className="scroll-mt-6 p-5 sm:p-6">
        <CardHeader
          title={<>Today{total ? <span className="ms-2 inline-flex h-6 items-center rounded-full bg-surface-2 px-2 align-middle text-caption font-medium text-ink-2 tabular-nums">{done} of {total}</span> : null}</>}
          icon={<CalendarCheck strokeWidth={2} />} color="var(--pill)"
          description={total ? (left ? `${left} to go. Tap the circle to check off; Undo is in the toast.` : `All ${total} done. Nice.`) : undefined}
        />
        {total ? <Capsule value={done} max={total} size="sm" color="var(--pill)" label="Done today" className="-mt-2 mb-5" /> : null}
        {goals.length ? (
          <div className={rows.length ? 'mb-6' : undefined}>
            <h3 className="mb-2 flex items-center gap-2 px-1 font-mono text-label text-ink-3 uppercase">Through the day<span aria-hidden className="h-px flex-1 bg-divider" /></h3>
            <Goals rows={goals} compact />
          </div>
        ) : null}
        {rows.length ? <Agenda rows={rows} timeline={{ now }} /> : !goals.length ? (
          <EmptyState title="Nothing due today" icon={Sunrise} color="var(--pill)" description="Routines that are not due today are listed below with their next run." />
        ) : null}
      </Card>
      <RoutinesList user={user} />
    </div>
  )
}

/** Every routine and medicine with 14-day adherence; the name opens its Peek, the menu edits. Server component. */
export async function RoutinesList({ user }: { user: User }) {
  const rows = await loadAdherence(user, { kinds: ['routine', 'medicine'], includeInactive: true })
  const routines = rows.filter((r) => r.schedule.kind === 'routine')
  const medicines = rows.filter((r) => r.schedule.kind === 'medicine')
  if (!rows.length) {
    return (
      <Card>
        <EmptyState
          title="Start with one small routine" icon={Repeat} color={'var(--pill)'}
          description="Water, skincare, a vitamin or ten minutes of reading. Start with one thing you can do every day."
        />
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <AdherenceLegend />
      <Section title="Routines" rows={routines} empty="No routines yet." />
      <Section title="Medicines" rows={medicines} empty="No medicines. Add one to track doses and stock." />
      <Card className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Subscriptions & bills</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">Renewals, card bills and insurance live with your money.</p>
        </div>
        <Link href="/wealth/subscriptions" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Open <ArrowUpRight className="size-4" strokeWidth={1.5} />
        </Link>
      </Card>
    </div>
  )
}

function Section({ title, rows, empty }: { title: string; rows: ScheduleAdherence[]; empty: string }) {
  return (
    <Card>
      <CardHeader title={title} icon={title === 'Medicines' ? <Pill strokeWidth={2} /> : <Repeat strokeWidth={2} />} color={title === 'Medicines' ? 'var(--cat-health)' : 'var(--pill)'} description={rows.length ? `${rows.filter((r) => r.schedule.active).length} active` : undefined} />
      {rows.length ? (
        <ul className="-my-2 divide-y divide-divider">
          {rows.map((r) => (
            <AdherenceRow
              key={r.schedule.id}
              r={r}
              actions={<ScheduleActions initial={scheduleInitial(r.schedule)} active={r.schedule.active} name={r.schedule.name} />}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3">{empty}</p>
      )}
    </Card>
  )
}
