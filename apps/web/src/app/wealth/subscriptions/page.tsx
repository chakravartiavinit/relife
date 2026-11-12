import type { Metadata } from 'next'
import { Bell, CalendarClock, ChartPie, CreditCard, LayoutGrid, Plus } from 'lucide-react'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { convert } from '@/core/fx'
import { monthlyCost } from '@/core/schedules'
import { localDate, localDayRange } from '@/core/time'
import { nextOccurrence, parseSimple } from '@/domain/recurrence'
import { formatMoney } from '@/domain/money'
import { dueLabel } from '@/domain/wealth'
import { Badge, Card, CardHeader, KpiStrip, PageHeader, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { Button } from '@/ui/components/button'
import { AddSubscription, type SubscriptionValues } from '@/ui/components/wealth/subscription-form'
import { SubscriptionActions } from '@/ui/components/wealth/subscription-actions'
import { cn } from '@/ui/cn'
import { Ticker } from '@/ui/components/ticker'
import { BrandLogo } from '@/ui/components/brand-logo'
import { ShareDonut } from '@/ui/components/charts'

export const metadata: Metadata = { title: 'Subscriptions' }

const KIND_LABEL = { subscription: 'Subscription', bill: 'Bill', renewal: 'Renewal' } as const
const FREQ_LABEL = { monthly: 'Monthly', yearly: 'Yearly', weekly: 'Weekly', daily: 'Daily' } as const
const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30.44, yearly: 365.25 } as const
const SHARE_COLORS = ['var(--cat-wealth)', 'var(--pill)', 'var(--cat-mind)', 'var(--cat-relationships)', 'var(--cat-health)']
const SOON_DAYS = 3
const UPCOMING_DAYS = 30

export default function SubscriptionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Wealth" title="Subscriptions & bills" description="Everything that renews, with a reminder before it charges."
        actions={<Suspense fallback={<Button variant="primary" disabled><Plus className="size-4" strokeWidth={2} /> Add subscription</Button>}><AddButton /></Suspense>}
      />
      <Suspense fallback={<SubscriptionsSkeleton />}>
        <Subscriptions />
      </Suspense>
    </>
  )
}

async function AddButton() {
  await connection()
  const user = await getUser()
  return <AddSubscription today={localDate(new Date(), user.timezone)} baseCurrency={user.baseCurrency} />
}

async function Subscriptions() {
  await connection()
  const user = await getUser()
  const base = user.baseCurrency
  const now = new Date()
  const today = localDate(now, user.timezone)
  const [todayStart] = localDayRange(today, user.timezone)
  const dayMonth = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: user.timezone })
  const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: user.timezone })

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
    const chargeBase = s.amount ? (cur === base ? s.amount : (await convert(s.amount, cur, base, today)) ?? 0) : 0
    const rule = parseSimple(s.rrule)
    // How much of the billing period has passed: fills up as the next charge gets closer.
    const cycle = daysLeft != null ? Math.min(1, Math.max(0, 1 - daysLeft / (PERIOD_DAYS[rule.freq] * (rule.interval ?? 1)))) : null
    const values: SubscriptionValues & { id: string } = {
      id: s.id, name: s.name, kind: s.kind as SubscriptionValues['kind'], amount: s.amount ?? undefined, currency: cur,
      freq: rule.freq === 'daily' ? 'weekly' : rule.freq,
      remindOffsetMin: s.remindOffsetMin ?? 0, start: due ? localDate(due, user.timezone) : rule.start,
    }
    return { s, due, daysLeft, cur, monthlyBase, chargeBase, rule, cycle, values }
  }))
  items.sort((a, b) => Number(b.s.active) - Number(a.s.active) || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9))

  const active = items.filter((i) => i.s.active)
  const paused = items.length - active.length
  const monthly = active.reduce((s, i) => s + i.monthlyBase, 0)
  const next = active.find((i) => i.daysLeft != null)
  const upcoming = active.filter((i) => i.due && i.daysLeft != null && i.daysLeft <= UPCOMING_DAYS)
  const byCost = [...active].filter((i) => i.monthlyBase > 0).sort((a, b) => b.monthlyBase - a.monthlyBase)
  // The donut shows the top 5 services; anything past that, or under 5% of the total (a slice too thin to read), is folded.
  const costTotal = byCost.reduce((s, i) => s + i.monthlyBase, 0)
  const slices = byCost.slice(0, 5).filter((i) => i.monthlyBase >= costTotal * 0.05)
  const folded = byCost.slice(slices.length)

  if (!items.length) {
    return (
      <Card>
        <EmptyState
          title="No subscriptions yet" icon={CreditCard} color="var(--cat-wealth)"
          description="Add Netflix, Claude, Amazon Prime or a card bill and you'll get a Telegram reminder before each charge."
          action={<AddSubscription today={today} baseCurrency={base} />}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip items={[
        { label: 'Per month', value: <Ticker value={monthly} currency={base} />, sub: `${active.length} active${paused ? ` · ${paused} paused` : ''}` },
        { label: 'Per year', value: <Ticker value={monthly * 12} currency={base} />, sub: 'At today’s rates' },
        { label: 'Next 30 days', value: formatMoney(upcoming.reduce((s, i) => s + i.chargeBase, 0), base, { decimals: 0 }), sub: `${upcoming.length} charge${upcoming.length === 1 ? '' : 's'}` },
        { label: 'Next charge', value: next ? dueLabel(next.daysLeft!) : '–', sub: next ? `${next.s.name}${next.s.amount ? ` · ${formatMoney(next.s.amount, next.cur)}` : ''}` : 'Nothing scheduled' },
      ]} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* What charges next, as a dated timeline. */}
        <Card className="px-0 pb-2">
          <CardHeader title="Coming up" icon={<CalendarClock strokeWidth={2} />} color="var(--cat-wealth)" description={`Charges in the next ${UPCOMING_DAYS} days`} className="px-5" />
          {upcoming.length ? (
            <ol>
              {upcoming.map(({ s, due, daysLeft, cur }) => {
                const soon = daysLeft! <= SOON_DAYS
                return (
                  <li key={s.id} className="flex items-center gap-4 border-t border-divider px-5 py-3 first:border-t-0">
                    <div className={cn('grid w-12 shrink-0 place-items-center rounded-[10px] py-1.5 text-center leading-none tabular-nums', soon ? 'bg-[color-mix(in_oklch,var(--warn)_14%,transparent)] text-warn' : 'bg-surface-2 text-ink-2')}>
                      <span className="text-[17px] font-bold">{dayMonth.format(due!).split(' ')[0]}</span>
                      <span className="mt-1 text-[10.5px] font-semibold uppercase">{dayMonth.format(due!).split(' ')[1]}</span>
                    </div>
                    <BrandLogo name={s.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{s.name}</p>
                      <p className={cn('text-[12px]', soon ? 'font-medium text-warn' : 'text-ink-3')}>{dueLabel(daysLeft!)} · {weekday.format(due!)}</p>
                    </div>
                    <p className="shrink-0 text-[14px] font-semibold text-ink tabular-nums">{s.amount ? formatMoney(s.amount, cur) : '–'}</p>
                  </li>
                )
              })}
            </ol>
          ) : <p className="px-5 pb-4 text-[13px] text-ink-3">Nothing charges in the next {UPCOMING_DAYS} days.</p>}
        </Card>

        <Card>
          <CardHeader title="Where it goes" icon={<ChartPie strokeWidth={2} />} color="var(--cat-wealth)" description="Monthly cost by service" />
          <ShareDonut
            label="Monthly cost by service" unit={base === 'INR' ? '₹' : base} totalLabel="Per month"
            segments={[
              ...slices.map((i, n) => ({ id: i.s.id, name: i.s.name, color: SHARE_COLORS[n], value: i.monthlyBase })),
              ...(folded.length ? [{ id: 'other', name: 'Everything else', color: 'var(--ink-3)', value: folded.reduce((s, i) => s + i.monthlyBase, 0) }] : []),
            ]}
          />
        </Card>
      </div>

      <section aria-labelledby="all-subs">
        <div className="mb-3 flex items-center gap-2 px-1">
          <LayoutGrid className="size-4 text-ink-3" strokeWidth={2} aria-hidden />
          <h2 id="all-subs" className="text-[15px] font-semibold text-ink">All subscriptions</h2>
          <span className="text-[13px] text-ink-3 tabular-nums">{items.length}</span>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(({ s, due, daysLeft, cur, monthlyBase, rule, cycle, values }, i) => {
            const soon = daysLeft != null && daysLeft <= SOON_DAYS
            const perMonthDiffers = s.amount != null && rule.freq !== 'monthly'
            return (
              <li key={s.id}>
                <Card className={cn('flex h-full flex-col gap-4 p-5', !s.active && 'opacity-60')}>
                  <div className="flex items-start gap-3">
                    <BrandLogo name={s.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{s.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                        {s.kind !== 'subscription' ? `${KIND_LABEL[s.kind as keyof typeof KIND_LABEL]} · ` : ''}{FREQ_LABEL[rule.freq]}
                        {!s.active ? <Badge>Paused</Badge> : null}
                      </p>
                    </div>
                    <div className="-mt-1 -mr-2"><SubscriptionActions values={values} active={s.active} today={today} baseCurrency={base} /></div>
                  </div>

                  <div className="flex items-baseline justify-between gap-3 tabular-nums">
                    <p className="text-[22px] font-bold tracking-[-0.02em] text-ink">
                      {s.amount ? formatMoney(s.amount, cur) : <span className="text-[15px] font-medium text-ink-3">No amount</span>}
                      {s.amount ? <span className="ml-1 text-[13px] font-normal text-ink-3">/ {rule.freq === 'yearly' ? 'year' : rule.freq === 'weekly' ? 'week' : 'month'}</span> : null}
                    </p>
                    {perMonthDiffers || (s.amount && cur !== base) ? <p className="text-[12px] text-ink-3">≈ {formatMoney(monthlyBase, base, { decimals: 0 })}/mo</p> : null}
                  </div>

                  <div className="mt-auto">
                    {s.active && cycle != null ? (
                      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span className={cn('reveal-hbar block h-full rounded-full', soon ? 'bg-warn' : 'bg-pill')} style={{ width: `${cycle * 100}%`, transformOrigin: 'left', '--i': i } as React.CSSProperties} />
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-3 text-[12px]">
                      <span className={cn(soon ? 'font-semibold text-warn' : 'text-ink-2')}>
                        {!s.active ? 'Paused, no reminders' : due ? `Renews ${dueLabel(daysLeft!).toLowerCase()} · ${dayMonth.format(due)}` : 'No upcoming charge'}
                      </span>
                      {s.active && s.remindOffsetMin ? (
                        <span className="inline-flex items-center gap-1 text-ink-3" title="Telegram reminder before the charge">
                          <Bell className="size-3" strokeWidth={2} aria-hidden />{Math.round(s.remindOffsetMin / 1440)}d before
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function SubscriptionsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-[118px] rounded-lg" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[340px] rounded-lg" />
        <Skeleton className="h-[340px] rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[172px] rounded-lg" />)}
      </div>
    </div>
  )
}
