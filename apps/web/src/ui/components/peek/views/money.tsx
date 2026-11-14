'use client'

import brand from '@relife/brand/brand.json'
import { Link2Off } from 'lucide-react'
import { useTransition } from 'react'
import { setTransactionLink } from '@/app/actions'
import type { MerchantPeek, TxnPeek } from '@/core/peek/types'
import { formatMoney } from '@/domain/money'
import { CATEGORY } from '@/ui/tokens'
import { cn } from '../../../cn'
import { Badge } from '../../card'
import { Button } from '../../button'
import { useToast } from '../../toast'
import { usePeekChanged } from '../peek-context'
import { BrandLogo } from '../../brand-logo'
import { CategorySelect } from '../../wealth/category-select'
import { PeekLink } from '../peek-link'
import { PeekFooter, PeekNote, PeekOpen, PeekRow, PeekSection } from '../peek-parts'

const WEALTH = CATEGORY.wealth.color
const LINK = 'rounded-xs font-medium text-pill-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill'
const name = (d: { merchant: string | null; upiId: string | null }) => d.merchant ?? d.upiId ?? 'Payment'

export function txnHeading(d: TxnPeek) {
  return { title: name(d), description: `Wealth · payment · ${d.when}`, icon: <BrandLogo name={name(d)} size="md" /> }
}

export function merchantHeading(d: MerchantPeek) {
  return { title: d.name, description: 'Wealth · merchant', icon: <BrandLogo name={d.name} size="md" /> }
}

/** "Change once, the app remembers it" with the picker, and what is already remembered. */
function CategoryBlock({ id, category, categories, merchant, rule }: { id: string; category: string | null; categories: string[]; merchant: string; rule: { pattern: string; category: string } | null }) {
  return (
    <div className="mt-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-small font-medium text-ink">Category</p>
        <p className="text-caption text-ink-3">Change once, {brand.name} remembers it for {merchant}.</p>
        {rule ? <p className="mt-1 text-caption text-ink-3">Remembered: “{rule.pattern}” goes to {rule.category}.</p> : null}
      </div>
      <CategorySelect id={id} value={category ?? 'Uncategorized'} options={categories} merchant={merchant} />
    </div>
  )
}

/** A bank row that matched an app order: counted once, as the order. One button says the match is wrong, for good. */
function SamePayment({ id, order }: { id: string; order: { id: string; label: string } }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const changed = usePeekChanged()
  const unlink = () => start(async () => {
    try {
      await setTransactionLink(id, null)
      changed()
      toast('Counted on its own now', 'neutral', {
        description: `Not the same payment as ${order.label}`,
        action: { label: 'Undo', onClick: () => { void setTransactionLink(id, order.id).then(changed, () => toast.error()) } },
      })
    } catch {
      toast.error()
    }
  })
  return (
    <PeekNote label="Same payment">
      <p>Same payment as <PeekLink to={{ type: 'txn', id: order.id }} className={LINK}>{order.label}</PeekLink> · not counted twice.</p>
      <Button size="sm" variant="secondary" className="mt-2" disabled={pending} onClick={unlink}><Link2Off className="size-3.5" strokeWidth={1.5} aria-hidden />Not the same payment</Button>
    </PeekNote>
  )
}

const spent = (d: Pick<TxnPeek, 'base' | 'baseCurrency'>) => formatMoney(Math.abs(d.base), d.baseCurrency, { decimals: Math.abs(d.base) >= 1000 ? 0 : 2 })

/** One payment: the amount, its category picker, the order's items and where it came from. */
export function TxnPeekView({ data: d }: { data: TxnPeek }) {
  const out = d.base < 0
  return (
    <div>
      <p className="num text-display text-ink tabular-nums">{out ? '−' : ''}{spent(d)}</p>
      {d.currency !== d.baseCurrency ? <p className="text-small text-ink-3 tabular-nums">{formatMoney(Math.abs(d.amount), d.currency)}</p> : null}
      {d.category === 'Uncategorized' ? <div className="mt-2"><Badge color="var(--warn)">Needs a category</Badge></div> : null}

      {d.sameAs ? <SamePayment id={d.id} order={d.sameAs} /> : null}
      {d.paidFrom ? (
        <PeekNote label="Paid from">
          Paid from {d.paidFrom.account ?? 'your bank statement'} on {d.paidFrom.when}.{' '}
          <PeekLink to={{ type: 'txn', id: d.paidFrom.id }} className={LINK}>See the bank row</PeekLink>, where “Not the same payment” unlinks it.
        </PeekNote>
      ) : null}

      <CategoryBlock id={d.id} category={d.category} categories={d.categories} merchant={name(d)} rule={d.rule} />

      {d.items.length ? (
        <PeekSection label="In this order" aside={d.platform ?? undefined}>
          <ul className="divide-y divide-divider">
            {d.items.map((i, n) => (
              <li key={n} className="flex items-baseline justify-between gap-3 py-2 text-small">
                <span className="min-w-0 truncate text-ink">{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}</span>
                {i.price != null ? <span className="shrink-0 text-ink-3 tabular-nums">{formatMoney(i.price, d.currency)}</span> : null}
              </li>
            ))}
          </ul>
        </PeekSection>
      ) : null}

      <PeekSection label="Details">
        <PeekRow label="When">{d.when}</PeekRow>
        <PeekRow label="Source">{d.source}</PeekRow>
        {d.account ? <PeekRow label="Account">{d.account}</PeekRow> : null}
        {d.upiId ? <PeekRow label="UPI id">{d.upiId}</PeekRow> : null}
      </PeekSection>
      <PeekFooter><PeekOpen href="/wealth/spending">Open Spending</PeekOpen></PeekFooter>
    </div>
  )
}

/** Six months of bars with the usual month as a dashed line. */
function MonthBars({ months, usual }: { months: MerchantPeek['months']; usual: number | null }) {
  const max = Math.max(...months.map((m) => m.value), usual ?? 0, 1)
  return (
    <div className="relative">
      <div role="img" aria-label={`Spent per month: ${months.map((m) => `${m.label} ${Math.round(m.value)}`).join(', ')}`} className="flex h-28 items-end gap-2">
        {months.map((m, i) => (
          <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className={cn('min-h-0.5 rounded-t-xs', i === months.length - 1 ? '' : 'opacity-60')} style={{ height: `${(m.value / max) * 100}%`, background: WEALTH }} />
          </div>
        ))}
      </div>
      {usual ? <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-3" style={{ bottom: `${(usual / max) * 100}%` }} /> : null}
      <div aria-hidden className="mt-1.5 flex gap-2 text-caption text-ink-3">{months.map((m) => <span key={m.month} className="min-w-0 flex-1 text-center">{m.label}</span>)}</div>
    </div>
  )
}

/** Everything paid to one merchant: this month against the usual, six months, the last payments and the category. */
export function MerchantPeekView({ data: d }: { data: MerchantPeek }) {
  const money = (v: number) => formatMoney(v, d.baseCurrency, { decimals: 0 })
  const high = d.ratio != null && d.ratio >= 1.5
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="num text-display text-ink tabular-nums">{money(d.thisMonth.total)}</span>
        {d.ratio != null ? <Badge color={high ? 'var(--bad)' : undefined}>{d.ratio.toFixed(1)}× usual</Badge> : null}
      </p>
      <p className="mt-1 text-small text-ink-3 tabular-nums">
        {d.thisMonth.count} {d.thisMonth.count === 1 ? 'payment' : 'payments'} this month{d.thisMonth.count ? ` · avg ${money(d.thisMonth.total / d.thisMonth.count)}` : ''}
      </p>

      <PeekSection label="6 months" aside={d.usual ? `dashed = usual ${money(d.usual)}` : undefined}><MonthBars months={d.months} usual={d.usual} /></PeekSection>
      <p className="mt-3 text-caption text-ink-3 tabular-nums">Last 30 days {money(d.last30.total)} ({d.last30.count}) · last 12 months {money(d.last12.total)} ({d.last12.count})</p>

      {d.categoryTxnId ? <CategoryBlock id={d.categoryTxnId} category={d.category} categories={d.categories} merchant={d.name} rule={d.rule} /> : null}

      <PeekSection label="Latest payments">
        <ul className="divide-y divide-divider">
          {d.latest.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-small">
              <span className="text-ink-2 tabular-nums">{t.when}</span>
              <span className="font-medium text-ink tabular-nums">{formatMoney(t.amount, t.currency, { decimals: Math.abs(t.amount) >= 1000 ? 0 : 2 })}</span>
            </li>
          ))}
        </ul>
      </PeekSection>
      {d.last12.count > d.latest.length ? <PeekNote>Showing the latest {d.latest.length} of {d.last12.count} payments in 12 months.</PeekNote> : null}
      <PeekFooter><PeekOpen href="/wealth/spending">Open Spending</PeekOpen></PeekFooter>
    </div>
  )
}
