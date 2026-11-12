import type { DayStatus } from '@/domain/adherence'
import { formatDay } from '@/core/time'

const LABEL: Record<DayStatus, string> = {
  done: 'Done', partial: 'Partly done', skipped: 'Skipped', missed: 'Missed', pending: 'Due today', none: 'Not scheduled',
}

/** One cell per day. Shape carries the state too, so it never relies on color alone. */
export function StatusCell({ status, color, title }: { status: DayStatus; color: string; title?: string }) {
  const base = 'relative grid size-3 shrink-0 place-items-center rounded-[3px] sm:size-3.5 sm:rounded-[4px]'
  switch (status) {
    case 'done':
      return <span title={title} className={base} style={{ background: color }} />
    case 'partial':
      return (
        <span title={title} className={`${base} overflow-hidden shadow-[inset_0_0_0_1.5px_var(--hairline)]`}>
          <span className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: color }} />
        </span>
      )
    case 'skipped':
      return (
        <span title={title} className={`${base} bg-surface-2`}>
          <span className="h-[1.5px] w-2 rounded-full bg-ink-3" />
        </span>
      )
    case 'missed':
      return (
        <span title={title} className={`${base} shadow-[inset_0_0_0_1.5px_var(--bad)]`}>
          <svg viewBox="0 0 8 8" className="size-2 text-bad" aria-hidden>
            <path d="M2 2l4 4M6 2 2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      )
    case 'pending':
      return <span title={title} className={`${base} border border-dashed border-ink-3/60`} />
    default:
      return (
        <span title={title} className={base}>
          <span className="size-1 rounded-full bg-ink-3/30" />
        </span>
      )
  }
}

export function AdherenceStrip({ days, color, name }: { days: { date: string; status: DayStatus }[]; color: string; name: string }) {
  const done = days.filter((d) => d.status === 'done').length
  const due = days.filter((d) => d.status !== 'none' && d.status !== 'pending').length
  return (
    <div role="img" aria-label={`${name}: ${done} of ${due} scheduled days done in the last ${days.length} days`} className="flex items-center gap-[3px]">
      {days.map((d) => (
        <StatusCell key={d.date} status={d.status} color={color} title={`${formatDay(d.date)}: ${LABEL[d.status].toLowerCase()}`} />
      ))}
    </div>
  )
}

export function AdherenceLegend() {
  const items: DayStatus[] = ['done', 'partial', 'skipped', 'missed', 'pending']
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-3" aria-label="Legend">
      {items.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <StatusCell status={s} color="var(--ink-2)" />
          <span>{LABEL[s]}</span>
        </li>
      ))}
    </ul>
  )
}
