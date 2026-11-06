import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { convert } from '@/core/fx'
import { transactionsBetween, isSpend } from '@/core/metrics'
import { upcomingPayments } from '@/core/schedules'
import { addDays, localDate } from '@/core/time'
import { formatMoney } from '@/domain/money'
import { fillDays } from '@/domain/series'
import { dueLabel, monthRange, pctChange, shiftMonth, signedBalance, timeAgo } from '@/domain/wealth'
import { Card, CardHeader, KpiStrip, PageHeader, Skeleton, Badge } from '@/ui/components/card'
import { DailyBars, RankedBars } from '@/ui/components/charts'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { cn } from '@/ui/cn'
import { Ticker } from '@/ui/components/ticker'

export const metadata: Metadata = { title: 'Wealth' }

export default function WealthPage() {
  return (
    <>
      <PageHeader eyebrow="Wealth" title="Net worth & money" description="Balances, crypto and where your money goes." />
      <Suspense fallback={<WealthSkeleton />}>
        <Wealth />
      </Suspense>
    </>
  )
}

async function Wealth() {
  await connection()
  const user = await getUser()
  const now = new Date()
  const today = localDate(now, user.timezone)
  const base = user.baseCurrency
  const month = today.slice(0, 7)
  const lastMonthStart = `${shiftMonth(month, -1)}-01`
  // Compare month-to-date with the same days of last month.
  const lastMonthEnd = monthRange(shiftMonth(month, -1))[1]
  const sameDay = `${shiftMonth(month, -1)}-${today.slice(8)}`
  const lastMonthSameDay = sameDay < lastMonthEnd ? sameDay : lastMonthEnd
  const from30 = addDays(today, -29)

  const [accounts, holdings, txns, payments] = await Promise.all([
    db.select().from(schema.accounts).where(eq(schema.accounts.userId, user.id)),
    db.select().from(schema.holdings).where(eq(schema.holdings.userId, user.id)),
    transactionsBetween(user, from30 < lastMonthStart ? from30 : lastMonthStart, today),
    upcomingPayments(user, now),
  ])

  // Crypto value per exchange account, in base currency.
  const cryptoByAccount = new Map<string, number>()
  for (const h of holdings) {
    const v = await convert(h.qty * (h.priceUsd ?? 0), 'USD', base, today)
    cryptoByAccount.set(h.accountId, (cryptoByAccount.get(h.accountId) ?? 0) + (v ?? 0))
  }

  const rows = await Promise.all(accounts.map(async (a) => {
    const crypto = cryptoByAccount.get(a.id)
    const raw = crypto ?? (a.latestBalance == null ? null : await convert(a.latestBalance, a.currency, base, today))
    const value = raw == null ? null : crypto != null ? raw : signedBalance(a.kind, raw)
    const stale = a.balanceAt ? now.getTime() - a.balanceAt.getTime() > 2 * 86_400_000 : false
    return { a, value, stale }
  }))

  const netWorth = rows.reduce((s, r) => s + (r.value ?? 0), 0)
  const cash = rows.filter((r) => r.a.kind === 'bank' || r.a.kind === 'wallet').reduce((s, r) => s + (r.value ?? 0), 0)
  const crypto = [...cryptoByAccount.values()].reduce((s, v) => s + v, 0)

  const spend = txns.filter(isSpend)
  const thisMonth = spend.filter((t) => t.localDate >= `${month}-01`).reduce((s, t) => s - t.base, 0)
  const lastMonth = spend.filter((t) => t.localDate >= lastMonthStart && t.localDate <= lastMonthSameDay).reduce((s, t) => s - t.base, 0)
  const delta = pctChange(thisMonth, lastMonth)

  const perDay = new Map<string, number>()
  for (const t of spend) if (t.localDate >= from30) perDay.set(t.localDate, (perDay.get(t.localDate) ?? 0) - t.base)
  const byCat = new Map<string, number>()
  for (const t of spend) if (t.localDate >= `${month}-01`) byCat.set(t.category ?? 'Uncategorized', (byCat.get(t.category ?? 'Uncategorized') ?? 0) - t.base)
  const topCats = [...byCat].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6)
  const due = payments.filter((p) => p.daysLeft <= 30).slice(0, 5)

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip items={[
        { label: 'Net worth', value: <Ticker value={netWorth} currency={base} />, sub: `${accounts.length} account${accounts.length === 1 ? '' : 's'}` },
        { label: 'Cash in bank', value: <Ticker value={cash} currency={base} /> },
        { label: 'Crypto', value: <Ticker value={crypto} currency={base} />, sub: holdings.length ? `${holdings.length} assets` : 'Not connected' },
        {
          label: 'Spent this month', value: formatMoney(thisMonth, base),
          sub: delta == null ? 'No data for last month' : `${delta > 0 ? '+' : ''}${Math.round(delta)}% vs same days last month`,
          tone: delta == null ? undefined : delta > 0 ? 'bad' : 'good',
        },
      ]} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="Spending, last 30 days"
              description={formatMoney(spend.filter((t) => t.localDate >= from30).reduce((s, t) => s - t.base, 0), base) + ' total'}
              action={<Link href="/wealth/spending" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Details</Link>}
            />
            <DailyBars data={fillDays(perDay, from30, today, 0)} color="var(--cat-wealth)" unit="₹" label="Daily spending, last 30 days" />
          </Card>
          <Card>
            <CardHeader title="Top categories" description="This month" />
            {topCats.length ? (
              <RankedBars data={topCats} color="var(--cat-wealth)" unit="₹" label="Spending by category this month" />
            ) : (
              <p className="text-[13px] text-ink-3">No spending recorded this month yet.</p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Accounts" />
            {rows.length ? (
              <ul className="-my-1 flex flex-col divide-y divide-divider">
                {rows.sort((x, y) => (y.value ?? 0) - (x.value ?? 0)).map(({ a, value, stale }) => (
                  <li key={a.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink">{a.name}</div>
                      <div className={cn('text-[12px]', stale ? 'text-warn' : 'text-ink-3')}>
                        {a.balanceAt ? `${stale ? 'Stale · ' : ''}Updated ${timeAgo(a.balanceAt, now)}` : cryptoByAccount.has(a.id) ? 'Live holdings' : 'No balance yet'}
                      </div>
                    </div>
                    <span className={cn('text-sm font-medium tabular-nums', value != null && value < 0 ? 'text-bad' : 'text-ink')}>
                      {value == null ? '–' : formatMoney(value, base)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No accounts yet"
                description="Bank balances arrive from Axis SMS and email alerts. Connect Binance in Connectors for crypto."
                action={<Link href="/connectors" className={buttonClass({ variant: 'primary' })}>Open connectors</Link>}
              />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Upcoming payments"
              description="Next 30 days"
              action={<Link href="/wealth/subscriptions" className={buttonClass({ variant: 'ghost', size: 'sm' })}>All</Link>}
            />
            {due.length ? (
              <ul className="flex flex-col gap-3">
                {due.map((p) => (
                  <li key={p.schedule.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink">{p.schedule.name}</div>
                      <div className="text-[12px] text-ink-3">{dueLabel(p.daysLeft)}</div>
                    </div>
                    {p.daysLeft <= 3 ? <Badge color="var(--warn)">Soon</Badge> : null}
                    {p.amount ? <span className="text-sm font-medium text-ink tabular-nums">{formatMoney(p.amount, p.currency ?? base)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">Nothing due in the next 30 days.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function WealthSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-[118px] rounded-lg" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-[268px] rounded-lg" />
          <Skeleton className="h-[220px] rounded-lg" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-[240px] rounded-lg" />
          <Skeleton className="h-[200px] rounded-lg" />
        </div>
      </div>
    </div>
  )
}
