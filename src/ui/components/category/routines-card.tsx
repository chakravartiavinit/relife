import Link from 'next/link'
import { Repeat } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { User } from '@/core/user'
import type { ScheduleMeta } from '@/core/schedules'
import { describe } from '@/domain/recurrence'
import { CATEGORY } from '@/ui/tokens'
import { Card, CardHeader, Badge } from '../card'
import { Capsule } from '../capsule'
import { EmptyState } from '../empty'
import { buttonClass } from '../button'
import { AdherenceStrip } from './adherence-strip'
import { RoutineArt } from '../routine-art'
import { loadAdherence, type ScheduleAdherence } from '@/core/adherence'

/** Routines (and medicines) of one category with 14-day adherence. Server component. */
export async function RoutinesCard({ user, category, title = 'Routines', kinds = ['routine', 'medicine'] }: {
  user: User; category: Category; title?: string; kinds?: ('routine' | 'medicine')[]
}) {
  const rows = await loadAdherence(user, { category, kinds })
  return (
    <Card>
      <CardHeader
        title={title} icon={<Repeat strokeWidth={2} />} color={CATEGORY[category].color}
        description="Last 14 days"
        action={<Link href="/plan/routines" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Manage</Link>}
      />
      {rows.length ? (
        <ul className="-my-2 divide-y divide-divider">
          {rows.map((r) => <AdherenceRow key={r.schedule.id} r={r} />)}
        </ul>
      ) : (
        <EmptyState
          title={`No ${CATEGORY[category].label.toLowerCase()} routines yet`} icon={Repeat} color={CATEGORY[category].color}
          description="Routines you add here get reminders on Telegram and a streak."
          action={<Link href="/plan/routines?new=1" className={buttonClass({ variant: 'primary', size: 'sm' })}>Add a routine</Link>}
        />
      )}
    </Card>
  )
}

export function AdherenceRow({ r, actions }: { r: ScheduleAdherence; actions?: React.ReactNode }) {
  const s = r.schedule
  const meta = s.meta as ScheduleMeta
  const color = CATEGORY[s.category].color
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center self-start rounded-[11px]" style={{ color: `color-mix(in oklch, ${color} 80%, var(--ink))`, background: `color-mix(in oklch, ${color} 16%, transparent)`, opacity: s.active ? 1 : 0.5 }}>
        <RoutineArt name={s.name} kind={s.kind} area={s.category} className={s.active ? undefined : 'grayscale'} />
      </span>
      <div className="min-w-0 flex-1 basis-40 sm:basis-56">
        <div className="flex items-center gap-2">
          <span className={`truncate text-[15px] ${s.active ? 'text-ink' : 'text-ink-3'}`}>{s.name}</span>
          {!s.active ? <Badge>Paused</Badge> : null}
          {r.refillSoon ? <Badge color="var(--warn)">Refill soon</Badge> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-3">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color }} />
          <span>{CATEGORY[s.category].label}</span>
          <span aria-hidden>·</span>
          <span className="truncate tabular-nums">{describe(s.rrule)}</span>
          {meta.dose ? <><span aria-hidden>·</span><span className="truncate">{meta.dose}</span></> : null}
        </div>
        {s.kind === 'medicine' && typeof meta.stock === 'number' ? (
          <div className="mt-2 flex max-w-64 items-center gap-2">
            <Capsule
              size="sm"
              value={meta.stock}
              max={Math.max(meta.stock, Math.ceil(r.dosesPerDay * 30))}
              color={r.refillSoon ? 'var(--warn)' : color}
              label={`${s.name} stock`}
            />
            <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">{meta.stock} left</span>
          </div>
        ) : null}
      </div>
      {/* On a phone the strip and streak take their own line, so the menu stays beside the title. */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 max-sm:order-last max-sm:w-full">
        <AdherenceStrip days={r.days} color={color} name={s.name} />
        <div className="w-20 text-right">
          <div className="text-[15px] font-semibold text-ink tabular-nums">{r.streak}d</div>
          <div className="text-[12px] whitespace-nowrap text-ink-3 tabular-nums">{r.rate == null ? 'streak' : `${Math.round(r.rate * 100)}% kept`}</div>
        </div>
      </div>
      {actions ? <div className="shrink-0 max-sm:self-start">{actions}</div> : null}
    </li>
  )
}
