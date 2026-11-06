import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getUser } from '@/core/user'
import { SPEND_CATEGORIES } from '@/core/categorize'
import { transactionsBetween, isSpend } from '@/core/metrics'
import { formatDay, formatTime, localDate, localHour } from '@/core/time'
import { formatMoney } from '@/domain/money'
import { fillDays } from '@/domain/series'
import { QUICK_COMMERCE, monthLabel, monthRange, shiftMonth } from '@/domain/wealth'
import { Badge, Card, CardHeader, PageHeader, Skeleton, Stat } from '@/ui/components/card'
import { DailyBars, RankedBars } from '@/ui/components/charts'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { CategorySelect } from '@/ui/components/wealth/category-select'
import { cn } from '@/ui/cn'
import { Ticker } from '@/ui/components/ticker'

export const metadata: Metadata = { title: 'Spending' }

export default function SpendingPage({ searchParams }: PageProps<'/wealth/spending'>) {
  return (
    <Suspense fallback={<SpendingSkeleton />}>
      <Spending searchParams={searchParams} />
    </Suspense>
  )
}

async function Spending({ searchParams }: { searchParams: PageProps<'/wealth/spending'>['searchParams'] }) {
  await connection()
  const user = await getUser()
  const base = user.baseCurrency
  const today = localDate(new Date(), user.timezone)
  const current = today.slice(0, 7)
  const q = (await searchParams).m
  const m = typeof q === 'string' && /^\d{4}-\d{2}$/.test(q) && q <= current ? q : current
  const [from, monthEnd] = monthRange(m)
  const to = m === current ? today : monthEnd

  const txns = await transactionsBetween(user, from, to)
  const spend = txns.filter(isSpend)
  const spent = spend.reduce((s, t) => s - t.base, 0)
  const income = txns.filter((t) => t.base > 0 && t.category !== 'Transfers').reduce((s, t) => s + t.base, 0)
  const days = Number(to.slice(8))
  const quick = spend.filter((t) => QUICK_COMMERCE.has(t.merchant ?? ''))
  const quickTotal = quick.reduce((s, t) => s - t.base, 0)
  const lateNight = quick.filter((t) => { const h = localHour(t.at, user.timezone); return h >= 23 || h < 4 })
  const small = spend.filter((t) => -t.base < 300)

  const byCat = new Map<string, number>()
  const byMerchant = new Map<string, { value: number; count: number }>()
  const perDay = new Map<string, number>()
  for (const t of spend) {
    const v = -t.base
    byCat.set(t.category ?? 'Uncategorized', (byCat.get(t.category ?? 'Uncategorized') ?? 0) + v)
    const key = t.merchant ?? t.upiId ?? 'Unknown'
    const mm = byMerchant.get(key) ?? { value: 0, count: 0 }
    byMerchant.set(key, { value: mm.value + v, count: mm.count + 1 })
    perDay.set(t.localDate, (perDay.get(t.localDate) ?? 0) + v)
  }
  const cats = [...byCat].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  const merchants = [...byMerchant].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value).slice(0, 8)

  const nav = (
    <div className="flex items-center gap-1">
      <Link href={`/wealth/spending?m=${shiftMonth(m, -1)}`} aria-label="Previous month" className={buttonClass({ variant: 'secondary', size: 'icon' })}>
        <ChevronLeft className="size-4" strokeWidth={2} />
      </Link>
      <span className="min-w-[9.5rem] text-center text-sm font-medium text-ink tabular-nums">{monthLabel(m)}</span>
      {m < current ? (
        <Link href={`/wealth/spending?m=${shiftMonth(m, 1)}`} aria-label="Next month" className={buttonClass({ variant: 'secondary', size: 'icon' })}>
          <ChevronRight className="size-4" strokeWidth={2} />
        </Link>
      ) : (
        <span aria-hidden className={cn(buttonClass({ variant: 'secondary', size: 'icon', pressable: false }), 'opacity-40')}>
          <ChevronRight className="size-4" strokeWidth={2} />
        </span>
      )}
    </div>
  )

  return (
    <>
      <PageHeader eyebrow="Wealth" title="Spending" description="Where your money went, by category and merchant." actions={nav} />
      {txns.length === 0 ? (
        <Card>
          <EmptyState
            title={`No transactions in ${monthLabel(m)}`}
            description={<>Axis SMS arrive through the iPhone Shortcuts inbox, bank and order emails through Gmail, and you can log cash with ⌘K, e.g. “spent 120 chai”.</>}
            action={<Link href="/connectors" className={buttonClass({ variant: 'primary' })}>Set up sources</Link>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-5">
              <Stat label="Spent" value={<Ticker value={spent} currency={base} />} sub={`${spend.length} payments`} />
              <Stat label="Income" value={<Ticker value={income} currency={base} />} />
              <Stat label="Net" value={formatMoney(income - spent, base, { sign: true })} tone={income - spent >= 0 ? 'good' : 'bad'} sub={income - spent >= 0 ? 'Saved' : 'Overspent'} />
              <Stat label="Daily average" value={<Ticker value={days ? spent / days : 0} currency={base} />} sub={`over ${days} days`} />
              <Stat label="Quick commerce" value={`${spent ? Math.round((quickTotal / spent) * 100) : 0}%`} sub={formatMoney(quickTotal, base)} />
            </div>
            {lateNight.length || small.length ? (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-4">
                {lateNight.length ? (
                  <Badge color="var(--cat-mind)">{lateNight.length} late-night order{lateNight.length === 1 ? '' : 's'} · {formatMoney(lateNight.reduce((s, t) => s - t.base, 0), base)}</Badge>
                ) : null}
                {small.length ? (
                  <Badge color="var(--cat-wealth)">{small.length} payments under ₹300 · {formatMoney(small.reduce((s, t) => s - t.base, 0), base)}</Badge>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Daily spending" description={monthLabel(m)} />
            <DailyBars data={fillDays(perDay, from, monthEnd, 0)} color="var(--cat-wealth)" unit="₹" label={`Daily spending in ${monthLabel(m)}`} />
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="By category" />
              {cats.length ? <RankedBars data={cats} color="var(--cat-wealth)" unit="₹" label="Spending by category" /> : <p className="text-[13px] text-ink-3">No spending this month.</p>}
            </Card>
            <Card>
              <CardHeader title="Top merchants" />
              {merchants.length ? (
                <ul className="flex flex-col gap-3">
                  {merchants.map((mm) => (
                    <li key={mm.label} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{mm.label}</span>
                      <span className="text-[12px] text-ink-3 tabular-nums">{mm.count}×</span>
                      <span className="w-24 text-right text-sm font-medium text-ink tabular-nums">{formatMoney(mm.value, base)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-ink-3">No merchants yet.</p>}
            </Card>
          </div>

          <Card className="px-0 pb-2">
            <CardHeader title="Transactions" description={`${txns.length} in ${monthLabel(m)} · changing a category remembers it for that merchant`} className="px-5" />
            <div role="table" aria-label="Transactions" className="text-sm">
              <div role="row" className="hidden grid-cols-[7rem_minmax(0,1fr)_11rem_7rem_7.5rem] gap-4 border-b border-divider px-5 pb-2 text-[12px] font-medium text-ink-3 sm:grid">
                <span role="columnheader">Date</span>
                <span role="columnheader">Merchant</span>
                <span role="columnheader">Category</span>
                <span role="columnheader">Source</span>
                <span role="columnheader" className="text-right">Amount</span>
              </div>
              {txns.map((t) => (
                <div
                  role="row"
                  key={t.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-divider px-5 py-3 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)_11rem_7rem_7.5rem]"
                >
                  <span role="cell" className="col-span-2 text-[12px] text-ink-3 tabular-nums sm:col-span-1 sm:text-[13px]">
                    {formatDay(t.localDate, { day: 'numeric', month: 'short' })} · {formatTime(t.at, user.timezone)}
                  </span>
                  <span role="cell" className="min-w-0">
                    <span className="block truncate text-ink">{t.merchant ?? t.upiId ?? 'Unknown'}</span>
                    {t.upiId && t.upiId !== t.merchant ? <span className="block truncate text-[12px] text-ink-3">{t.upiId}</span> : null}
                  </span>
                  <span role="cell" className="order-last col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
                    <CategorySelect id={t.id} value={t.category ?? 'Uncategorized'} options={[...SPEND_CATEGORIES]} merchant={t.merchant ?? t.upiId ?? 'merchant'} />
                    <span className="sm:hidden"><Badge>{t.source}</Badge></span>
                  </span>
                  <span role="cell" className="hidden sm:block"><Badge>{t.source}</Badge></span>
                  <span role="cell" className={cn('text-right font-medium tabular-nums', t.amount > 0 ? 'text-good' : 'text-ink')}>
                    {formatMoney(t.amount, t.currency, { sign: t.amount > 0 })}
                    {t.currency !== base ? <span className="block text-[12px] font-normal text-ink-3">{formatMoney(t.base, base)}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

function SpendingSkeleton() {
  return (
    <div aria-busy>
      <div className="mb-8 flex items-end justify-between">
        <div><Skeleton className="mb-3 h-4 w-16" /><Skeleton className="h-9 w-48" /></div>
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-[130px] rounded-lg" />
        <Skeleton className="h-[268px] rounded-lg" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Skeleton className="h-[260px] rounded-lg" /><Skeleton className="h-[260px] rounded-lg" /></div>
        <Skeleton className="h-[480px] rounded-lg" />
      </div>
    </div>
  )
}
