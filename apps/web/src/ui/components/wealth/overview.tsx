import { BellRing } from 'lucide-react'
import type { loadWealthOverview } from '@/core/wealth-overview'
import { formatMoney } from '@/domain/money'
import { dueLabel, monthLabel, timeAgo } from '@/domain/wealth'
import { cn } from '../../cn'
import { CardLink } from '../area/card-link'
import { BrandLogo } from '../brand-logo'
import { Card, CardHeader, Skeleton } from '../card'
import { StackedBars } from '../charts'
import { CoinLogo } from '../coin-logo'
import { Fold } from '../fold'
import { GridItem, PageGrid } from '../page-grid'
import { Rail } from '../rail'
import { Ticker } from '../ticker'
import { CategoryList } from './category-list'

// The Wealth Overview on the page grid, as presentational pieces (`/dev/ui` draws them from a fixture):
//   Row 1  November so far (the pace bar, then the month bars) 8 | where it went, a ranked list 4
//   Row 2  net worth 6 | subscriptions 6
//   Row 3  where you order from 8 | what ReLife noticed and bought again 4
// Each number is shown once: the head's brief carries the pace sentence, these cards carry the figures. On a phone each
// card shows its first rows and folds the rest ("7 more categories"), and the two small cards at the end are folds.

export type WealthOverview = Awaited<ReturnType<typeof loadWealthOverview>>
type Money = (v: number, opts?: { sign?: boolean }) => string

const ACCENT = 'var(--cat-wealth)'
// These format local calendar dates ("2026-11"), so read them in UTC: no time zone may shift them a day.
const SHORT_MONTH = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' })
const MONTH_YEAR = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const SHOWN_APPS = 8
const APPS_ON_PHONE = 3
const SUBS_ON_PHONE = 2

/** A card that is a fold on a phone: its head shows from 640px, below that the fold's own summary row stands in. */
function FoldCard({ title, description, summary, action, children, className }: {
  title: string; description?: string; summary?: string; action?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <Fold inline card title={title} summary={summary ?? description} className={className}>
      <header className="hidden items-start justify-between gap-4 pt-4 pb-4 grid-md:flex">
        <div className="min-w-0"><h2 className="text-heading text-ink">{title}</h2>{description ? <p className="mt-0.5 text-small text-ink-3">{description}</p> : null}</div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </Fold>
  )
}

/** The month so far: the number, a bar of spent / projected with a usual month marked on it, then the months side by side. */
function MonthCard({ o, money }: { o: WealthOverview; money: Money }) {
  const { pace } = o
  const scale = Math.max(pace.projected, pace.usual ?? 0, pace.spent, 1) * 1.08
  const at = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  // The month the bars lead with is the one the list leads with: this month's biggest.
  const lead = o.thisMonthCats[0]?.label
  return (
    <Card aria-labelledby="month-heading">
      <CardHeader
        className="mb-5" title={<span id="month-heading">{monthLabel(o.month)} so far</span>}
        description={`Day ${pace.day} of ${pace.daysInMonth}${pace.oneOff ? ` · ${money(pace.oneOff)} in one-off big orders, counted once` : ''}`}
        action={<CardLink href="/wealth/spending">Spending</CardLink>}
      />
      <p className="num text-display text-ink"><Ticker value={pace.spent} currency={o.base} /></p>
      <p className="mt-1 text-small text-ink-3">spent this month</p>

      {/* Solid is spent, light is the rest of the month at this pace, the tick is a usual month. */}
      <div className="relative mt-5" role="img" aria-label={`Spent ${money(pace.spent)}; ${money(pace.projected)} at this pace${pace.usual ? `; a usual month is ${money(pace.usual)}` : ''}`}>
        <div className="relative h-3 overflow-hidden rounded-full bg-ink/[0.08]">
          <span className="reveal-fill absolute inset-0 rounded-full opacity-30" style={{ '--fill': at(pace.projected), background: ACCENT } as React.CSSProperties} />
          <span className="reveal-fill absolute inset-0 rounded-full" style={{ '--fill': at(pace.spent), background: ACCENT, '--i': 2 } as React.CSSProperties} />
        </div>
        {pace.usual ? <span aria-hidden className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-xs bg-ink" style={{ left: at(pace.usual) }} /> : null}
      </div>
      <dl className="mt-2.5 flex flex-wrap justify-between gap-x-6 gap-y-1 text-caption text-ink-2 tabular-nums">
        {pace.usual ? <div className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-0.5 rounded-xs bg-ink" /><dt className="sr-only">A usual month</dt><dd>Usual {money(pace.usual)}</dd></div> : <span />}
        <div className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full opacity-30" style={{ background: ACCENT }} /><dt className="sr-only">At this pace</dt><dd>{money(pace.projected)} at this pace</dd></div>
      </dl>

      <div className="mt-6 border-t border-divider pt-5">
        <h3 className="text-heading text-ink">Spending by month</h3>
        <p className="mt-0.5 mb-4 text-small text-ink-3 tabular-nums">
          {o.activeMonths ? `${money(o.year)} in ${o.activeMonths} ${o.activeMonths === 1 ? 'month' : 'months'} · ${money(o.year / o.activeMonths)} a month on average` : 'Nothing spent in the last 12 months'}
        </p>
        <StackedBars
          label="Spending per month by category, last 12 months" unit={o.base === 'INR' ? '₹' : o.base} height={240} top={3} lead={lead} accent={ACCENT}
          categories={o.months.map((m) => SHORT_MONTH.format(new Date(`${m}-15T00:00:00Z`)))}
          // One neutral colour for every series: the chart picks the lead (accent) and the ramp itself.
          series={o.categories.map((c) => ({ id: c, name: c, color: 'var(--ink-3)', values: o.months.map((m) => o.byMonthCat.get(m)?.get(c) ?? 0) }))}
        />
      </div>
    </Card>
  )
}

function WhereItWent({ o }: { o: WealthOverview }) {
  return (
    <Card aria-labelledby="where-heading" className="h-full">
      <CardHeader
        title={<span id="where-heading">Where it went</span>} description={`${o.allTime.length} ${o.allTime.length === 1 ? 'category' : 'categories'}, largest first`}
        action={<CardLink href="/wealth/spending">Spending</CardLink>}
      />
      <CategoryList
        base={o.base} accent={ACCENT} lead={o.thisMonthCats[0]?.label} monthName={monthLabel(o.month).split(' ')[0]}
        month={o.thisMonthCats}
        all={o.allTime.map((c) => ({ label: c.category, value: c.total, sub: `${c.orders.toLocaleString('en-IN')} orders since ${MONTH_YEAR.format(new Date(`${c.first}T00:00:00Z`))} · ${formatMoney(c.total / c.orders, o.base, { decimals: 0 })} each` }))}
      />
    </Card>
  )
}

/** Net worth and what it is made of: the investment profit, then each coin as a bar and any futures position near its liquidation. */
function NetWorth({ o, money, logos }: { o: WealthOverview; money: Money; logos: Record<string, boolean> }) {
  const { invest } = o
  const maxCoin = Math.max(1, ...invest.coins.map((c) => c.value))
  return (
    <Card aria-labelledby="worth-heading" className="flex h-full flex-col">
      <CardHeader
        className="mb-5" title={<span id="worth-heading">Net worth</span>} action={<CardLink href="/wealth/portfolio">Portfolio</CardLink>}
        description={invest.empty ? 'Connect Binance or a bank' : `Binance · spot ${money(invest.spot)} · futures ${money(invest.futures)}`}
      />
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
        <div>
          <p className="num text-display text-ink"><Ticker value={o.netWorth} currency={o.base} /></p>
          <p className="mt-1 text-small text-ink-3">net worth</p>
        </div>
        {invest.empty ? null : (
          <div>
            <p className={cn('num text-title', invest.pnl >= 0 ? 'text-good' : 'text-bad')}>{money(invest.pnl, { sign: true })}</p>
            <p className="mt-1 text-small text-ink-3 tabular-nums">investment P&L, all time · {money(invest.open, { sign: true })} open</p>
          </div>
        )}
      </div>
      {invest.coins.length || invest.positions.length ? (
        <Fold inline title="Binance spot, by coin" summary={`${invest.coins.length} coins`} className="mt-5">
          {invest.coins.length ? (
            <ul className="flex flex-col">
              {invest.coins.map((c) => (
                <li key={c.asset} className="grid min-h-11 grid-cols-[1.75rem_3rem_minmax(0,1fr)_auto] items-center gap-x-3">
                  <CoinLogo symbol={c.asset} logo={logos[c.asset.toUpperCase()]} size="sm" className="size-6" />
                  <span className="text-body font-medium text-ink">{c.asset}</span>
                  <span aria-hidden className="h-1 overflow-hidden rounded-full bg-ink/[0.08]"><span className="reveal-fill block h-full w-full rounded-full bg-ink-2" style={{ '--fill': `${(c.value / maxCoin) * 100}%` } as React.CSSProperties} /></span>
                  <span className="text-end text-body text-ink tabular-nums">{money(c.value)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {invest.positions.length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {invest.positions.map((x) => {
                const risky = x.away != null && x.away <= 0.05
                return (
                  <li key={x.symbol + x.side} className={cn('flex items-center gap-2.5 rounded-md px-3 py-2', risky ? 'bg-bad/10' : 'bg-surface-2')}>
                    <CoinLogo symbol={x.coin} logo={logos[x.coin.toUpperCase()]} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-small text-ink">{x.symbol} <span className="text-ink-3">{x.side === 'long' ? 'Long' : 'Short'} {x.leverage}×</span></span>
                    {x.away != null ? <span className={cn('text-caption font-medium tabular-nums', risky ? 'text-bad' : x.away <= 0.15 ? 'text-warn' : 'text-ink-2')}>{(x.away * 100).toFixed(1)}% to liq.</span> : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </Fold>
      ) : invest.empty ? <p className="mt-5 text-small text-ink-3">Connect Binance in You › Connections to see holdings and profit.</p> : null}
    </Card>
  )
}

function Subscriptions({ o, money }: { o: WealthOverview; money: Money }) {
  const { subs } = o
  const row = (x: (typeof subs.next)[number]) => (
    <li key={x.schedule.id} className="flex min-h-12 items-center gap-3 py-1.5">
      <BrandLogo name={x.schedule.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-ink">{x.schedule.name}</p>
        <p className={cn('text-caption', x.daysLeft <= 3 ? 'font-medium text-warn' : 'text-ink-3')}>{dueLabel(x.daysLeft)}</p>
      </div>
      {x.amount ? <span className="text-body font-medium text-ink tabular-nums">{formatMoney(x.amount, x.currency ?? o.base)}</span> : null}
    </li>
  )
  const first = subs.next.slice(0, SUBS_ON_PHONE), rest = subs.next.slice(SUBS_ON_PHONE)
  return (
    <Card aria-labelledby="subs-heading" className="h-full">
      <CardHeader
        className="mb-5" title={<span id="subs-heading">Subscriptions</span>} action={<CardLink href="/wealth/subscriptions">All</CardLink>}
        description={`${subs.count} active · ${money(subs.monthly * 12)} a year`}
      />
      <p className="num text-display text-ink"><Ticker value={subs.monthly} currency={o.base} /><span className="ms-1.5 font-sans text-small font-normal text-ink-3">/ month</span></p>
      <p className="mt-1 text-small text-ink-3">across {subs.count} {subs.count === 1 ? 'subscription' : 'subscriptions'}</p>
      {subs.next.length ? (
        <div className="mt-5">
          <h3 className="mb-1 text-small font-medium text-ink-3">Renews next</h3>
          <ul className="flex flex-col divide-y divide-divider border-t border-divider">{first.map(row)}</ul>
          {rest.length ? <Fold inline title={`${rest.length} more ${rest.length === 1 ? 'renewal' : 'renewals'}`}><ul className="flex flex-col divide-y divide-divider">{rest.map(row)}</ul></Fold> : null}
        </div>
      ) : <p className="mt-5 border-t border-divider pt-4 text-small text-ink-3">Nothing renews in the next 30 days.</p>}
    </Card>
  )
}

type App = WealthOverview['apps'][number]

function AppRow({ a, i, max, money }: { a: App; i: number; max: number; money: Money }) {
  return (
    <li className="flex items-center gap-3">
      <BrandLogo name={a.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-body font-medium text-ink">{a.name}</span>
          <span className="text-body font-medium text-ink tabular-nums">{money(a.total)}</span>
        </div>
        <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink/[0.08]">
          <span className="reveal-fill block h-full w-full rounded-full bg-ink-2" style={{ '--fill': `${(a.total / max) * 100}%`, '--i': i } as React.CSSProperties} />
        </span>
        <p className="mt-1 text-caption text-ink-3 tabular-nums">{a.orders} order{a.orders === 1 ? '' : 's'} · {money(a.avg)} each{a.last30 ? ` · ${a.last30} in the last 30 days` : ''}</p>
      </div>
    </li>
  )
}

/** Merchants: eight in two columns, the rest behind "Show N more"; a phone gets the top three in one column and a fold. */
function Merchants({ o, money }: { o: WealthOverview; money: Money }) {
  const max = Math.max(1, ...o.apps.map((a) => a.total))
  const rows = (list: App[], from = 0) => list.map((a, i) => <AppRow key={a.name} a={a} i={from + i} max={max} money={money} />)
  return (
    <Card aria-labelledby="apps-heading" className="h-full">
      <CardHeader title={<span id="apps-heading">Where you order from</span>} description="Last 12 months" action={<CardLink href="/wealth/spending">Spending</CardLink>} />
      {o.apps.length ? (
        <>
          <ul className="hidden gap-x-8 gap-y-5 grid-md:grid grid-md:grid-cols-2">{rows(o.apps.slice(0, SHOWN_APPS))}</ul>
          {o.apps.length > SHOWN_APPS ? (
            <details className="group mt-4 hidden grid-md:block">
              <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-md text-small font-medium text-pill-ink select-none hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show {o.apps.length - SHOWN_APPS} more</span><span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <ul className="mt-2 grid gap-x-8 gap-y-5 grid-md:grid-cols-2">{rows(o.apps.slice(SHOWN_APPS), SHOWN_APPS)}</ul>
            </details>
          ) : null}
          <div className="grid-md:hidden">
            <ul className="flex flex-col gap-5">{rows(o.apps.slice(0, APPS_ON_PHONE))}</ul>
            {o.apps.length > APPS_ON_PHONE ? <Fold title={`${o.apps.length - APPS_ON_PHONE} more`} className="mt-2"><ul className="flex flex-col gap-5 pt-2">{rows(o.apps.slice(APPS_ON_PHONE), APPS_ON_PHONE)}</ul></Fold> : null}
          </div>
        </>
      ) : <p className="text-small text-ink-3">No orders in the last 12 months.</p>}
    </Card>
  )
}

/** The latest money nudges ReLife sent, and what it keeps an eye on. */
function Noticed({ o }: { o: WealthOverview }) {
  return (
    <FoldCard title="What ReLife noticed" description="Money nudges sent to Telegram, last 30 days" summary={o.nudges.length ? `${o.nudges.length} in the last 30 days` : 'All quiet so far · last 30 days'} action={<CardLink href="/coach">All</CardLink>}>
      {o.nudges.length ? (
        <ul className="flex flex-col gap-1">
          {o.nudges.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-2">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2"><BellRing className="size-4" strokeWidth={1.5} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-small font-medium text-ink">{n.title}</p>
                <p className="mt-0.5 text-caption text-ink-3">{[n.payload.meta, timeAgo(n.createdAt)].filter(Boolean).join(' · ')}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md bg-surface-2 p-4">
          <p className="text-small font-medium text-ink">All quiet so far</p>
          <p className="mt-1 text-small text-ink-3">You get a Telegram nudge when something moves: your month’s pace, a spending spike, a repeat buy above usual, a new subscription, a coin swing or a futures position near liquidation.</p>
        </div>
      )}
    </FoldCard>
  )
}

function BoughtAgain({ o, money }: { o: WealthOverview; money: Money }) {
  return (
    <FoldCard title="Bought again and again" description="Last 90 days · what small repeats add up to" summary="Last 90 days · what small repeats add up to" action={<CardLink href="/wealth/spending">Items</CardLink>}>
      {o.repeat.length ? (
        <ol className="flex flex-col divide-y divide-divider">
          {o.repeat.map((r, i) => (
            <li key={r.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-caption font-medium text-ink-2 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-ink">{r.name}</p>
                <p className="text-caption text-ink-3 tabular-nums">On {r.days} days · {Math.round(r.qty)} bought</p>
              </div>
              <div className="text-end tabular-nums">
                <p className="text-body font-medium text-ink">{money(r.spend)}</p>
                <p className="text-caption text-ink-3">≈ {money(r.spend / 3)} a month</p>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="rounded-md bg-surface-2 p-4 text-small text-ink-3">Nothing bought on three or more days in the last 90 days.</p>}
    </FoldCard>
  )
}

/** The whole Overview body. `logos` says which coins have a picture (`coinInfo`); the page loads it. */
export function WealthOverviewView({ o, logos }: { o: WealthOverview; logos: Record<string, boolean> }) {
  const money: Money = (v, opts) => formatMoney(v, o.base, { decimals: 0, ...opts })
  return (
    <PageGrid>
      <GridItem span={{ base: 12, lg: 8 }}><MonthCard o={o} money={money} /></GridItem>
      <GridItem span={{ base: 12, lg: 4 }}><WhereItWent o={o} /></GridItem>
      <GridItem span={{ base: 4, lg: 6 }}><NetWorth o={o} money={money} logos={logos} /></GridItem>
      <GridItem span={{ base: 4, lg: 6 }}><Subscriptions o={o} money={money} /></GridItem>
      <GridItem span={{ base: 12, lg: 8 }}><Merchants o={o} money={money} /></GridItem>
      <Rail span={{ base: 12, lg: 4 }}><Noticed o={o} /><BoughtAgain o={o} money={money} /></Rail>
    </PageGrid>
  )
}

/** The Overview while it loads: the lead row, the two cards, the merchants. */
export function WealthSkeleton() {
  return (
    <div className="@container" aria-busy>
      <div className="grid grid-cols-1 gap-6 grid-md:grid-cols-8 grid-lg:grid-cols-12">
        <Skeleton className="col-span-full h-[660px] rounded-lg grid-lg:col-span-8 grid-lg:h-[780px]" />
        <Skeleton className="col-span-full h-[300px] rounded-lg grid-lg:col-span-4 grid-lg:h-[560px]" />
        <Skeleton className="col-span-full h-[200px] rounded-lg grid-md:col-span-4 grid-md:h-[420px] grid-lg:col-span-6" />
        <Skeleton className="col-span-full h-[280px] rounded-lg grid-md:col-span-4 grid-md:h-[420px] grid-lg:col-span-6" />
        <Skeleton className="col-span-full h-[260px] rounded-lg grid-lg:col-span-8 grid-lg:h-[480px]" />
        <Skeleton className="col-span-full h-[132px] rounded-lg grid-lg:col-span-4 grid-lg:h-[480px]" />
      </div>
    </div>
  )
}
