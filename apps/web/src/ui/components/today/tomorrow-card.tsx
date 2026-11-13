import Link from 'next/link'
import type { TomorrowRow } from '@/core/day-plan'
import { Card } from '../card'
import { RoutineArt } from '../routine-art'

/** After the day is done: tomorrow's first two routines and the next renewal, so the evening ends knowing what comes first. */
export function TomorrowCard({ date, rows, renewal }: { date: string; rows: TomorrowRow[]; renewal?: { name: string; amount?: string; when: string } }) {
  if (!rows.length && !renewal) return null
  return (
    <Card>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-heading text-ink">Tomorrow</h2>
        <span className="text-caption text-ink-3 tabular-nums">{date}{rows.length ? ` · ${rows.length === 1 ? '1 planned' : 'first two'}` : ''}</span>
      </header>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={`${r.time}|${r.name}`} className="flex min-h-14 items-center gap-3 rounded-md px-1">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md" style={{ color: `color-mix(in oklch, ${r.color} 80%, var(--ink))`, background: `color-mix(in oklch, ${r.color} 16%, transparent)` }}>
              <RoutineArt name={r.name} kind={r.kind} area={r.area} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-ink">{r.name}</span>
              <span className="block text-caption font-semibold text-ink-3 tabular-nums">{r.time}</span>
            </span>
          </li>
        ))}
        {renewal ? (
          <li className="flex min-h-10 items-center justify-between gap-3 px-1 text-small">
            <span className="min-w-0 truncate text-ink-2">{renewal.name} renews {renewal.when}</span>
            <span className="flex shrink-0 items-center gap-3">
              {renewal.amount ? <span className="text-ink-3 tabular-nums">{renewal.amount}</span> : null}
              <Link href="/wealth/subscriptions" className="font-semibold text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Review</Link>
            </span>
          </li>
        ) : null}
      </ul>
    </Card>
  )
}
