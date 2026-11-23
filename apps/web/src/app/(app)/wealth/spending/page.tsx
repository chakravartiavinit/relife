import type { Metadata } from 'next'
import { loadBasket } from '@/core/basket'
import { BasketSections } from '@/ui/components/wealth/basket'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getUser } from '@/core/user'
import { SPEND_CATEGORIES } from '@/core/categorize'
import { transactionsBetween, isSpend, linkedRowCount, linkedRows } from '@/core/metrics'
import { formatDay, formatTime, localDate, localHour } from '@/core/time'
import { categoryPace, totalPace } from '@/domain/category-pace'
import { formatMoney } from '@/domain/money'
import { STEADY_BAND, statusOf } from '@/domain/status-of'
import { QUICK_COMMERCE, monthLabel, monthRange, shiftMonth } from '@/domain/wealth'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { Card, CardHeader, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { Fold } from '@/ui/components/fold'
import { InsightLine } from '@/ui/components/insight-line'
import { PeekLink } from '@/ui/components/peek/peek-link'
import { StatCard } from '@/ui/components/stat-card'
import { StatusRow } from '@/ui/components/status-row'
import { Ticker } from '@/ui/components/ticker'
import { CardLink } from '@/ui/components/area/card-link'
import { CategoryList } from '@/ui/components/wealth/category-list'
import { DayBars, type Day } from '@/ui/components/wealth/day-bars'
import { Transactions, type TxnRow } from '@/ui/components/wealth/transactions'
import { HabitBlock } from '@/ui/components/wealth/weekly-quest'
import { cn } from '@/ui/cn'
import { wealthHabits } from '../wealth-habits'

export const metadata: Metadata = { title: 'Spending' }

const ACCENT = 'var(--cat-wealth)'
const PRIOR_MONTHS = 3
const PAYEES_SHOWN = 3
const names = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? ''))

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
  const lastPrior = shiftMonth(m, -1)

  const [txns, basket, linked, prior, habits] = await Promise.all([
    transactionsBetween(user, from, to), loadBasket(user, m), linkedRowCount(user, from, to),
    transactionsBetween(user, `${shiftMonth(m, -PRIOR_MONTHS)}-01`, monthRange(lastPrior)[1]),
    wealthHabits(user),
  ])
  const linkedList = linked ? await linkedRows(user, from, to) : []
  const money = (v: number, opts?: { sign?: boolean }) => formatMoney(v, base, { decimals: 0, ...opts })
  const spend = txns.filter(isSpend)
  const spent = spend.reduce((s, t) => s - t.base, 0)
  const income = txns.filter((t) => t.base > 0 && t.category !== 'Transfers').reduce((s, t) => s + t.base, 0)
  const days = Number(to.slice(8))
  const quick = spend.filter((t) => QUICK_COMMERCE.has(t.merchant ?? ''))
  const quickTotal = quick.reduce((s, t) => s - t.base, 0)
  const lateNight = quick.filter((t) => { const h = localHour(t.at, user.timezone); return h >= 23 || h < 4 })
  const small = spend.filter((t) => -t.base < 300)
  const sum = (xs: typeof spend) => xs.reduce((s, t) => s - t.base, 0)

  // Each category and the month as a whole against the same days of the 3 months before.
  const history = [...prior.filter(isSpend), ...spend]
  const cats = categoryPace(history, m, days, { fallback: 'Uncategorized' })
  const pace = totalPace(history, m, days)
  const above = cats.filter((c) => c.vsUsual != null && c.vsUsual > STEADY_BAND).slice(0, 2)

  const byMerchant = new Map<string, { value: number; count: number; category: string | null }>()
  const perDay = new Map<string, number>()
  const perDayCat = new Map<string, Map<string, number>>()
  for (const t of spend) {
    const v = -t.base
    const key = t.merchant ?? t.upiId ?? 'Unknown'
    const mm = byMerchant.get(key) ?? { value: 0, count: 0, category: t.category }
    byMerchant.set(key, { value: mm.value + v, count: mm.count + 1, category: mm.category })
    perDay.set(t.localDate, (perDay.get(t.localDate) ?? 0) + v)
    const dc = perDayCat.get(t.localDate) ?? perDayCat.set(t.localDate, new Map()).get(t.localDate)!
    dc.set(t.category ?? 'Uncategorized', (dc.get(t.category ?? 'Uncategorized') ?? 0) + v)
  }
  const merchants = [...byMerchant].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.value - a.value).slice(0, 8)
  const lastDay = Number(monthEnd.slice(8))
  const dayBars: Day[] = Array.from({ length: lastDay }, (_, i) => {
    const date = `${m}-${String(i + 1).padStart(2, '0')}`
    return { date, day: i + 1, value: date > to ? null : (perDay.get(date) ?? 0), label: formatDay(date, { day: 'numeric', month: 'short' }) }
  })
  // The cut day is described by the category that made it: "rent" when more than half of it is one category.
  const cutNote = (d: Day) => {
    const top = [...(perDayCat.get(d.date) ?? [])].sort((a, b) => b[1] - a[1])[0]
    return top && d.value && top[1] / d.value > 0.5 ? `mostly ${top[0].toLowerCase()}` : null
  }

  const lateChange = habits.changes?.find((c) => c.signal.id === 'orders:late')
  const rows: TxnRow[] = txns.map((t) => ({
    id: t.id,
    when: `${formatDay(t.localDate, { day: 'numeric', month: 'short' })} · ${formatTime(t.at, user.timezone)}`,
    name: t.merchant ?? t.upiId ?? 'Unknown',
    upi: t.upiId && t.upiId !== t.merchant ? t.upiId : undefined,
    category: t.category ?? 'Uncategorized',
    source: t.source,
    amountText: formatMoney(t.amount, t.currency, { sign: t.amount > 0, decimals: 0 }),
    baseText: t.currency !== base ? formatMoney(t.base, base, { decimals: 0 }) : undefined,
    kind: isSpend(t) ? 'spend' : t.base > 0 && t.category !== 'Transfers' ? 'income' : 'other',
  }))

  const nav = (
    <div className="flex items-center gap-1">
      <Link href={`/wealth/spending?m=${shiftMonth(m, -1)}`} aria-label="Previous month" className={buttonClass({ variant: 'secondary', size: 'icon' })}>
        <ChevronLeft className="size-4" strokeWidth={1.5} />
      </Link>
      <span className="min-w-[9.5rem] text-center text-label text-ink tabular-nums">{monthLabel(m)}</span>
      {m < current ? (
        <Link href={`/wealth/spending?m=${shiftMonth(m, 1)}`} aria-label="Next month" className={buttonClass({ variant: 'secondary', size: 'icon' })}>
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </Link>
      ) : (
        <span aria-hidden className={cn(buttonClass({ variant: 'secondary', size: 'icon', pressable: false }), 'opacity-40')}>
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </span>
      )}
    </div>
  )

  const sentence = `${spend.length} payment${spend.length === 1 ? '' : 's'} ${m === current ? 'so far this month' : `in ${monthLabel(m)}`}.${
    pace.usual == null ? '' : above.length ? ` ${names(above.map((c, i) => (i ? c.category.toLowerCase() : c.category)))} ${above.length === 1 ? 'is' : 'are'} above usual; the rest is at or under it.` : ' Nothing is above your usual.'}`

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <InsightLine className="max-w-[60ch]" why="Each category is compared with the same days of the 3 months before this one. Above usual means more than 10% over.">{sentence}</InsightLine>
        {nav}
      </div>
      {txns.length === 0 ? (
        <Card>
          <EmptyState
            title={`No transactions in ${monthLabel(m)}`} picture={{ of: 'area', to: 'wealth' }}
            description={<>Spending comes from the order apps you connect (Zomato, Swiggy, Blinkit, Zepto, Flipkart, Amazon, MakeMyTrip). Log anything else with ⌘K, e.g. “spent 120 chai”.</>}
            action={<Link href="/you/connections" className={buttonClass({ variant: 'primary' })}>Set up sources</Link>}
          />
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <PageGrid>
            <GridItem span={{ base: 12, lg: 8 }} className="flex flex-col gap-6">
              <Card aria-labelledby="days-heading">
                <CardHeader title={<span id="days-heading">Each day</span>} action={<CardLink href="#transactions">Transactions</CardLink>} />
                <StatCard
                  bare label="Daily average" color={ACCENT} status={pace.vsUsual == null ? undefined : statusOf({ from: 'month', vsUsual: pace.vsUsual }).word}
                  figure={<Ticker value={days ? spent / days : 0} currency={base} />}
                  note={`Over ${days} ${days === 1 ? 'day' : 'days'}, ${spend.length} payment${spend.length === 1 ? '' : 's'} in all`}
                />
                <div className="mt-5">
                  <DayBars
                    days={dayBars} money={money} monthShort={monthLabel(m).split(' ')[0].slice(0, 3)} todayDay={m === current ? days : undefined}
                    label={`Spending on each day of ${monthLabel(m)}`} cutNote={cutNote}
                  />
                </div>
                <Fold
                  title="Month in numbers" className="mt-2 border-t border-divider pt-1"
                  summary={`${income ? `Income ${money(income)}, ${income - spent >= 0 ? `${money(income - spent)} saved` : `${money(spent - income)} overspent`}, ` : ''}quick commerce ${spent ? Math.round((quickTotal / spent) * 100) : 0}%`}
                >
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 pb-2 ps-6 sm:grid-cols-4">
                    {([
                      ['Spent', money(spent)],
                      ...(income ? [['Income', money(income)], [income - spent >= 0 ? 'Saved' : 'Overspent', money(Math.abs(income - spent))]] : []),
                      ['Quick commerce', `${spent ? Math.round((quickTotal / spent) * 100) : 0}% · ${money(quickTotal)}`],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label} className="min-w-0"><dt className="text-small text-ink-3">{label}</dt><dd className="text-body font-medium text-ink tabular-nums">{value}</dd></div>
                    ))}
                  </dl>
                  {linked ? (
                    <div className="pb-2 ps-6">
                      <p className="text-small text-ink-3">{linked} bank row{linked === 1 ? '' : 's'} matched app orders and {linked === 1 ? 'is' : 'are'} counted once.</p>
                      <ul className="mt-2 divide-y divide-divider rounded-md bg-surface-2">
                        {linkedList.map((r) => (
                          <li key={r.id}>
                            <PeekLink to={{ type: 'txn', id: r.id }} className="flex min-h-11 items-center justify-between gap-3 rounded-md px-3 text-small text-ink hover-fine:bg-surface-3 focus-visible:outline-2 focus-visible:outline-pill">
                              <span className="min-w-0 truncate"><span className="text-ink-3 tabular-nums">{formatDay(r.localDate, { day: 'numeric', month: 'short' })}</span> · {r.description ?? r.merchant ?? 'Bank row'}</span>
                              <span className="shrink-0 tabular-nums">{formatMoney(r.amount, r.currency, { decimals: 0 })}</span>
                            </PeekLink>
                          </li>
                        ))}
                      </ul>
                      {linked > linkedList.length ? <p className="mt-1 text-small text-ink-3">Showing the newest {linkedList.length}.</p> : null}
                    </div>
                  ) : null}
                </Fold>
              </Card>

              <Card aria-labelledby="cats-heading">
                <CardHeader title={<span id="cats-heading">By category</span>} description={m === current ? 'Against your last 3 months by this day' : 'Against the 3 months before'} />
                <CategoryList rows={cats} money={money} lead={5} by={m === current ? ' by now' : ''} />
              </Card>
            </GridItem>

            <GridItem span={{ base: 12, lg: 4 }} className="flex flex-col gap-6">
              <Card aria-labelledby="habits-heading">
                <CardHeader title={<span id="habits-heading">Order habits</span>} description={monthLabel(m).split(' ')[0]} />
                <HabitBlock habits={habits} today={today} prefer="link" />
                <div className={habits.change || habits.link || habits.quest ? 'mt-3 border-t border-divider pt-1' : undefined}>
                  {lateNight.length ? (
                    <StatusRow
                      picture={{ of: 'routine', name: 'sleep' }} name="Late-night orders" line={`${lateNight.length} this month, ${money(sum(lateNight))}`}
                      status={lateChange ? statusOf({ from: 'change', change: lateChange }).word : undefined}
                    />
                  ) : null}
                  {small.length ? <StatusRow picture={{ of: 'routine', name: 'money' }} name="Small payments" line={`${small.length} under ₹300, ${money(sum(small))} in all`} /> : null}
                  {quickTotal ? <StatusRow picture={{ of: 'routine', name: 'energy' }} name="Quick commerce" line={`${Math.round((quickTotal / spent) * 100)}% of spending, ${money(quickTotal)}`} /> : null}
                </div>
              </Card>

              <Card aria-labelledby="payees-heading">
                <CardHeader title={<span id="payees-heading">Paid to most</span>} description="Apps, shops and people" />
                {merchants.length ? (
                  <>
                    <Payees list={merchants.slice(0, PAYEES_SHOWN)} money={money} />
                    {merchants.length > PAYEES_SHOWN ? (
                      <Fold title={`${merchants.length - PAYEES_SHOWN} more`} summary={names(merchants.slice(PAYEES_SHOWN, PAYEES_SHOWN + 4).map((x) => x.label))} className="mt-1">
                        <Payees list={merchants.slice(PAYEES_SHOWN)} money={money} />
                      </Fold>
                    ) : null}
                  </>
                ) : <p className="text-small text-ink-3">No payments yet.</p>}
              </Card>

              <BasketSections b={basket} month={m} base={base} />
            </GridItem>

            <GridItem span={{ base: 12, lg: 12 }}>
              <Card id="transactions" aria-labelledby="txns-heading">
                <CardHeader
                  title={<span id="txns-heading">Transactions</span>}
                  description={`${txns.length} in ${monthLabel(m)}. Change a category once and it sticks for that name`}
                />
                <Transactions rows={rows} options={[...SPEND_CATEGORIES]} from={formatDay(from, { day: 'numeric', month: 'short' })} />
              </Card>
            </GridItem>
          </PageGrid>
        </div>
      )}
    </>
  )
}

function Payees({ list, money }: { list: { label: string; value: number; count: number; category: string | null }[]; money: (v: number) => string }) {
  return (
    <div>
      {list.map((x) => (
        <StatusRow
          key={x.label} picture={{ of: 'merchant', name: x.label, category: x.category ?? undefined }} name={x.label} line={`${x.count} payment${x.count === 1 ? '' : 's'}`}
          value={money(x.value)} peek={x.label === 'Unknown' ? undefined : { type: 'merchant', id: x.label }}
        />
      ))}
    </div>
  )
}

function SpendingSkeleton() {
  return (
    <div aria-busy>
      <div className="flex items-center justify-between gap-3"><Skeleton className="h-12 w-[28rem] max-w-full" /><Skeleton className="h-10 w-56" /></div>
      <div className="@container mt-6">
        <div className="grid grid-cols-1 gap-6 grid-lg:grid-cols-12">
          <div className="flex flex-col gap-6 grid-lg:col-span-8">
            <Skeleton className="h-[500px] rounded-lg" />
            <Skeleton className="h-[460px] rounded-lg" />
          </div>
          <div className="flex flex-col gap-6 grid-lg:col-span-4">
            <Skeleton className="h-[430px] rounded-lg" />
            <Skeleton className="h-[320px] rounded-lg" />
            <Skeleton className="h-[160px] rounded-lg" />
          </div>
          <Skeleton className="h-[640px] rounded-lg grid-lg:col-span-12" />
        </div>
      </div>
    </div>
  )
}
