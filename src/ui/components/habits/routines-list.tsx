import Link from 'next/link'
import { ArrowUpRight, Pill, Repeat } from 'lucide-react'
import type { User } from '@/core/user'
import { scheduleInitial } from '@/core/schedules'
import { Card, CardHeader } from '../card'
import { EmptyState } from '../empty'
import { buttonClass } from '../button'
import { AdherenceLegend } from '../category/adherence-strip'
import { AdherenceRow } from '../category/routines-card'
import { loadAdherence, type ScheduleAdherence } from '@/core/adherence'
import { ScheduleActions } from '../forms/schedule-actions'

/** Every routine and medicine with 14-day adherence and edit actions. Server component. */
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
