'use client'

import { useState } from 'react'
import { formatMoney } from '@/domain/money'
import { cn } from '../../cn'
import { CHART } from '../../tokens'
import { Fold } from '../fold'

export type CategoryRow = { label: string; value: number; sub?: string }

const SHOWN_ON_PHONE = 4

/**
 * Where the money went as a ranked list: a small bar, the amount, one row per category, largest first. The pill switch
 * flips between this month and everything since the history begins. The lead category (the one the month bars lead
 * with) is in the area colour, the rest are neutral. On a phone the first four rows show and the rest fold.
 */
export function CategoryList({ month, monthName, all, lead, base, accent }: {
  month: CategoryRow[]; monthName: string; all: CategoryRow[]; lead?: string; base: string; accent: string
}) {
  const [view, setView] = useState<'month' | 'all'>('month')
  const rows = view === 'month' ? month : all
  const max = Math.max(1, ...rows.map((r) => r.value))
  const item = (r: CategoryRow, i: number) => (
    <li key={`${view}:${r.label}`} className="grid min-h-9 grid-cols-[minmax(0,1fr)_4rem_auto] items-center gap-x-3 py-1">
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-body text-ink">
          <span aria-hidden className="size-2.5 shrink-0 rounded-xs" style={{ background: r.label === lead ? accent : CHART.neutral[Math.min(i, 2)] }} />
          <span className="truncate">{r.label}</span>
        </span>
        {r.sub ? <span className="block truncate ps-[18px] text-caption text-ink-3 tabular-nums">{r.sub}</span> : null}
      </span>
      <span aria-hidden className="h-1 overflow-hidden rounded-full bg-ink/[0.08]">
        <span className="reveal-fill block h-full w-full rounded-full bg-ink-2" style={{ '--fill': `${(r.value / max) * 100}%`, '--i': i } as React.CSSProperties} />
      </span>
      <span className="text-end text-body font-medium text-ink tabular-nums">{formatMoney(r.value, base, { decimals: 0 })}</span>
    </li>
  )
  const first = rows.slice(0, SHOWN_ON_PHONE), rest = rows.slice(SHOWN_ON_PHONE)
  return (
    <div>
      <div role="group" aria-label="Period" className="mb-3 inline-flex gap-1 rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
        {([['month', monthName], ['all', 'All time']] as const).map(([k, label]) => (
          <button
            key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}
            className={cn(
              'h-8 rounded-full px-3 text-small font-medium transition-[background-color,color,scale] duration-150 ease-out-quint active:scale-96 focus-visible:outline-2 focus-visible:outline-pill',
              view === k ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover-fine:text-ink',
            )}
          >{label}</button>
        ))}
      </div>
      {rows.length ? (
        <>
          <ul className="flex flex-col">{first.map(item)}</ul>
          {rest.length ? <Fold inline title={`${rest.length} more categories`}><ul className="flex flex-col">{rest.map((r, i) => item(r, i + SHOWN_ON_PHONE))}</ul></Fold> : null}
        </>
      ) : <p className="text-small text-ink-3">No orders {view === 'month' ? 'yet this month' : 'yet'}.</p>}
    </div>
  )
}
