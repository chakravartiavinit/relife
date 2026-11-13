import type { Metadata } from 'next'
import { ArrowRight, BellRing, CalendarClock, ChartColumnStacked, Coins, Gauge, History, Repeat, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { spendColor } from '@/core/wealth-overview'
import { formatMoney } from '@/domain/money'
import { dueLabel, monthLabel, timeAgo } from '@/domain/wealth'
import { AREAS } from '@/core/areas'
import { wealthOverview } from '@/core/areas/wealth'
import { AreaKpis } from '@/ui/components/area/area-layout'
import { Card, CardHeader, Skeleton } from '@/ui/components/card'
import { StackedBars } from '@/ui/components/charts'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { Ticker } from '@/ui/components/ticker'
import { BrandLogo } from '@/ui/components/brand-logo'
import { CoinLogo } from '@/ui/components/coin-logo'
import { coinInfo } from '@/core/coin-logos'
import { cn } from '@/ui/cn'

export const metadata: Metadata = { title: 'Wealth' }

type Overview = Awaited<ReturnType<typeof wealthOverview>>

const ACCENT = 'var(--cat-wealth)'
// These format local calendar dates ("2026-11"), so read them in UTC: no time zone may shift them a day.
const SHORT_MONTH = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' })
const MONTH_YEAR = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`
const more = (href: string, label: string) => (
  <Link href={href} className={buttonClass({ variant: 'ghost', size: 'sm' })}><span className="max-sm:sr-only">{label}</span><ArrowRight className="size-3.5" strokeWidth={2} aria-hidden /></Link>
)

export default function WealthPage() {
  return (
    <Suspense fallback={<WealthSkeleton />}>
      <Wealth />
    </Suspense>
  )
}

async function Wealth() {
  await connection()
  const user = await getUser()
  const o = await wealthOverview(user)
  const money = (v: number, opts?: { sign?: boolean }) => formatMoney(v, o.base, { decimals: 0, ...opts })

  if (o.empty) {
    return (
      <Card>
        <EmptyState
          title="No money data yet" icon={Coins} color={ACCENT}
          description="Connect Binance, your order apps (Zomato, Swiggy, Blinkit, Zepto, Amazon, Flipkart) or add a subscription, and this page fills in."
          action={<Link href="/you/connections" className={buttonClass({ variant: 'primary' })}>Open connections</Link>}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <AreaKpis def={AREAS.wealth} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <MonthPace o={o} money={money} />
        <Nudges o={o} />
      </div>

      <Card>
        <CardHeader
          title="12 months of spending" icon={<ChartColumnStacked strokeWidth={2} />} color={ACCENT}
          description={`${money(o.year)} in 12 months · ${money(o.year / 12)} a month on average`}
          action={more('/wealth/spending', 'Spending')}
        />
        <StackedBars
          label="Spending per month by category, last 12 months" unit={o.base === 'INR' ? '₹' : o.base} height={240}
          categories={o.months.map((m) => SHORT_MONTH.format(new Date(`${m}-15T00:00:00Z`)))}
          series={o.categories.map((c) => ({ id: c, name: c, color: spendColor(c), values: o.months.map((m) => o.byMonthCat.get(m)?.get(c) ?? 0) }))}
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Apps o={o} money={money} />
        <RepeatBuys o={o} money={money} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Investments o={o} money={money} />
        <Subscriptions o={o} money={money} />
        <AllTime o={o} money={money} />
      </div>
    </div>
  )
}

type Props = { o: Overview; money: (v: number, opts?: { sign?: boolean }) => string }

/** The month so far: spent, where it lands at this pace, and a usual month marked on the same track. */
function MonthPace({ o, money }: Props) {
  const { pace } = o
  const scale = Math.max(pace.projected, pace.usual ?? 0, pace.spent, 1) * 1.08
  const at = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  const over = pace.vsUsual != null && pace.vsUsual > 0.1
  const under = pace.vsUsual != null && pace.vsUsual < -0.1
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={`${monthLabel(o.month)} so far`} icon={<Gauge strokeWidth={2} />} color={ACCENT}
        description={`Day ${pace.day} of ${pace.daysInMonth}${pace.oneOff ? ` · ${money(pace.oneOff)} in one-off big orders, counted once` : ''}`}
      />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="font-display text-[34px] leading-none font-extrabold tracking-[-0.03em] text-ink tabular-nums"><Ticker value={pace.spent} currency={o.base} /></p>
          <p className="mt-2 text-[13px] text-ink-3">spent this month</p>
        </div>
        <div className="text-right">
          <p className="text-[15px] font-semibold text-ink tabular-nums">{money(pace.projected)} <span className="font-normal text-ink-3">at this pace</span></p>
          {pace.vsUsual != null ? (
            <p className={cn('mt-1 text-[13px] font-medium tabular-nums', over ? 'text-bad' : under ? 'text-good' : 'text-ink-2')}>
              {pace.vsUsual > 0 ? '▲' : '▼'} {pct(pace.vsUsual)} {pace.vsUsual > 0 ? 'above' : 'below'} your usual {money(pace.usual!)} month
            </p>
          ) : <p className="mt-1 text-[13px] text-ink-3">A usual month needs two months of history</p>}
        </div>
      </div>

      {/* Track: solid = spent, light = the rest of the month at this pace, line = a usual month. Pinned to the
          bottom, so a taller neighbour leaves the gap above it, not under the legend. */}
      <div className="mt-auto">
      <div className="relative mt-6 mb-7" aria-hidden>
        <div className="relative h-3 overflow-hidden rounded-full bg-surface-2">
          <span className="reveal-fill absolute inset-y-0 left-0 w-full rounded-full opacity-30" style={{ '--fill': at(pace.projected), background: over ? 'var(--bad)' : ACCENT } as React.CSSProperties} />
          <span className="reveal-fill absolute inset-y-0 left-0 w-full rounded-full" style={{ '--fill': at(pace.spent), background: over ? 'var(--bad)' : ACCENT, '--i': 2 } as React.CSSProperties} />
        </div>
        {pace.usual ? (
          <div className="absolute -top-1.5 -bottom-1.5 flex -translate-x-1/2 flex-col items-center" style={{ left: at(pace.usual) }}>
            <span className="w-0.5 flex-1 rounded-full bg-ink" />
            <span className="absolute top-full mt-1 text-[11px] font-medium whitespace-nowrap text-ink-2 tabular-nums">Usual {money(pace.usual)}</span>
          </div>
        ) : null}
      </div>

      {o.thisMonthCats.length ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-divider pt-4 text-[13px]">
          {o.thisMonthCats.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: spendColor(c.label) }} />
              <span className="text-ink-2">{c.label}</span>
              <span className="font-medium text-ink tabular-nums">{money(c.value)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="border-t border-divider pt-4 text-[13px] text-ink-3">No orders yet this month.</p>}
      </div>
    </Card>
  )
}

/** The latest money nudges ReLife sent, and what it keeps an eye on. */
function Nudges({ o }: { o: Overview }) {
  return (
    <Card>
      <CardHeader title="What ReLife noticed" icon={<BellRing strokeWidth={2} />} color={ACCENT} description="Money nudges sent to Telegram, last 30 days" action={more('/coach', 'All')} />
      {o.nudges.length ? (
        <ul className="flex flex-col gap-1">
          {o.nudges.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-[12px] py-2">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-[18px]">{n.payload.emoji ?? '💡'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-snug font-medium text-ink">{n.title}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">{[n.payload.meta, timeAgo(n.createdAt)].filter(Boolean).join(' · ')}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[14px] bg-surface-2 p-4">
          <p className="text-[13.5px] font-medium text-ink">All quiet so far</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">You get a Telegram nudge when something moves: your month&apos;s pace, a spending spike, a repeat buy above usual, a new subscription, a coin swing or a futures position near liquidation.</p>
        </div>
      )}
    </Card>
  )
}

function Apps({ o, money }: Props) {
  const max = Math.max(1, ...o.apps.map((a) => a.total))
  return (
    <Card>
      <CardHeader title="Where you order from" icon={<ShoppingBag strokeWidth={2} />} color={ACCENT} description="Last 12 months" />
      {o.apps.length ? (
        <ul className="flex flex-col gap-4">
          {o.apps.map((a, i) => (
            <li key={a.name} className="flex items-center gap-3">
              <BrandLogo name={a.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] font-medium text-ink">{a.name}</span>
                  <span className="text-[14px] font-semibold text-ink tabular-nums">{money(a.total)}</span>
                </div>
                <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="reveal-fill block h-full w-full rounded-full" style={{ '--fill': `${(a.total / max) * 100}%`, background: ACCENT, '--i': i } as React.CSSProperties} />
                </span>
                <p className="mt-1 text-[12px] text-ink-3 tabular-nums">{a.orders} order{a.orders === 1 ? '' : 's'} · {money(a.avg)} each{a.last30 ? ` · ${a.last30} in the last 30 days` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13px] text-ink-3">No orders in the last 12 months.</p>}
    </Card>
  )
}

function RepeatBuys({ o, money }: Props) {
  return (
    <Card>
      <CardHeader title="Bought again and again" icon={<Repeat strokeWidth={2} />} color={ACCENT} description="Last 90 days · what small repeats add up to" action={more('/wealth/spending', 'Items')} />
      {o.repeat.length ? (
        <ol className="flex flex-col divide-y divide-divider">
          {o.repeat.map((r, i) => (
            <li key={r.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-2 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink">{r.name}</p>
                <p className="text-[12px] text-ink-3 tabular-nums">On {r.days} days · {Math.round(r.qty)} bought</p>
              </div>
              <div className="text-right tabular-nums">
                <p className="text-[14px] font-semibold text-ink">{money(r.spend)}</p>
                <p className="text-[11.5px] text-ink-3">≈ {money(r.spend / 3)} a month</p>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="text-[13px] text-ink-3">Nothing bought on three or more days in the last 90 days.</p>}
    </Card>
  )
}

async function Investments({ o, money }: Props) {
  const { invest } = o
  const info = invest.coins.length ? await coinInfo([...invest.coins.map((c) => c.asset), ...invest.positions.map((x) => x.coin)]) : {}
  const logo = (a: string) => info[a.toUpperCase()]?.logo
  return (
    <Card>
      <CardHeader title="Investments" icon={<Coins strokeWidth={2} />} color={ACCENT} description="Binance" action={more('/wealth/portfolio', 'Portfolio')} />
      {invest.empty ? <p className="text-[13px] text-ink-3">Connect Binance in You › Connections to see holdings and profit.</p> : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="font-display text-[26px] leading-none font-extrabold tracking-[-0.02em] text-ink tabular-nums"><Ticker value={invest.worth} currency={o.base} /></p>
            <p className={cn('mt-1.5 text-[13px] font-medium tabular-nums', invest.pnl >= 0 ? 'text-good' : 'text-bad')}>{money(invest.pnl, { sign: true })} all time <span className="font-normal text-ink-3">· {money(invest.open, { sign: true })} open</span></p>
          </div>
          {invest.positions.length ? (
            <ul className="flex flex-col gap-2">
              {invest.positions.map((x) => {
                const risky = x.away != null && x.away <= 0.05
                return (
                  <li key={x.symbol + x.side} className={cn('flex items-center gap-2.5 rounded-[12px] px-3 py-2', risky ? 'bg-[color-mix(in_oklch,var(--bad)_10%,transparent)]' : 'bg-surface-2')}>
                    <CoinLogo symbol={x.coin} logo={logo(x.coin)} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{x.symbol} <span className="text-ink-3">{x.side === 'long' ? 'Long' : 'Short'} {x.leverage}×</span></span>
                    {x.away != null ? <span className={cn('text-[12px] font-semibold tabular-nums', risky ? 'text-bad' : x.away <= 0.15 ? 'text-warn' : 'text-ink-2')}>{(x.away * 100).toFixed(1)}% to liq.</span> : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
          {invest.coins.length ? (
            <ul className="flex flex-wrap gap-2">
              {invest.coins.map((c) => (
                <li key={c.asset} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-2.5 pl-1 text-[12px]">
                  <CoinLogo symbol={c.asset} logo={logo(c.asset)} size="sm" className="size-5" />
                  <span className="font-medium text-ink">{c.asset}</span>
                  <span className="text-ink-3 tabular-nums">{money(c.value)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function Subscriptions({ o, money }: Props) {
  const { subs } = o
  return (
    <Card>
      <CardHeader title="Subscriptions" icon={<CalendarClock strokeWidth={2} />} color={ACCENT} description={`${subs.count} active`} action={more('/wealth/subscriptions', 'All')} />
      <p className="font-display text-[26px] leading-none font-extrabold tracking-[-0.02em] text-ink tabular-nums">{money(subs.monthly)}<span className="ml-1 font-sans text-[13px] font-normal tracking-normal text-ink-3">/ month</span></p>
      <p className="mt-1.5 text-[13px] text-ink-3 tabular-nums">{money(subs.monthly * 12)} a year</p>
      {subs.next.length ? (
        <ul className="mt-4 flex flex-col gap-3 border-t border-divider pt-4">
          {subs.next.map((x) => (
            <li key={x.schedule.id} className="flex items-center gap-3">
              <BrandLogo name={x.schedule.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-ink">{x.schedule.name}</p>
                <p className={cn('text-[12px]', x.daysLeft <= 3 ? 'font-medium text-warn' : 'text-ink-3')}>{dueLabel(x.daysLeft)}</p>
              </div>
              {x.amount ? <span className="text-[13.5px] font-medium text-ink tabular-nums">{formatMoney(x.amount, x.currency ?? o.base)}</span> : null}
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 border-t border-divider pt-4 text-[13px] text-ink-3">Nothing renews in the next 30 days.</p>}
    </Card>
  )
}

function AllTime({ o, money }: Props) {
  return (
    <Card>
      <CardHeader title="All time" icon={<History strokeWidth={2} />} color={ACCENT} description="Every order since your history begins" />
      <ul className="flex flex-col gap-4">
        {o.allTime.map((c) => (
          <li key={c.category}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: spendColor(c.category) }} />{c.category}
              </span>
              <span className="text-[14px] font-semibold text-ink tabular-nums">{money(c.total)}</span>
            </div>
            <p className="mt-0.5 pl-[18px] text-[12px] text-ink-3 tabular-nums">
              {c.orders.toLocaleString('en-IN')} orders since {MONTH_YEAR.format(new Date(`${c.first}T00:00:00Z`))} · {money(c.total / c.orders)} each
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function WealthSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-[118px] rounded-lg" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[290px] rounded-lg" />
        <Skeleton className="h-[290px] rounded-lg" />
      </div>
      <Skeleton className="h-[330px] rounded-lg" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-[380px] rounded-lg" />
        <Skeleton className="h-[380px] rounded-lg" />
      </div>
    </div>
  )
}
