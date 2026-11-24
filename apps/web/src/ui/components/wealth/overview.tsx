import brand from '@relife/brand/brand.json'
import type { loadWealthOverview } from '@/core/wealth-overview'
import { formatMoney } from '@/domain/money'
import { leadSeries } from '@/domain/series'
import { statusOf } from '@/domain/status-of'
import { dueLabel, monthLabel, shiftMonth, timeAgo } from '@/domain/wealth'
import { chartShade } from '../../tokens'
import { CardLink } from '../area/card-link'
import { Card, CardHeader, Skeleton } from '../card'
import { StackedBars } from '../charts'
import { Fold } from '../fold'
import { GridItem, PageGrid } from '../page-grid'
import { Picture } from '../picture'
import { StatCard } from '../stat-card'
import { StatusRow } from '../status-row'
import { Ticker } from '../ticker'
import { CategoryList } from './category-list'
import { PaceChart } from './pace-chart'
import { HabitBlock, type WealthHabits } from './weekly-quest'
import { joinNames } from '@/domain/life-status'

// The Wealth Overview in the calm system, on the page grid, as presentational pieces (`/dev/ui` draws them from a fixture):
//   left   Spent so far (one figure over the pace line, with a usual month dashed) · Where it went (the top three
//          categories as status rows; the rest, all time and the months folded)
//   right  Habits (the money connection and this week's quest; nudges and repeat buys folded) · Net worth · Subscriptions ·
//          Where you order from (folded)
// Each figure is shown once; the head's brief carries the pace sentence. A phone shows the same cards in one column.

export type WealthOverview = Awaited<ReturnType<typeof loadWealthOverview>>
type Money = (v: number, opts?: { sign?: boolean }) => string

const ACCENT = 'var(--cat-wealth)'
// These format local calendar dates ("2026-11"), so read them in UTC: no time zone may shift them a day.
const SHORT_MONTH = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' })
const MONTH_YEAR = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const TOP_CATEGORIES = 3
const SHOWN_APPS = 8


/** The month so far: one figure with its status word, the pace line, and how the pace is worked out. */
function MonthCard({ o, money }: { o: WealthOverview; money: Money }) {
  const { pace } = o
  const status = statusOf({ from: 'month', vsUsual: pace.vsUsual }).word
  const first = o.today.slice(0, 7)
  // How many prior months make the usual month (`usualMonth`: up to six with spending).
  const usualN = Array.from({ length: 6 }, (_, i) => o.byMonth.get(shiftMonth(first, -(i + 1)))).filter(Boolean).length
  const label = `Spent ${money(pace.spent)} by day ${pace.day} of ${pace.daysInMonth}; ${money(pace.projected)} at this pace${pace.usual ? `; a usual month is ${money(pace.usual)}` : ''}`
  return (
    <Card aria-labelledby="month-heading">
      <CardHeader title={<span id="month-heading">{monthLabel(o.month).split(' ')[0]} so far</span>} action={<CardLink href="/wealth/spending">Spending</CardLink>} />
      <StatCard
        bare label="Spent so far" color={ACCENT} status={status}
        figure={<Ticker value={pace.spent} currency={o.base} />}
        note={`Day ${pace.day} of ${pace.daysInMonth}${pace.oneOff ? `, ${money(pace.oneOff)} in one-off big orders counted once` : ''}`}
      />
      <div className="mt-5">
        <PaceChart daily={o.daily ?? []} daysInMonth={pace.daysInMonth} usual={pace.usual} projected={pace.projected} money={money} monthShort={SHORT_MONTH.format(new Date(`${o.month}-15T00:00:00Z`))} label={label} />
      </div>
      <Fold title="How the pace is worked out" summary={`${pace.oneOff ? 'Big orders counted once · ' : ''}${pace.usual ? `usual is your last ${usualN} months` : 'no usual month yet'}`} className="mt-2 border-t border-divider pt-1">
        <ul className="flex flex-col gap-1.5 pb-1 ps-6 text-small text-ink-2">
          <li>The everyday spending so far, {money(pace.spent - pace.oneOff)} in {pace.day} {pace.day === 1 ? 'day' : 'days'}, carries on at the same daily rate to the end of the month.</li>
          {pace.oneOff ? <li>One-off big orders ({money(pace.oneOff)}) happen once, so they are counted as they are and not projected.</li> : null}
          <li>{pace.usual ? <>A usual month is the average of the last {usualN} full months with spending: {money(pace.usual)}.</> : 'A usual month needs two earlier months with spending; there are not enough yet.'}</li>
        </ul>
      </Fold>
    </Card>
  )
}

/** The three biggest categories as status rows, the rest folded, and the all-time and month-by-month views folded below. */
function WhereItWent({ o, money }: { o: WealthOverview; money: Money }) {
  const colors = Object.fromEntries(
    leadSeries(o.categories.map((c) => ({ id: c, name: c, color: '', values: o.months.map((m) => o.byMonthCat.get(m)?.get(c) ?? 0) })), 3, o.thisMonthCats[0]?.label)
      .filter((r) => !r.other).map((r) => [r.id, chartShade(r.rank, ACCENT)]),
  )
  const lead = o.thisMonthCats[0]?.label
  const allTime = o.allTime.map((c) => ({ category: c.category, now: c.total, usual: null, vsUsual: null, line: `${money(c.total)}, ${c.orders.toLocaleString('en-IN')} orders since ${MONTH_YEAR.format(new Date(`${c.first}T00:00:00Z`))}, ${formatMoney(c.total / c.orders, o.base, { decimals: 0 })} each` }))
  return (
    <Card aria-labelledby="where-heading">
      <CardHeader
        title={<span id="where-heading">Where it went</span>} description="Largest first, against your last 3 months by this day"
        action={<CardLink href="/wealth/spending">By category</CardLink>}
      />
      <CategoryList rows={o.catPace ?? []} money={money} lead={TOP_CATEGORIES} href="/wealth/spending" />
      {o.allTime.length ? (
        <Fold title="All time, by category" summary={`${o.allTime.length} ${o.allTime.length === 1 ? 'category' : 'categories'} since your history begins`} className="mt-1">
          <div>
            {allTime.map((c) => <StatusRow key={c.category} picture={{ of: 'category', name: c.category }} name={c.category} line={c.line} href="/wealth/spending" />)}
          </div>
        </Fold>
      ) : null}
      {o.activeMonths ? (
        <Fold title="Spending by month" summary={`${money(o.year)} in ${o.activeMonths} ${o.activeMonths === 1 ? 'month' : 'months'}, ${money(o.year / o.activeMonths)} a month on average`} className="mt-1">
          <StackedBars
            label="Spending per month by category, last 12 months" unit={o.base === 'INR' ? '₹' : o.base} height={240} top={3} lead={lead} accent={ACCENT}
            categories={o.months.map((m) => SHORT_MONTH.format(new Date(`${m}-15T00:00:00Z`)))}
            // One neutral colour for every series: the chart picks the lead (accent) and the ramp itself.
            series={o.categories.map((c) => ({ id: c, name: c, color: colors[c] ?? 'var(--ink-3)', values: o.months.map((m) => o.byMonthCat.get(m)?.get(c) ?? 0) }))}
          />
        </Fold>
      ) : null}
    </Card>
  )
}

/** The latest money nudges the app sent, and what it keeps an eye on. */
function Noticed({ o }: { o: WealthOverview }) {
  return (
    <Fold
      title={`What ${brand.name} noticed`}
      summary={o.nudges.length ? `${o.nudges.length} ${o.nudges.length === 1 ? 'nudge' : 'nudges'} in the last 30 days` : 'All quiet so far, last 30 days'}
    >
      {o.nudges.length ? (
        <div>
          {o.nudges.map((n) => (
            <StatusRow key={n.id} picture={{ of: 'area', to: 'wealth' }} name={n.title} line={[n.payload.meta, timeAgo(n.createdAt)].filter(Boolean).join(' · ')} href="/coach" />
          ))}
          <div className="mt-1"><CardLink href="/coach">All in Coach</CardLink></div>
        </div>
      ) : (
        <p className="pb-2 ps-6 text-small text-ink-3">You get a Telegram nudge when something moves: your month’s pace, a spending spike, a repeat buy above usual, a new subscription, a coin swing or a futures position near liquidation.</p>
      )}
    </Fold>
  )
}

function BoughtAgain({ o, money }: { o: WealthOverview; money: Money }) {
  return (
    <Fold
      title="Bought again and again"
      summary={o.repeat.length ? joinNames(o.repeat.slice(0, 3).map((r) => r.name)) : 'Last 90 days, nothing yet'}
    >
      {o.repeat.length ? (
        <div>
          {o.repeat.map((r) => (
            <StatusRow
              key={r.name} picture={{ of: 'category', name: r.name }} name={r.name} value={money(r.spend)}
              line={`On ${r.days} days, ${Math.round(r.qty)} bought, about ${money(r.spend / 3)} a month`} href="/wealth/spending"
            />
          ))}
        </div>
      ) : <p className="pb-2 ps-6 text-small text-ink-3">Nothing bought on three or more days in the last 90 days.</p>}
    </Fold>
  )
}

/** Habits: the money connection and the quest, then the two folds about repeats. */
function Habits({ o, money, habits }: { o: WealthOverview; money: Money; habits?: WealthHabits }) {
  return (
    <Card aria-labelledby="habits-heading">
      <CardHeader title={<span id="habits-heading">Habits</span>} action={<CardLink href="/wealth/spending">Order habits</CardLink>} />
      {habits ? <HabitBlock habits={habits} today={o.today} /> : null}
      <div className={habits && (habits.change || habits.link || habits.quest) ? 'mt-3 border-t border-divider pt-1' : undefined}>
        <Noticed o={o} />
        <BoughtAgain o={o} money={money} />
      </div>
    </Card>
  )
}

/** Net worth as the one figure, and Binance's coins and any futures position near liquidation folded under it. */
function NetWorth({ o, money, logos }: { o: WealthOverview; money: Money; logos: Record<string, boolean> }) {
  const { invest } = o
  const note = invest.empty ? 'Connect Binance in You › Connections to see holdings and profit.' : `${invest.pnl >= 0 ? 'Up' : 'Down'} ${money(Math.abs(invest.pnl))} on investments, all time`
  const coins = invest.coins
  return (
    <StatCard
      label="Net worth" picture={invest.empty ? undefined : { of: 'connector', id: 'binance' }} color={ACCENT}
      figure={<Ticker value={o.netWorth} currency={o.base} />} note={note}
    >
      {coins.length || invest.positions.length ? (
        <Fold
          title={`Binance, ${coins.length} ${coins.length === 1 ? 'coin' : 'coins'}`} className="mt-1 border-t border-divider pt-1"
          summary={`${joinNames(coins.map((c) => c.asset))}${invest.futures ? `, futures ${money(invest.futures)}` : ''}`}
        >
          <div>
            {coins.map((c) => (
              <StatusRow
                key={c.asset} picture={{ of: 'coin', symbol: c.asset, logo: logos[c.asset.toUpperCase()] }} name={c.asset} value={money(c.value)}
                line={invest.spot > 0 ? `${Math.round((c.value / invest.spot) * 100)}% of your spot holdings` : undefined}
              />
            ))}
            {invest.positions.map((x) => {
              const near = x.away != null && x.away <= 0.15
              return (
                <StatusRow
                  key={x.symbol + x.side} picture={{ of: 'coin', symbol: x.coin, logo: logos[x.coin.toUpperCase()] }} name={`${x.symbol} ${x.side === 'long' ? 'long' : 'short'} ${x.leverage}×`} value={money(x.pnl, { sign: true })}
                  line={x.away != null ? <span className={near ? 'text-bad-ink' : undefined}>{(x.away * 100).toFixed(1)}% from liquidation</span> : 'Open futures position'}
                />
              )
            })}
          </div>
        </Fold>
      ) : null}
    </StatCard>
  )
}

/** What the subscriptions cost a month as the one figure, the renewals folded under it with each service's logo. */
function Subscriptions({ o, money }: { o: WealthOverview; money: Money }) {
  const { subs } = o
  const next = subs.next
  return (
    <StatCard
      label="Subscriptions" color={ACCENT} figure={<Ticker value={subs.monthly} currency={o.base} />}
      note={subs.count ? `A month across ${subs.count} ${subs.count === 1 ? 'subscription' : 'subscriptions'}, ${money(subs.monthly * 12)} a year${next.length ? '' : '. Nothing renews in the next 30 days'}` : 'None yet. Add one on the Subscriptions tab.'}
    >
      {next.length ? (
        <Fold
          title={`${next.length} ${next.length === 1 ? 'renewal' : 'renewals'} in 30 days`} className="mt-1 border-t border-divider pt-1"
          summary={`${next[0].schedule.name} first, ${dueLabel(next[0].daysLeft).toLowerCase()}`}
        >
          <div>
            {next.map((x) => (
              <StatusRow
                key={x.schedule.id} picture={{ of: 'merchant', name: x.schedule.name }} name={x.schedule.name} href="/wealth/subscriptions"
                line={`${dueLabel(x.daysLeft)}${x.amount ? `, ${formatMoney(x.amount, x.currency ?? o.base)}` : ''}`}
              />
            ))}
          </div>
        </Fold>
      ) : null}
    </StatCard>
  )
}

type App = WealthOverview['apps'][number]

/** Where the orders went: a fold of the biggest payees with their logos, and the rest in a second fold. */
function Merchants({ o, money }: { o: WealthOverview; money: Money }) {
  if (!o.apps.length) return null
  const row = (a: App) => (
    <StatusRow
      key={a.name} picture={{ of: 'merchant', name: a.name }} name={a.name} value={money(a.total)} peek={{ type: 'merchant', id: a.name }}
      line={`${a.orders} order${a.orders === 1 ? '' : 's'}, ${money(a.avg)} each${a.last30 ? `, ${a.last30} in the last 30 days` : ''}`}
    />
  )
  const rest = o.apps.slice(SHOWN_APPS)
  return (
    <Fold
      card title="Where you order from" summary={`${joinNames(o.apps.slice(0, 3).map((a) => a.name))}${o.apps.length > 3 ? ' and more' : ''}`}
    >
      <p className="mb-1 ps-6 text-small text-ink-3">Last 12 months</p>
      <div>{o.apps.slice(0, SHOWN_APPS).map(row)}</div>
      {rest.length ? <Fold title={`${rest.length} more`} className="mt-1"><div>{rest.map(row)}</div></Fold> : null}
    </Fold>
  )
}

/** The whole Overview body. `logos` says which coins have a picture (`coinInfo`); `habits` is the money connection and quest, when the page has them. */
export function WealthOverviewView({ o, logos, habits }: { o: WealthOverview; logos: Record<string, boolean>; habits?: WealthHabits }) {
  const money: Money = (v, opts) => formatMoney(v, o.base, { decimals: 0, ...opts })
  return (
    <PageGrid>
      <GridItem span={{ base: 12, lg: 8 }} className="flex flex-col gap-6">
        <MonthCard o={o} money={money} />
        <WhereItWent o={o} money={money} />
      </GridItem>
      <GridItem span={{ base: 12, lg: 4 }} className="flex flex-col gap-6">
        <Habits o={o} money={money} habits={habits} />
        <NetWorth o={o} money={money} logos={logos} />
        <Subscriptions o={o} money={money} />
        <Merchants o={o} money={money} />
      </GridItem>
    </PageGrid>
  )
}

/** The Overview while it loads: the month, the categories, then the habits, net worth, subscriptions and the folded payees. */
export function WealthSkeleton() {
  return (
    <div className="@container" aria-busy>
      <div className="grid grid-cols-1 gap-6 grid-md:grid-cols-8 grid-lg:grid-cols-12">
        <div className="col-span-full flex flex-col gap-6 grid-lg:col-span-8">
          <Skeleton className="h-[560px] rounded-lg" />
          <Skeleton className="h-[400px] rounded-lg" />
        </div>
        <div className="col-span-full flex flex-col gap-6 grid-lg:col-span-4">
          <Skeleton className="h-[420px] rounded-lg" />
          <Skeleton className="h-[200px] rounded-lg" />
          <Skeleton className="h-[200px] rounded-lg" />
          <Skeleton className="h-[60px] rounded-lg" />
        </div>
      </div>
    </div>
  )
}
