import { Check, CircleDashed, Flag, History, Pause, Pencil, Play } from 'lucide-react'
import type { GoalDecision, GoalFields } from '@/domain/goals'
import { Card, CardHeader } from '../card'
import { day, value, weekday } from './format'

// Every decision and edit for one goal, newest first. Undecided older reviews read "No decision recorded".

export type HistoryRow = {
  id: string; kind: 'review' | 'edit'; reviewDate: string; decision: GoalDecision | null; note: string | null
  before: GoalFields | null; after: GoalFields | null
  snapshot: { outcome: { current: number | null; observations: number }; adherence: number | null }
}
export type CheckInRow = { id: string; localDate: string; value: number; note: string | null }

const ICON = { keep: Check, change: Pencil, pause: Pause, finish: Flag, resume: Play } as const
const LABEL = { keep: 'Kept', change: 'Changed', pause: 'Paused', finish: 'Finished', resume: 'Resumed' } as const

function changes(b: GoalFields, a: GoalFields, unit: string | null) {
  const out: string[] = []
  if (b.title !== a.title) out.push(`title “${a.title}”`)
  const v = (x: number | null) => (x == null ? '—' : value(x, unit))
  if (b.target !== a.target) out.push(`target ${v(b.target)} → ${v(a.target)}`)
  if (b.rangeLow !== a.rangeLow || b.rangeHigh !== a.rangeHigh) out.push(`range ${b.rangeLow}–${b.rangeHigh} → ${a.rangeLow}–${a.rangeHigh}`)
  if (b.targetDate !== a.targetDate) out.push(`date ${day(b.targetDate)} → ${day(a.targetDate)}`)
  if (b.cadence !== a.cadence) out.push(`review ${b.cadence} → ${a.cadence}`)
  if (JSON.stringify(b.actions) !== JSON.stringify(a.actions)) out.push('linked actions')
  if (b.reason !== a.reason) out.push('reason')
  return out.join(', ') || 'No field changed'
}

export function GoalHistory({ rows, unit, startedOn, baseline }: { rows: HistoryRow[]; unit: string | null; startedOn: string; baseline: string }) {
  return (
    <Card>
      <CardHeader icon={<History strokeWidth={1.5} />} title="Reviews and decisions" />
      <ol className="flex flex-col gap-4">
        {rows.map((r, i) => {
          const latestOpen = r.kind === 'review' && !r.decision && i === rows.findIndex((x) => x.kind === 'review' && !x.decision)
          const Icon = r.decision ? ICON[r.decision] : CircleDashed
          const title = r.decision ? LABEL[r.decision] : latestOpen ? 'Review to decide' : 'No decision recorded'
          const o = r.snapshot.outcome
          const detail = r.before && r.after ? changes(r.before, r.after, unit)
            : `${o.current != null ? `Outcome ${value(o.current, unit)} (${o.observations})` : 'Not enough data'}${r.snapshot.adherence != null ? ` · actions ${Math.round(r.snapshot.adherence * 100)}%` : ''}`
          return (
            <li key={r.id} className="flex gap-3">
              <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2"><Icon className="size-3.5" strokeWidth={1.5} /></span>
              <div className="min-w-0">
                <p className={r.decision ? 'text-[13.5px] font-medium text-ink' : 'text-[13.5px] text-ink-3'}>{title} · {weekday(r.reviewDate)}</p>
                <p className="text-[12.5px] text-ink-3 tabular-nums">{detail}</p>
                {r.note ? <p className="mt-0.5 text-[12.5px] text-ink-2">“{r.note}”</p> : null}
              </div>
            </li>
          )
        })}
        <li className="flex gap-3">
          <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2"><Flag className="size-3.5" strokeWidth={1.5} /></span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-ink">Started · {weekday(startedOn)}</p>
            <p className="text-[12.5px] text-ink-3 tabular-nums">{baseline}</p>
          </div>
        </li>
      </ol>
    </Card>
  )
}

export function CheckInList({ rows, unit }: { rows: CheckInRow[]; unit: string | null }) {
  if (!rows.length) return <p className="text-[13px] text-ink-3">No check-ins yet.</p>
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {rows.slice(0, 9).map((c) => (
        <li key={c.id} className="rounded-md bg-surface-2 px-3 py-2">
          <p className="text-[12px] text-ink-3">{weekday(c.localDate)}</p>
          <p className="text-[14px] font-semibold text-ink tabular-nums">{value(c.value, unit)}</p>
          {c.note ? <p className="truncate text-[12px] text-ink-3">{c.note}</p> : null}
        </li>
      ))}
    </ul>
  )
}
