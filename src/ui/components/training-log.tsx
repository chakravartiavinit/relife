import type { LucideIcon } from 'lucide-react'
import { addDays } from '@/core/time'
import { formatNumber } from '@/domain/money'
import { cn } from '../cn'

// One timeline for every way you train a skill: a row per stream (learning, deep work, coding, problems), a bar
// per day on a shared axis, height from that row's own busiest day. Below it, the "any practice" row that feeds the streak.
// Replaces a separate chart per source, so the whole picture reads at a glance.

export type Stream = {
  key: string
  label: string
  icon: LucideIcon
  color: string
  unit: string
  days: Map<string, number>
  /** Shown beside the label, e.g. "4h 20m" or "37". */
  total: string
}


export function TrainingLog({ streams, today, weeks = 8, streak }: {
  streams: Stream[]; today: string; weeks?: number; streak: { current: number; best: number }
}) {
  // Columns: whole weeks, Monday first, ending this week.
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
  const start = addDays(today, -(dow + (weeks - 1) * 7))
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  const any = new Map(days.map((d) => [d, streams.reduce((n, s) => n + ((s.days.get(d) ?? 0) > 0 ? 1 : 0), 0)]))
  const months = days.filter((d, i) => i % 7 === 0).map((d, w) => ({ w, label: d.slice(8) <= '07' ? new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)) : '' }))
  const fmtDay = (d: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))

  // One bar per day: height is that day against the row's busiest day; an empty day is a short grey tick.
  const Bars = ({ color, values, max, title }: { color: string; values: (d: string) => number; max: number; title: (d: string, v: number) => string }) => (
    <div className="flex h-9 items-end gap-[2px]">
      {days.map((d, i) => {
        const v = values(d)
        const future = d > today
        return (
          <span
            key={d}
            title={future ? undefined : title(d, v)}
            className={cn('reveal-bar min-w-0 flex-1 rounded-[2px]', d === today && 'outline-1 outline-offset-1 outline-ink/40', future && 'opacity-30')}
            style={{
              '--col': Math.floor(i / 7),
              height: v > 0 && max > 0 ? `${28 + (v / max) * 72}%` : '3px',
              background: v > 0 ? `color-mix(in oklch, ${color} ${45 + (v / Math.max(max, 1)) * 55}%, var(--surface-2))` : 'var(--surface-3)',
            } as React.CSSProperties}
          />
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Month labels, aligned with the week columns. */}
      <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-4 max-sm:grid-cols-1">
        <span aria-hidden />
        <div className="grid text-[11px] text-ink-3" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }} aria-hidden>
          {months.map((m) => <span key={m.w} className="border-s border-divider ps-1">{m.label || '\u00a0'}</span>)}
        </div>
      </div>

      {streams.map((s) => {
        const max = Math.max(0, ...days.map((d) => s.days.get(d) ?? 0))
        return (
          <div key={s.key} role="group" aria-label={`${s.label}, last ${weeks} weeks`} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-4 max-sm:grid-cols-1 max-sm:gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[9px]" style={{ color: `color-mix(in oklch, ${s.color} 80%, var(--ink))`, background: `color-mix(in oklch, ${s.color} 15%, transparent)` }}>
                <s.icon className="size-4" strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-ink">{s.label}</span>
                <span className="block truncate text-[11.5px] text-ink-3 tabular-nums">{s.total} · 28 days</span>
              </span>
            </div>
            <Bars color={s.color} values={(d) => s.days.get(d) ?? 0} max={max} title={(d, v) => `${fmtDay(d)}: ${v ? `${formatNumber(v)} ${s.unit}` : 'nothing'}`} />
          </div>
        )
      })}

      <div className="mt-1 grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-4 border-t border-divider pt-4 max-sm:grid-cols-1 max-sm:gap-2">
        <div className="min-w-0">
          <span className="block text-[13px] font-semibold text-ink">Any practice</span>
          <span className="block text-[11.5px] text-ink-3 tabular-nums">{streak.current ? `${streak.current}-day streak` : 'No streak yet'} · best {streak.best}</span>
        </div>
        <Bars
          color="var(--cat-skills)" values={(d) => any.get(d) ?? 0} max={streams.length}
          title={(d, v) => `${fmtDay(d)}: ${v ? `${v} of ${streams.length} kinds of practice` : 'no practice'}`}
        />
      </div>
    </div>
  )
}
