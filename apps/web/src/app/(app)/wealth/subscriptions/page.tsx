import type { Metadata } from 'next'
import { Bell, Plus } from 'lucide-react'
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
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { Card, CardHeader, SectionLabel, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { Button } from '@/ui/components/button'
import { AddSubscription, type SubscriptionValues } from '@/ui/components/wealth/subscription-form'
import { SubscriptionActions } from '@/ui/components/wealth/subscription-actions'
import { cn } from '@/ui/cn'
import { Ticker } from '@/ui/components/ticker'
import { Picture } from '@/ui/components/picture'
import { StatCard } from '@/ui/components/stat-card'
import { StatusRow } from '@/ui/components/status-row'
import { StatusWord } from '@/ui/components/status-word'
import { ShareDonut } from '@/ui/components/charts'

export const metadata: Metadata = { title: 'Subscriptions' }

const KIND_LABEL = { subscription: 'Subscription', bill: 'Bill', renewal: 'Renewal' } as const
const FREQ_LABEL = { monthly: 'Monthly', yearly: 'Yearly', weekly: 'Weekly', daily: 'Daily' } as const
const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30.44, yearly: 365.25 } as const
const SOON_DAYS = 3
const UPCOMING_DAYS = 30

export default function SubscriptionsPage() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-body text-ink-2">Everything that renews, with a reminder before it charges.</p>
        <Suspense fallback={<Button variant="primary" disabled><Plus className="size-4" strokeWidth={2} /> Add subscription</Button>}><AddButton /></Suspense>
      </div>
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
    const due = s.active ? safeNext(s.rrule, new Date(todayStart.getTime() - 1), user.timezone) : null
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
          title="No subscriptions yet" picture={{ of: 'category', name: 'Subscriptions' }}
          description="Add Netflix, Claude, Amazon Prime or a card bill and you'll get a Telegram reminder before each charge."
          action={<AddSubscription today={today} baseCurrency={base} />}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageGrid>
        <GridItem span={{ base: 12, lg: 5 }} className="[&>*]:h-full">
          <StatCard
            label="Per month" color="var(--cat-wealth)"
            figure={<Ticker value={monthly} currency={base} />}
            note={`${active.length} active${paused ? ` · ${paused} paused` : ''}`}
            peek={{ type: 'brief', id: 'wealth' }} className="justify-center"
          />
        </GridItem>
        <GridItem span={{ base: 12, lg: 7 }} className="[&>*]:h-full">
          <Card aria-label="What it adds up to" className="flex flex-col justify-center py-3">
            <StatusRow name="Per year" line="At today’s rates" trailing={<span className="text-body font-medium text-ink tabular-nums"><Ticker value={monthly * 12} currency={base} /></span>} />
            <StatusRow
              name="Next 30 days" line={`${upcoming.length} charge${upcoming.length === 1 ? '' : 's'}`}
              trailing={<span className="text-body font-medium text-ink tabular-nums">{formatMoney(upcoming.reduce((s, i) => s + i.chargeBase, 0), base, { decimals: 0 })}</span>}
            />
            <StatusRow
              name="Next charge" line={next ? `${next.s.name}${next.s.amount ? ` · ${formatMoney(next.s.amount, next.cur)}` : ''}` : 'Nothing scheduled'}
              trailing={<span className="text-body font-medium text-ink">{next ? dueLabel(next.daysLeft!) : '–'}</span>}
            />
          </Card>
        </GridItem>
      </PageGrid>

      <PageGrid>
        {/* What charges next, in date order. */}
        <GridItem span={{ base: 12, lg: 8 }} className="[&>*]:h-full">
          <Card>
            <CardHeader title="Coming up" description={`Charges in the next ${UPCOMING_DAYS} days`} />
            {upcoming.length ? (
              <ol>
                {upcoming.map(({ s, due, daysLeft, cur }) => (
                  <li key={s.id}>
                    <StatusRow
                      picture={{ of: 'merchant', name: s.name }} name={s.name}
                      line={`${dueLabel(daysLeft!)} · ${weekday.format(due!)} ${dayMonth.format(due!)}`}
                      trailing={
                        <span className="flex items-center gap-3">
                          {daysLeft! <= SOON_DAYS ? <StatusWord tone="warn">Soon</StatusWord> : null}
                          <span className="text-body font-medium text-ink tabular-nums">{s.amount ? formatMoney(s.amount, cur) : '–'}</span>
                        </span>
                      }
                    />
                  </li>
                ))}
              </ol>
            ) : <p className="text-small text-ink-3">Nothing charges in the next {UPCOMING_DAYS} days.</p>}
          </Card>
        </GridItem>

        <GridItem span={{ base: 12, lg: 4 }} className="[&>*]:h-full">
          <Card>
            <CardHeader title="Where it goes" description="Monthly cost by service" />
            <ShareDonut accent="var(--cat-wealth)"
              label="Monthly cost by service" unit={base === 'INR' ? '₹' : base} totalLabel="Per month"
              segments={[
                ...slices.map((i) => ({ id: i.s.id, name: i.s.name, color: 'var(--ink-3)', value: i.monthlyBase })),
                ...(folded.length ? [{ id: 'other', name: 'Everything else', color: 'var(--ink-3)', value: folded.reduce((s, i) => s + i.monthlyBase, 0) }] : []),
              ]}
            />
          </Card>
        </GridItem>
      </PageGrid>

      <section aria-labelledby="all-subs">
        <SectionLabel id="all-subs" className="mb-3 px-1" action={<span className="text-small text-ink-3 tabular-nums">{items.length}</span>}>All subscriptions</SectionLabel>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(({ s, due, daysLeft, cur, monthlyBase, rule, cycle, values }, i) => {
            const soon = daysLeft != null && daysLeft <= SOON_DAYS
            const perMonthDiffers = s.amount != null && rule.freq !== 'monthly'
            const renews = due ? `Renews ${dueLabel(daysLeft!).toLowerCase()} · ${dayMonth.format(due)}` : 'No upcoming charge'
            return (
              <li key={s.id}>
                <Card className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <Picture of="merchant" name={s.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-ink">{s.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-small text-ink-3">
                        <span>{s.kind !== 'subscription' ? `${KIND_LABEL[s.kind as keyof typeof KIND_LABEL]} · ` : ''}{FREQ_LABEL[rule.freq]}</span>
                        {!s.active ? <StatusWord tone="quiet">Paused</StatusWord> : null}
                      </p>
                    </div>
                    <div className="-mt-1 -mr-2"><SubscriptionActions values={values} active={s.active} today={today} baseCurrency={base} /></div>
                  </div>

                  <div className="flex items-baseline justify-between gap-3 tabular-nums">
                    <p className="text-heading font-medium text-ink">
                      {s.amount ? formatMoney(s.amount, cur) : <span className="text-ink-3">No amount</span>}
                      {s.amount ? <span className="ml-1 text-small font-normal text-ink-3">/ {rule.freq === 'yearly' ? 'year' : rule.freq === 'weekly' ? 'week' : 'month'}</span> : null}
                    </p>
                    {perMonthDiffers || (s.amount && cur !== base) ? <p className="text-small text-ink-3">≈ {formatMoney(monthlyBase, base, { decimals: 0 })}/mo</p> : null}
                  </div>

                  <div className="mt-auto">
                    {s.active && cycle != null ? (
                      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span className={cn('reveal-hbar block h-full rounded-full', soon ? 'bg-warn' : 'bg-pill')} style={{ width: `${cycle * 100}%`, transformOrigin: 'left', '--i': i } as React.CSSProperties} />
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-3 text-small">
                      {!s.active ? <span className="text-ink-2">Paused, no reminders</span> : soon ? <StatusWord tone="warn">{renews}</StatusWord> : <span className="text-ink-2">{renews}</span>}
                      {s.active && s.remindOffsetMin ? (
                        <span className="inline-flex items-center gap-1 text-ink-3" title="Telegram reminder before the charge">
                          <Bell className="size-3" strokeWidth={1.5} aria-hidden />{Math.round(s.remindOffsetMin / 1440)}d before
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Skeleton className="h-[140px] rounded-lg" />
        <Skeleton className="h-[188px] rounded-lg" />
      </div>
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

/** A malformed stored rule shows as "no next date" instead of failing the whole page. */
function safeNext(rule: string, after: Date, tz: string) {
  try { return nextOccurrence(rule, after, tz) } catch (e) {
    console.error('[subscriptions] bad rule:', e instanceof Error ? e.message : e)
    return null
  }
}
