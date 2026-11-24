'use client'

import { useState } from 'react'
import { cn } from '../../cn'
import { Chip } from '../chip'
import { Fold } from '../fold'
import { PeekLink } from '../peek/peek-link'
import { Picture } from '../picture'
import { CategorySelect } from './category-select'

// The month's payments as a list with its filters: one row per payment, the merchant's logo (or the category's picture for
// a bank or UPI row with no logo), the category picker, where the row came from and the amount. The rows arrive formatted
// from the server (dates, times and money in the user's zone and currency); this only filters and folds.

export type TxnRow = {
  id: string
  /** "23 Nov · 08:51". */
  when: string
  name: string
  /** The UPI id under a name that is not it. */
  upi?: string
  category: string
  source: string
  amountText: string
  /** The base-currency amount under one in another currency. */
  baseText?: string
  kind: 'spend' | 'income' | 'other'
}

type Filter = 'all' | 'spend' | 'income' | 'uncategorized'
const SHOWN = 8

const COLS = 'sm:grid-cols-[7rem_minmax(0,1fr)_11rem_6rem_7.5rem]'

function Row({ t, options }: { t: TxnRow; options: string[] }) {
  return (
    <div role="row" className={cn('grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2 [&+&]:border-t [&+&]:border-divider', COLS)}>
      <span role="cell" className="col-span-2 text-caption text-ink-3 tabular-nums sm:col-span-1 sm:text-small">{t.when}</span>
      <span role="cell" className="min-w-0">
        <PeekLink to={{ type: 'txn', id: t.id }} className="-mx-2 flex min-w-0 items-center gap-3 rounded-md px-2 py-1 transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill">
          <Picture of="merchant" name={t.name} category={t.category === 'Uncategorized' ? undefined : t.category} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-body font-medium text-ink">{t.name}</span>
            {t.upi ? <span className="block truncate text-small text-ink-3">{t.upi}</span> : null}
          </span>
        </PeekLink>
      </span>
      <span role="cell" className="order-last col-span-2 sm:order-none sm:col-span-1">
        <CategorySelect id={t.id} value={t.category} options={options} merchant={t.name} />
      </span>
      <span role="cell" className="hidden truncate text-small text-ink-3 sm:block">{t.source}</span>
      <span role="cell" className={cn('text-end text-body font-medium tabular-nums', t.kind === 'income' ? 'text-good-ink' : 'text-ink')}>
        {t.amountText}
        {t.baseText ? <span className="block text-small font-normal text-ink-3">{t.baseText}</span> : null}
      </span>
    </div>
  )
}

export function Transactions({ rows, options, from }: { rows: TxnRow[]; options: string[]; from: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const count = {
    all: rows.length, spend: rows.filter((t) => t.kind === 'spend').length, income: rows.filter((t) => t.kind === 'income').length,
    uncategorized: rows.filter((t) => t.category === 'Uncategorized').length,
  }
  const shown = rows.filter((t) => (filter === 'all' ? true : filter === 'uncategorized' ? t.category === 'Uncategorized' : t.kind === filter))
  const chips: [Filter, string][] = [['all', 'All'], ['spend', 'Spending'], ['income', 'Income'], ['uncategorized', 'Uncategorized']]
  return (
    <div>
      <div role="group" aria-label="Show" className="mb-3 flex flex-wrap gap-2">
        {chips.filter(([k]) => k === 'all' || count[k]).map(([k, label]) => (
          <Chip key={k} selected={filter === k} count={count[k]} onClick={() => setFilter(k)}>{label}</Chip>
        ))}
      </div>
      <div role="table" aria-label="Transactions">
        <div role="row" className={cn('hidden gap-x-4 border-b border-divider pb-2 text-label text-ink-3 sm:grid', COLS)}>
          <span role="columnheader">Date</span><span role="columnheader">To or from</span><span role="columnheader">Category</span><span role="columnheader">Source</span><span role="columnheader" className="text-end">Amount</span>
        </div>
        {shown.length ? shown.slice(0, SHOWN).map((t) => <Row key={t.id} t={t} options={options} />) : <p className="py-4 text-small text-ink-3">Nothing here this month.</p>}
      </div>
      {shown.length > SHOWN ? (
        <Fold title={`${shown.length - SHOWN} more`} summary={`Back to ${from}`} className="mt-1">
          <div role="table" aria-label="More transactions">{shown.slice(SHOWN).map((t) => <Row key={t.id} t={t} options={options} />)}</div>
        </Fold>
      ) : null}
    </div>
  )
}
