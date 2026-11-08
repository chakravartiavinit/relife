import type { Metadata } from 'next'
import { Activity, ArrowDownLeft, ArrowLeftRight, Gift, ArrowUpRight, ChartPie, Coins, Layers, ListOrdered, Scale, TrendingDown, TrendingUp, TriangleAlert, Trophy } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { formatDay, formatTime, localDate } from '@/core/time'
import { formatMoney, formatNumber } from '@/domain/money'
import { coinInfo } from '@/core/coin-logos'
import { contractCoin, loadPortfolio, type ActivityRow, type Position } from '@/core/portfolio'
import { toLiquidation } from '@/domain/watch'
import { timeAgo } from '@/domain/wealth'
import { CoinLogo } from '@/ui/components/coin-logo'
import { Badge, Card, CardHeader, KpiStrip, PageHeader, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { cn } from '@/ui/cn'
import { Ticker } from '@/ui/components/ticker'
import { ShareDonut } from '@/ui/components/charts'

// Five coin hues; futures margin is ink and other coins grey, so no slice shares a colour.
const ASSET_COLORS = ['var(--cat-wealth)', 'var(--pill)', 'var(--cat-mind)', 'var(--cat-relationships)', 'var(--cat-health)']
const TABS = [
  { key: 'all', label: 'All' }, { key: 'trades', label: 'Trades' }, { key: 'p2p', label: 'P2P' },
  { key: 'transfers', label: 'Transfers & rewards' }, { key: 'futures', label: 'Futures' },
] as const
const SHOWN = 40

export const metadata: Metadata = { title: 'Portfolio' }

export default function PortfolioPage({ searchParams }: PageProps<'/wealth/portfolio'>) {
  return (
    <>
      <PageHeader eyebrow="Wealth" title="Portfolio" description="Everything on Binance: what it's worth, what you made since day one, and every trade, P2P order and transfer." />
      <Suspense fallback={<PortfolioSkeleton />}>
        <Portfolio searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Portfolio({ searchParams }: { searchParams: PageProps<'/wealth/portfolio'>['searchParams'] }) {
  await connection()
  const user = await getUser()
  const base = user.baseCurrency
  const p = await loadPortfolio(user)
  if (p.empty) {
    return (
      <Card>
        <EmptyState
          title="No crypto connected" icon={Coins} color={'var(--cat-wealth)'}
          description="Add a read-only Binance API key in Connectors. Holdings, futures, trades, P2P orders and transfers sync automatically."
          action={<Link href="/connectors" className={buttonClass({ variant: 'primary' })}>Connect Binance</Link>}
        />
      </Card>
    )
  }
  const tabParam = (await searchParams).tab
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? 'all'
  const shown = p.activity.filter((a) => tab === 'all' || (tab === 'trades' ? a.kind === 'trade' || a.kind === 'convert' : tab === 'p2p' ? a.kind === 'p2p' : tab === 'transfers' ? a.kind === 'deposit' || a.kind === 'withdrawal' || a.kind === 'reward' : a.kind === 'futures'))
  const page = shown.slice(0, SHOWN)

  const positions = p.futures?.positions ?? []
  const info = await coinInfo([...p.rows.map((h) => h.asset), ...p.dust.map((h) => h.asset), ...p.closed.map((c) => c.asset), ...page.map((a) => a.asset), ...positions.map((x) => contractCoin(x.symbol)), ...(p.futures?.bySymbol ?? []).slice(0, 8).map((x) => contractCoin(x.symbol))])
  const coin = (a: string) => info[a.toUpperCase()] ?? {}
  const money = (usd: number, opts?: { sign?: boolean }) => formatMoney(usd * p.usdToBase, base, opts)
  const totalUsd = p.spotUsd + p.futuresUsd
  const heldUsd = p.held.reduce((s, h) => s + h.usd, 0)
  const maxBreak = Math.max(1, ...p.breakdown.flatMap((g) => g.items.map((i) => Math.abs(i.usd))))
  const tone = (v: number) => (v >= 0 ? 'good' as const : 'bad' as const)
  const signCls = (v: number) => (Math.abs(v) < 0.005 ? 'text-ink-3' : v >= 0 ? 'text-good' : 'text-bad')
  const GROUP_ICON = { spot: Coins, futures: Layers }
  const part = (k: 'spot' | 'futures') => p.breakdown.find((g) => g.key === k)?.total ?? 0

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip items={[
        { label: 'Worth now', value: <Ticker value={totalUsd * p.usdToBase} currency={base} />, sub: p.futures ? `Spot ${money(p.spotUsd)} · futures ${money(p.futuresUsd)}` : formatMoney(totalUsd, 'USD') },
        { label: 'Profit / loss', value: money(p.trading.total, { sign: true }), tone: tone(p.trading.total), sub: p.futures ? `Spot ${money(part('spot'), { sign: true })} · futures ${money(part('futures'), { sign: true })}` : 'From your spot orders' },
        { label: 'Closed', value: money(p.trading.realized, { sign: true }), tone: tone(p.trading.realized), sub: p.futures ? 'Coins sold, closed futures, funding and fees' : 'Coins sold, after fees' },
        { label: 'Open', value: money(p.trading.open, { sign: true }), tone: tone(p.trading.open), sub: p.futures ? `Spot ${money(p.spotOpen, { sign: true })} · futures ${money(p.futures.openUsd, { sign: true })}` : 'On coins still held' },
      ]} />
      {p.skipped ? (
        <div className="-mt-3 flex flex-wrap gap-2">
          <Badge color="var(--warn)">{p.skipped} trade{p.skipped === 1 ? '' : 's'} not valued (unusual quote)</Badge>
        </div>
      ) : null}

      {/* Open positions first: they move by the minute. */}
      {p.futures ? (
        <Card className="px-0 pb-2">
          <CardHeader
            title="Open positions" icon={<Activity strokeWidth={2} />} color="var(--cat-wealth)"
            description={`USDⓈ-M futures · wallet ${money(p.futures.walletUsd)}${p.futures.at ? ` · updated ${timeAgo(new Date(p.futures.at), new Date())}` : ''}`}
            className="px-5"
          />
          {positions.length ? (
            <ul aria-label="Open futures positions" className="flex flex-col">
              {positions.map((pos, i) => {
                const c = contractCoin(pos.symbol)
                return (
                  <li key={pos.symbol + pos.side} className="border-t border-divider px-5 py-4 first:border-t-0">
                    <PositionCard pos={pos} coin={c} name={coin(c).name ?? c} logo={coin(c).logo} pnl={money(pos.unrealized, { sign: true })} index={i} />
                  </li>
                )
              })}
            </ul>
          ) : <p className="px-5 pb-3 text-[13px] text-ink-3">No open futures positions.</p>}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="px-0 pb-2">
          <CardHeader title="Spot holdings" icon={<Coins strokeWidth={2} />} color="var(--cat-wealth)" description="Prices in USD · cost from your trades and deposits" className="px-5" />
          {p.rows.length ? (
            <div role="table" aria-label="Spot holdings" className="text-[13px]">
              <div role="row" className="hidden grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem_6.5rem] gap-4 border-b border-divider px-5 pb-2 text-[12px] font-medium text-ink-3 md:grid">
                <span role="columnheader">Coin</span>
                <span role="columnheader" className="text-right">Price</span>
                <span role="columnheader" className="text-right">Avg cost</span>
                <span role="columnheader" className="text-right">Value</span>
                <span role="columnheader" className="text-right">Profit / loss</span>
              </div>
              {p.rows.map((h, i) => {
                const share = h.usd / (heldUsd || 1)
                return (
                  <div role="row" key={h.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-divider px-5 py-3.5 transition-[background-color] duration-150 last:border-b-0 hover:bg-ink/[0.02] md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem_6.5rem] dark:hover:bg-white/[0.03]">
                    <span role="cell" className="flex min-w-0 items-center gap-3">
                      <CoinLogo symbol={h.asset} logo={coin(h.asset).logo} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="font-semibold text-ink">{h.asset}</span>
                          <span className="truncate text-[12px] text-ink-3">{coin(h.asset).name ?? ''}</span>
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="block h-1.5 w-full max-w-20 min-w-8 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                            <span className="reveal-fill block h-full rounded-full" style={{ width: '100%', '--fill': `${share * 100}%`, '--i': i, background: 'var(--cat-wealth)' } as React.CSSProperties} />
                          </span>
                          <span className="text-[11.5px] whitespace-nowrap text-ink-3 tabular-nums">{formatNumber(share * 100, 1)}% · {formatNumber(h.qty, h.qty < 1 ? 6 : h.qty < 100 ? 3 : 1)}</span>
                        </span>
                      </span>
                    </span>
                    <span role="cell" className="hidden text-right text-ink-2 tabular-nums md:block">{usd(h.price)}</span>
                    <span role="cell" className="hidden text-right text-ink-2 tabular-nums md:block" title={h.partial ? 'Covers only the part your synced history explains' : undefined}>{h.avg != null ? `${usd(h.avg)}${h.partial ? '*' : ''}` : '–'}</span>
                    <span role="cell" className="text-right tabular-nums">
                      <span className="block font-semibold text-ink">{money(h.usd)}</span>
                      <span className="block text-[12px] text-ink-3">{formatMoney(h.usd, 'USD')}</span>
                    </span>
                    <span role="cell" className="col-span-2 text-right tabular-nums md:col-span-1">
                      {h.gain != null ? (
                        <>
                          <span className={cn('block font-medium', signCls(h.gain))}>{money(h.gain, { sign: true })}</span>
                          {h.pct != null ? <span className={cn('block text-[12px]', signCls(h.gain))}>{h.gain >= 0 ? '▲' : '▼'} {formatNumber(Math.abs(h.pct) * 100, 1)}%</span> : null}
                        </>
                      ) : <span className="text-ink-3">–</span>}
                    </span>
                  </div>
                )
              })}
              {p.dust.length ? (
                <p className="px-5 pt-3 pb-1 text-[12px] text-ink-3">
                  {p.dust.length} small balance{p.dust.length === 1 ? '' : 's'} under $1 hidden ({p.dust.map((d) => d.asset).join(', ')}, {formatMoney(p.dust.reduce((s, d) => s + d.usd, 0), 'USD')} in all).
                </p>
              ) : null}
            </div>
          ) : (
            <p className="px-5 pb-3 text-[13px] text-ink-3">No spot holdings worth $1 or more.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Allocation" icon={<ChartPie strokeWidth={2} />} color="var(--cat-wealth)" description="What the account holds now" />
          <ShareDonut
            label="Account by holding" unit={base === 'INR' ? '₹' : base} totalLabel="Worth now"
            segments={[
              ...p.held.slice(0, 5).map((h, i) => ({ id: h.asset, name: h.asset, color: ASSET_COLORS[i], value: h.usd * p.usdToBase })),
              ...(p.held.length > 5 ? [{ id: 'other', name: 'Other coins', color: 'var(--ink-3)', value: p.held.slice(5).reduce((s, h) => s + h.usd * p.usdToBase, 0) }] : []),
              ...(p.futuresUsd > 0 ? [{ id: 'futures', name: 'Futures margin', color: 'var(--ink)', value: p.futuresUsd * p.usdToBase }] : []),
            ]}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Where the all-time number comes from: grouped by market, each with its subtotal. Bars grow from the zero line. */}
        <Card>
          <CardHeader title="Where the profit and loss came from" icon={<Scale strokeWidth={2} />} color="var(--cat-wealth)" description="From spot and futures orders only. Each part adds up to the total." />
          <div className="flex flex-col gap-5">
            {p.breakdown.map((g, gi) => {
              const Icon = GROUP_ICON[g.key]
              return (
                <section key={g.key} aria-label={g.label}>
                  <div className="mb-2 flex items-center gap-2.5">
                    <span aria-hidden className="grid size-7 place-items-center rounded-[8px] bg-surface-2 text-ink-2"><Icon className="size-4" strokeWidth={2} /></span>
                    <h3 className="flex-1 text-[13.5px] font-semibold text-ink">{g.label}</h3>
                    <span className={cn('text-[14px] font-semibold tabular-nums', signCls(g.total))}>{money(g.total, { sign: true })}</span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {g.items.map((it, ii) => (
                      <li key={it.label} className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7rem] items-center gap-4 rounded-[8px] py-1.5 ps-9 text-[13px] max-sm:grid-cols-[minmax(0,1fr)_7rem]">
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{it.label}</span>
                          <span className="block text-[11.5px] leading-snug text-ink-3 text-pretty">{it.hint}</span>
                        </span>
                        <span aria-hidden className="relative h-2 rounded-full bg-surface-2 max-sm:hidden">
                          <span className="absolute inset-y-0 left-1/2 w-px bg-ink/15 dark:bg-white/20" />
                          <span
                            className={cn('reveal-hbar absolute inset-y-0', it.usd >= 0 ? 'left-1/2 rounded-e-full bg-good' : 'right-1/2 rounded-s-full bg-bad')}
                            style={{ width: `${(Math.abs(it.usd) / maxBreak) * 50}%`, transformOrigin: it.usd >= 0 ? 'left' : 'right', '--i': gi * 3 + ii } as React.CSSProperties}
                          />
                        </span>
                        <span className={cn('text-right font-medium tabular-nums', signCls(it.usd))}>{money(it.usd, { sign: true })}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
            <div className="flex items-baseline justify-between border-t border-divider pt-4">
              <span className="text-[14px] font-semibold text-ink">Total</span>
              <span className={cn('font-display text-[20px] font-bold tabular-nums', signCls(p.trading.total))}>{money(p.trading.total, { sign: true })}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Money in and out" icon={<ListOrdered strokeWidth={2} />} color="var(--cat-wealth)" description="Deposits, withdrawals and P2P. Not part of profit and loss." />
          <dl className="flex flex-col gap-2.5 text-[13px]">
            <Line label="Put in" value={money(p.money.invested)} />
            <Line label="Taken out" value={money(p.money.withdrawn)} />
            <Line label="Worth now" value={money(totalUsd)} strong />
          </dl>
          <dl className="mt-4 flex flex-col gap-2 border-t border-divider pt-4 text-[12.5px]">
            {[
              ['Spot trades', p.counts.trades], ['P2P orders', p.counts.p2p], ['Deposits', p.counts.deposits],
              ['Withdrawals', p.counts.withdrawals], ['Futures entries', p.counts.futures],
            ].map(([label, n]) => <Line key={label} label={String(label)} value={formatNumber(Number(n))} muted />)}
          </dl>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Spot, coins sold" icon={<Trophy strokeWidth={2} />} color="var(--cat-wealth)" description="What each coin made or lost when sold" />
          {p.closed.length ? (
            <ul className="flex flex-col gap-3">
              {p.closed.map((c) => (
                <li key={c.asset} className="flex items-center gap-3">
                  <CoinLogo symbol={c.asset} logo={coin(c.asset).logo} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">{c.asset}</span>
                    <span className="block text-[11.5px] text-ink-3 tabular-nums">{c.sells} sale{c.sells === 1 ? '' : 's'}</span>
                  </span>
                  <span className={cn('text-[13px] font-semibold tabular-nums', signCls(c.gain))}>{money(c.gain, { sign: true })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-ink-3">Nothing sold yet.</p>}
        </Card>
        {p.futures ? (
          <Card>
            <CardHeader title="Futures, closed by contract" icon={<Layers strokeWidth={2} />} color="var(--cat-wealth)" description={p.futures.since ? `Since ${formatDay(localDate(p.futures.since, user.timezone), { month: 'short', year: 'numeric' })}` : 'Closed positions'} />
            {p.futures.bySymbol.length ? (
              <ul className="flex flex-col gap-3">
                {p.futures.bySymbol.slice(0, 10).map((s) => {
                  const c = contractCoin(s.symbol)
                  return (
                    <li key={s.symbol} className="flex items-center gap-3">
                      <CoinLogo symbol={c} logo={coin(c).logo} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{s.symbol}</span>
                      <span className={cn('text-[13px] font-semibold tabular-nums', signCls(s.usd))}>{money(s.usd, { sign: true })}</span>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="text-[13px] text-ink-3">No closed futures trades yet.</p>}
          </Card>
        ) : null}
      </div>

      <Card className="px-0 pb-2">
        <CardHeader title="Activity" icon={<ArrowLeftRight strokeWidth={2} />} color="var(--cat-wealth)" description={`${formatNumber(shown.length)} entries · latest ${page.length} shown`} className="px-5" />
        <nav aria-label="Activity type" className="flex flex-wrap gap-1 px-5 pb-3">
          {TABS.map((t) => (
            <Link key={t.key} href={t.key === 'all' ? '/wealth/portfolio' : `/wealth/portfolio?tab=${t.key}`} scroll={false} aria-current={t.key === tab ? 'page' : undefined}
              className={buttonClass({ variant: t.key === tab ? 'primary' : 'ghost', size: 'sm' })}>{t.label}</Link>
          ))}
        </nav>
        {page.length ? (
          <ul className="text-[13px]">
            {page.map((a, i) => <ActivityItem key={i} a={a} logo={coin(a.asset).logo} tz={user.timezone} money={money} />)}
          </ul>
        ) : <p className="px-5 pb-3 text-[13px] text-ink-3">Nothing here yet.</p>}
      </Card>
    </div>
  )
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-ink-3' : 'text-ink-2'}>{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'font-display text-[17px] font-bold text-ink' : muted ? 'text-ink-2' : 'font-medium text-ink')}>{value}</dd>
    </div>
  )
}

const KIND_LABEL: Record<ActivityRow['kind'], string> = { trade: 'Spot', p2p: 'P2P', convert: 'Convert', deposit: 'Deposit', withdrawal: 'Withdrawal', reward: 'Reward', futures: 'Futures' }

function ActivityItem({ a, logo, tz, money }: { a: ActivityRow; logo?: boolean; tz: string; money: (usd: number, o?: { sign?: boolean }) => string }) {
  const In = a.side === 'in' || a.side === 'sell'
  const Arrow = a.kind === 'deposit' ? ArrowDownLeft : a.kind === 'withdrawal' ? ArrowUpRight : a.kind === 'reward' ? Gift : null
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-divider px-5 py-3 last:border-b-0 md:grid-cols-[8.5rem_minmax(0,1fr)_9rem_8rem]">
      <span className="col-span-2 text-[12px] text-ink-3 tabular-nums md:col-span-1 md:text-[13px]">
        {formatDay(localDate(a.at, tz), { day: 'numeric', month: 'short', year: '2-digit' })} · {formatTime(a.at, tz)}
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <span className="relative">
          <CoinLogo symbol={a.asset} logo={logo} />
          {Arrow ? <span aria-hidden className={cn('absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full ring-2 ring-surface', a.kind === 'withdrawal' ? 'bg-ink text-surface' : 'bg-good text-white')}><Arrow className="size-2.5" strokeWidth={2.5} /></span> : null}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{a.title}</span>
            <Badge>{KIND_LABEL[a.kind]}</Badge>
          </span>
          {a.detail ? <span className="block truncate text-[12px] text-ink-3">{a.detail}</span> : null}
        </span>
      </span>
      <span className="hidden text-right text-ink-2 tabular-nums md:block">{a.kind === 'futures' ? '' : `${formatNumber(a.amount, a.amount < 1 ? 6 : a.amount < 1000 ? 4 : 2)} ${a.amountAsset}`}</span>
      <span className={cn('text-right font-medium tabular-nums', a.kind === 'futures' ? ((a.usd ?? 0) >= 0 ? 'text-good' : 'text-bad') : In ? 'text-good' : 'text-ink')}>
        {a.usd == null ? '–' : money(a.usd, { sign: true })}
      </span>
    </li>
  )
}

/** A USD price with sensible decimals: $1,264.87, $8.11, $0.1453. */
const usd = (v: number) => formatMoney(v, 'USD', { decimals: v < 1 ? 4 : 2 })

/** Risk colour for how far the price can move before liquidation (full class names, so Tailwind sees them). */
const RISK = {
  bad: { text: 'text-bad', fill: 'bg-bad', ring: 'border-bad' },
  warn: { text: 'text-warn', fill: 'bg-warn', ring: 'border-warn' },
  good: { text: 'text-good', fill: 'bg-good', ring: 'border-good' },
}
const riskTone = (away: number | null) => RISK[away == null || away > 0.15 ? 'good' : away > 0.05 ? 'warn' : 'bad']

/**
 * One open futures position: what it is, its profit or loss, and its runway: the price path from entry to
 * liquidation with today's mark on it. On cross margin the distance to liquidation is the real risk, not the
 * loss on the position's own margin.
 */
function PositionCard({ pos, coin, name, logo, pnl, index }: { pos: Position; coin: string; name: string; logo?: boolean; pnl: string; index: number }) {
  const size = Math.abs(pos.size)
  const mark = pos.mark ?? (size ? Math.abs(pos.notional) / size : 0)
  const away = toLiquidation({ side: pos.side, mark, liquidation: pos.liquidation })
  const roe = pos.margin ? pos.unrealized / pos.margin : null
  const tone = riskTone(away)
  // Share of the entry → liquidation path already used up (0 while the trade is in profit).
  const used = pos.liquidation && pos.liquidation !== pos.entry ? Math.min(1, Math.max(0, (mark - pos.entry) / (pos.liquidation - pos.entry))) : null
  const pnlCls = pos.unrealized >= 0 ? 'text-good' : 'text-bad'
  return (
    <article aria-label={`${pos.symbol} ${pos.side}`} className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <CoinLogo symbol={coin} logo={logo} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-[15px] font-semibold text-ink">{pos.symbol}</h3>
            <span className={cn('inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold', pos.side === 'long' ? 'bg-[color-mix(in_oklch,var(--good)_14%,transparent)] text-good' : 'bg-[color-mix(in_oklch,var(--bad)_14%,transparent)] text-bad')}>
              {pos.side === 'long' ? <TrendingUp className="size-3" strokeWidth={2.5} /> : <TrendingDown className="size-3" strokeWidth={2.5} />}
              {pos.side === 'long' ? 'Long' : 'Short'}
            </span>
            <span className="inline-flex h-5 items-center rounded-full bg-surface-2 px-2 text-[11px] font-semibold text-ink-2 tabular-nums">
              {pos.leverage}× · {pos.marginType === 'isolated' ? 'isolated' : 'cross'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-3 tabular-nums">
            {name} · {formatNumber(size, size < 1 ? 4 : 2)} {coin} · {formatMoney(Math.abs(pos.notional), 'USD')}
          </p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className={cn('text-[18px] font-semibold leading-tight', pnlCls)}>{pnl}</p>
          {roe != null ? (
            <p className={cn('mt-0.5 text-[12px]', pnlCls)}>
              {pos.unrealized >= 0 ? '▲' : '▼'} {formatNumber(Math.abs(roe) * 100, 1)}% <span className="text-ink-3">on {formatMoney(pos.margin, 'USD')} margin</span>
            </p>
          ) : null}
        </div>
      </div>

      {pos.liquidation ? (
        <div className="rounded-[12px] bg-surface-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="font-medium text-ink-2">Runway to liquidation</span>
            {away != null ? (
              <span className={cn('inline-flex items-center gap-1 font-semibold tabular-nums', tone.text)}>
                {tone === RISK.bad ? <TriangleAlert className="size-3.5" strokeWidth={2} /> : null}
                {(away * 100).toFixed(1)}% price move left
              </span>
            ) : null}
          </div>
          {used != null ? (
            <div aria-hidden className="relative mt-2.5 h-2 rounded-full bg-[color-mix(in_oklch,var(--ink)_8%,transparent)]">
              <span className={cn('reveal-hbar absolute inset-y-0 left-0 rounded-full', tone.fill)} style={{ width: `${used * 100}%`, transformOrigin: 'left', '--i': index } as React.CSSProperties} />
              <span className={cn('absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface shadow-sm', tone.ring)} style={{ left: `${used * 100}%` }} />
              <span className="absolute inset-y-[-3px] right-0 w-0.5 rounded-full bg-bad" />
            </div>
          ) : null}
          {/* Mark sits under its marker, kept clear of the Entry and Liquidation labels at the ends. */}
          <dl className="relative mt-2.5 h-9 text-[12px] tabular-nums">
            <div className="absolute left-0"><dt className="text-ink-3">Entry</dt><dd className="font-medium text-ink">{usd(pos.entry)}</dd></div>
            <div className="absolute -translate-x-1/2 text-center" style={{ left: `clamp(6.5rem, ${(used ?? 0.5) * 100}%, calc(100% - 6.5rem))` }}>
              <dt className="text-ink-3">Mark</dt><dd className="font-semibold text-ink">{usd(mark)}</dd>
            </div>
            <div className="absolute right-0 text-right"><dt className="text-ink-3">Liquidation</dt><dd className="font-medium text-bad">{usd(pos.liquidation)}</dd></div>
          </dl>
        </div>
      ) : (
        <p className="text-[12px] text-ink-3">Liquidation price not reported yet. Entry {usd(pos.entry)} · mark {usd(mark)}.</p>
      )}
    </article>
  )
}

function PortfolioSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-[118px] rounded-lg" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-[320px] rounded-lg" />
        <Skeleton className="h-[320px] rounded-lg" />
      </div>
      <Skeleton className="h-[400px] rounded-lg" />
    </div>
  )
}
