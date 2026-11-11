import { Check, Snowflake, X } from 'lucide-react'
import { cn } from '../../cn'

export type WeekDay = { date: string; label: string; state: 'kept' | 'missed' | 'today' | 'future' | 'frozen'; count?: number }

const STATE_TEXT = { kept: 'kept', missed: 'missed', today: 'today', future: 'not yet', frozen: 'frozen' }
const full = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Seven days. State is the icon and the label, not the colour alone (each cell carries its own aria-label). */
export function WeekStrip({ days, tone = 'amber', className }: { days: WeekDay[]; tone?: 'amber' | 'mint'; className?: string }) {
  const on = tone === 'mint' ? 'bg-mint-bg text-mint' : 'bg-amber-fill text-amber'
  const ring = tone === 'mint' ? 'shadow-[inset_0_0_0_1.5px_var(--mint)]' : 'shadow-[inset_0_0_0_1.5px_var(--amber-line)]'
  return (
    <ol className={cn('grid grid-cols-7 gap-x-1.5', className)}>
      {days.map((d) => (
        <li key={d.date} aria-label={`${full(d.date)}, ${d.count !== undefined ? `${d.count} done` : STATE_TEXT[d.state]}`} className="flex flex-col items-center gap-1.5">
          <span aria-hidden className={cn('text-[12px] leading-4 text-ink-3', d.state === 'today' && 'font-semibold text-ink')}>{d.label}</span>
          <span
            aria-hidden
            className={cn(
              'flex h-6 w-full items-center justify-center rounded-md bg-fill font-mono text-[10.5px] text-ink-4',
              (d.state === 'kept' || d.state === 'frozen') && on,
              d.state === 'frozen' && 'bg-fill text-skills',
              d.state === 'today' && cn('bg-transparent', ring, tone === 'mint' ? 'text-mint' : 'text-amber'),
            )}
          >
            {d.count !== undefined ? d.count : d.state === 'kept' ? <Check className="size-3.5" strokeWidth={2.25} />
              : d.state === 'frozen' ? <Snowflake className="size-3.5" strokeWidth={2} />
              : d.state === 'missed' ? <X className="size-3.5" strokeWidth={2} />
              : d.state === 'today' ? <b className="size-1.5 rounded-full bg-current" /> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function WeekStripSkeleton() {
  return <div className="grid grid-cols-7 gap-x-1.5">{Array.from({ length: 7 }, (_, i) => <div key={i} className="h-[42px] animate-pulse rounded-md bg-fill" />)}</div>
}
