import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { convert } from '@/core/fx'
import { describeRule, monthlyCost } from '@/core/schedules'
import { localDate, localDayRange } from '@/core/time'
import { nextOccurrence } from '@/domain/recurrence'
import { formatMoney } from '@/domain/money'
import { dueLabel } from '@/domain/wealth'
import { Badge, Card, CardHeader, PageHeader, Skeleton, Stat } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { SubscriptionForm } from '@/ui/components/wealth/subscription-form'
import { SubscriptionActions } from '@/ui/components/wealth/subscription-actions'
import { cn } from '@/ui/cn'
import { Ticker } from '@/ui/components/ticker'

export const metadata: Metadata = { title: 'Subscriptions' }

const KIND_LABEL = { subscription: 'Subscription', bill: 'Bill', renewal: 'Renewal' } as const

export default function SubscriptionsPage() {
  return (
    <>
      <PageHeader eyebrow="Wealth" title="Subscriptions & bills" description="Everything that renews, with a reminder before it charges." />
      <Suspense fallback={<SubscriptionsSkeleton />}>
        <Subscriptions />
      </Suspense>
    </>
  )
}

async function Subscriptions() {
  await connection()
  const user = await getUser()
  const base = user.baseCurrency
  const now = new Date()
  const today = localDate(now, user.timezone)
  const [todayStart] = localDayRange(today, user.timezone)

  const list = await db.select().from(schema.schedules).where(and(
    eq(schema.schedules.userId, user.id),
    inArray(schema.schedules.kind, ['subscription', 'bill', 'renewal']),
  ))

  const items = await Promise.all(list.map(async (s) => {
    const due = s.active ? nextOccurrence(s.rrule, new Date(todayStart.getTime() - 1), user.timezone) : null
    const daysLeft = due
      ? Math.round((Date.parse(`${localDate(due, user.timezone)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
      : null
    const cur = s.currency ?? base
    const monthlyBase = s.amount ? (await convert(monthlyCost(s), cur, base, today)) ?? 0 : 0
    const amountBase = s.amount && cur !== base ? await convert(s.amount, cur, base, today) : null
    return { s, due, daysLeft, cur, monthlyBase, amountBase }
  }))
  items.sort((a, b) => Number(b.s.active) - Number(a.s.active) || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9))

  const active = items.filter((i) => i.s.active)
  const monthly = active.reduce((s, i) => s + i.monthlyBase, 0)
  const next = active.find((i) => i.daysLeft != null)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-6">
        <Card>
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3">
            <Stat label="Per month" value={<Ticker value={monthly} currency={base} />} sub={`${active.length} active`} />
            <Stat label="Per year" value={<Ticker value={monthly * 12} currency={base} />} />
            <Stat
              label="Next charge"
              value={next ? dueLabel(next.daysLeft!) : '–'}
              sub={next ? `${next.s.name}${next.s.amount ? ` · ${formatMoney(next.s.amount, next.cur)}` : ''}` : undefined}
              className="col-span-2 md:col-span-1"
            />
          </div>
        </Card>

        <Card className="px-0 pb-2">
          <CardHeader title="All renewals" className="px-5" />
          {items.length ? (
            <ul>
              {items.map(({ s, daysLeft, cur, monthlyBase, amountBase }) => {
                const soon = daysLeft != null && daysLeft <= 3
                return (
                  <li key={s.id} className={cn('flex items-center gap-4 border-b border-divider px-5 py-3.5 last:border-b-0', !s.active && 'opacity-60')}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] text-ink">{s.name}</span>
                        {s.kind !== 'subscription' ? <Badge>{KIND_LABEL[s.kind as keyof typeof KIND_LABEL]}</Badge> : null}
                        {!s.active ? <Badge>Paused</Badge> : soon ? <Badge color="var(--warn)">{dueLabel(daysLeft!)}</Badge> : null}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-ink-3">
                        {describeRule(s.rrule).replace(/ · .*$/, '')}
                        {daysLeft != null && !soon ? ` · ${dueLabel(daysLeft)}` : ''}
                        {s.remindOffsetMin ? ` · reminder ${Math.round(s.remindOffsetMin / 1440)}d before` : ''}
                      </div>
                      <div className="mt-1 tabular-nums sm:hidden">
                        <Amount amount={s.amount} cur={cur} base={base} amountBase={amountBase} monthlyBase={monthlyBase} inline />
                      </div>
                    </div>
                    <div className="hidden text-right tabular-nums sm:block">
                      <Amount amount={s.amount} cur={cur} base={base} amountBase={amountBase} monthlyBase={monthlyBase} />
                    </div>
                    <SubscriptionActions id={s.id} name={s.name} active={s.active} />
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState title="No subscriptions yet" description="Add Claude, Netflix, Amazon Prime or a card bill and you’ll get a Telegram reminder before each charge." />
          )}
        </Card>
      </div>

      <Card className="self-start lg:sticky lg:top-8">
        <CardHeader title="Add subscription" description="Amounts in any currency, shown in yours" />
        <SubscriptionForm today={today} baseCurrency={base} />
      </Card>
    </div>
  )
}

function Amount({ amount, cur, base, amountBase, monthlyBase, inline }: {
  amount: number | null; cur: string; base: string; amountBase: number | null; monthlyBase: number; inline?: boolean
}) {
  if (!amount) return <span className="text-[13px] text-ink-3">No amount</span>
  // Show the per-month figure only when it differs from the charge itself (yearly, weekly).
  const charge = amountBase ?? amount
  const extra = [amountBase != null ? formatMoney(amountBase, base) : null, Math.abs(monthlyBase - charge) > 0.5 ? `${formatMoney(monthlyBase, base)}/mo` : null]
    .filter(Boolean).join(' · ')
  return inline ? (
    <span className="text-[13px]"><span className="font-medium text-ink">{formatMoney(amount, cur)}</span>{extra ? <span className="text-ink-3"> · {extra}</span> : null}</span>
  ) : (
    <>
      <div className="text-sm font-medium text-ink">{formatMoney(amount, cur)}</div>
      {extra ? <div className="text-[12px] text-ink-3">{extra}</div> : null}
    </>
  )
}

function SubscriptionsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-[118px] rounded-lg" />
        <Skeleton className="h-[420px] rounded-lg" />
      </div>
      <Skeleton className="h-[520px] rounded-lg" />
    </div>
  )
}
