import type { Metadata } from 'next'
import { ArrowDownLeft, ArrowUpRight, Gift } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { formatDay, formatTime, localDate } from '@/core/time'
import { formatMoney, formatNumber } from '@/domain/money'
import { coinInfo } from '@/core/coin-logos'
import { contractCoin, loadPortfolio, type ActivityRow } from '@/core/portfolio'
import { timeAgo } from '@/domain/wealth'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { Card, CardHeader, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { chipClass } from '@/ui/components/chip'
import { Fold } from '@/ui/components/fold'
import { Picture } from '@/ui/components/picture'
import { StatCard } from '@/ui/components/stat-card'
import { StatusRow } from '@/ui/components/status-row'
import { StatusWord } from '@/ui/components/status-word'
import { cn } from '@/ui/cn'
import { Ticker } from '@/ui/components/ticker'
import { ShareDonut } from '@/ui/components/charts'
import { PositionCard, usd } from '@/ui/components/wealth/position-card'

const TABS = [
  { key: 'all', label: 'All' }, { key: 'trades', label: 'Trades' }, { key: 'p2p', label: 'P2P' },
  { key: 'transfers', label: 'Transfers & rewards' }, { key: 'futures', label: 'Futures' },
] as const
const SHOWN = 40

export const metadata: Metadata = { title: 'Portfolio' }

export default function PortfolioPage({ searchParams }: PageProps<'/wealth/portfolio'>) {
  return (
    <>
      <p className="mb-6 max-w-[60ch] text-body text-ink-2">Everything on Binance: what it's worth, what you made since day one, and every trade, P2P order and transfer.</p>
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
          title="No crypto connected" picture={{ of: 'connector', id: 'binance' }}
          description="Add a read-only Binance API key in You › Connections. Holdings, futures, trades, P2P orders and transfers sync automatically."
          action={<Link href="/you/connections" className={buttonClass({ variant: 'primary' })}>Connect Binance</Link>}
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
  const money = (usd: number, opts?: { sign?: boolean; decimals?: number }) => formatMoney(usd * p.usdToBase, base, opts)
  const totalUsd = p.spotUsd + p.futuresUsd
  const heldUsd = p.held.reduce((s, h) => s + h.usd, 0)
  const maxBreak = Math.max(1, ...p.breakdown.flatMap((g) => g.items.map((i) => Math.abs(i.usd))))
  const signCls = (v: number) => (Math.abs(v) < 0.005 ? 'text-ink-3' : v >= 0 ? 'text-good-ink' : 'text-bad-ink')
  const part = (k: 'spot' | 'futures') => p.breakdown.find((g) => g.key === k)?.total ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageGrid>
        <GridItem span={{ base: 12, lg: 5 }} className="[&>*]:h-full">
          <StatCard
            label="Worth now" picture={{ of: 'connector', id: 'binance' }}
            figure={<Ticker value={totalUsd * p.usdToBase} currency={base} />}
            note={p.futures ? `Spot ${money(p.spotUsd)} · futures ${money(p.futuresUsd)}` : formatMoney(totalUsd, 'USD')}
            peek={{ type: 'brief', id: 'wealth' }} className="justify-center"
          />
        </GridItem>
        <GridItem span={{ base: 12, lg: 7 }} className="[&>*]:h-full">
          <Card aria-label="Profit and loss" className="flex flex-col justify-center py-3">
            {[
              { name: 'Profit / loss', v: p.trading.total, line: p.futures ? `Spot ${money(part('spot'), { sign: true })} · futures ${money(part('futures'), { sign: true })}` : 'From your spot orders' },
              { name: 'Closed', v: p.trading.realized, line: p.futures ? 'Coins sold, closed futures, funding and fees' : 'Coins sold, after fees' },
              { name: 'Open', v: p.trading.open, line: p.futures ? `Spot ${money(p.spotOpen, { sign: true })} · futures ${money(p.futures.openUsd, { sign: true })}` : 'On coins still held' },
            ].map((r) => (
              <StatusRow key={r.name} name={r.name} line={r.line} trailing={<span className={cn('text-body font-medium tabular-nums', signCls(r.v))}>{money(r.v, { sign: true })}</span>} />
            ))}
          </Card>
        </GridItem>
      </PageGrid>
      {p.skipped ? (
        <div className="-mt-3 flex flex-wrap gap-2">
          <StatusWord tone="warn">{p.skipped} trade{p.skipped === 1 ? '' : 's'} not valued (unusual quote)</StatusWord>
        </div>
      ) : null}

      {/* Open positions first: they move by the minute. */}
      {p.futures ? (
        <Card className="px-0 pb-2">
          <CardHeader
            title="Open positions"
            description={`USDⓈ-M futures · wallet ${money(p.futures.walletUsd)}${p.futures.at ? ` · updated ${timeAgo(new Date(p.futures.at), new Date())}` : ''}`}
            className="px-5"
          />
          {positions.length ? (
            <ul aria-label="Open futures positions" className="flex flex-col">
              {positions.map((pos, i) => {
                const c = contractCoin(pos.symbol)
                return (
                  <li key={pos.symbol + pos.side} className="border-t border-divider px-5 py-4 first:border-t-0">
                    <PositionCard pos={pos} coin={c} name={coin(c).name ?? c} logo={coin(c).logo} pnl={money(pos.unrealized, { sign: true, decimals: 0 })} index={i} />
                  </li>
                )
              })}
            </ul>
          ) : <p className="px-5 pb-3 text-small text-ink-3">No open futures positions.</p>}
        </Card>
      ) : null}

      <PageGrid>
        <GridItem span={{ base: 12, lg: 8 }} className="[&>*]:h-full">
          <Card className="px-0 pb-2">
            <CardHeader title="Spot holdings" description="Prices in USD · cost from your trades and deposits" className="px-5" />
            {p.rows.length ? (
              <div role="table" aria-label="Spot holdings" className="text-small">
                <div role="row" className="hidden grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem_6.5rem] gap-4 border-b border-divider px-5 pb-2 text-caption text-ink-3 md:grid">
                  <span role="columnheader">Coin</span>
                  <span role="columnheader" className="text-right">Price</span>
                  <span role="columnheader" className="text-right">Avg cost</span>
                  <span role="columnheader" className="text-right">Value</span>
                  <span role="columnheader" className="text-right">Profit / loss</span>
                </div>
                {p.rows.map((h, i) => {
                  const share = h.usd / (heldUsd || 1)
                  return (
                    <div role="row" key={h.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-divider px-5 py-3.5 transition-colors duration-150 ease-out-quint last:border-b-0 hover-fine:bg-surface-2 md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_7rem_6.5rem]">
                      <span role="cell" className="flex min-w-0 items-center gap-3">
                        <Picture of="coin" symbol={h.asset} logo={coin(h.asset).logo} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="text-body font-medium text-ink">{h.asset}</span>
                            <span className="truncate text-caption text-ink-3">{coin(h.asset).name ?? ''}</span>
                          </span>
                          <span className="mt-1 flex items-center gap-2">
                            <span className="block h-1.5 w-full max-w-20 min-w-8 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                              <span className="reveal-fill block h-full rounded-full" style={{ width: '100%', '--fill': `${share * 100}%`, '--i': i, background: 'var(--cat-wealth)' } as React.CSSProperties} />
                            </span>
                            <span className="text-caption whitespace-nowrap text-ink-3 tabular-nums">{formatNumber(share * 100, 1)}% · {formatNumber(h.qty, h.qty < 1 ? 6 : h.qty < 100 ? 3 : 1)}</span>
                          </span>
                        </span>
                      </span>
                      <span role="cell" className="hidden text-right text-ink-2 tabular-nums md:block">{usd(h.price)}</span>
                      <span role="cell" className="hidden text-right text-ink-2 tabular-nums md:block" title={h.partial ? 'Covers only the part your synced history explains' : undefined}>{h.avg != null ? `${usd(h.avg)}${h.partial ? '*' : ''}` : '–'}</span>
                      <span role="cell" className="text-right tabular-nums">
                        <span className="block font-medium text-ink">{money(h.usd)}</span>
                        <span className="block text-caption text-ink-3">{formatMoney(h.usd, 'USD')}</span>
                      </span>
                      <span role="cell" className="col-span-2 text-right tabular-nums md:col-span-1">
                        {h.gain != null ? (
                          <>
                            <span className={cn('block font-medium', signCls(h.gain))}>{money(h.gain, { sign: true })}</span>
                            {h.pct != null ? <span className={cn('block text-caption', signCls(h.gain))}>{h.gain >= 0 ? '▲' : '▼'} {formatNumber(Math.abs(h.pct) * 100, 1)}%</span> : null}
                          </>
                        ) : <span className="text-ink-3">–</span>}
                      </span>
                    </div>
                  )
                })}
                {p.dust.length ? (
                  <p className="px-5 pt-3 pb-1 text-caption text-ink-3">
                    {p.dust.length} small balance{p.dust.length === 1 ? '' : 's'} under $1 hidden ({p.dust.map((d) => d.asset).join(', ')}, {formatMoney(p.dust.reduce((s, d) => s + d.usd, 0), 'USD')} in all).
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="px-5 pb-3 text-small text-ink-3">No spot holdings worth $1 or more.</p>
            )}
          </Card>
        </GridItem>

        <GridItem span={{ base: 12, lg: 4 }} className="[&>*]:h-full">
          <Card>
            <CardHeader title="Allocation" description="What the account holds now" />
            <ShareDonut accent="var(--cat-wealth)"
              label="Account by holding" unit={base === 'INR' ? '₹' : base} totalLabel="Worth now"
              segments={[
                ...p.held.slice(0, 5).map((h) => ({ id: h.asset, name: h.asset, color: 'var(--ink-3)', value: h.usd * p.usdToBase })),
                ...(p.held.length > 5 ? [{ id: 'other', name: 'Other coins', color: 'var(--ink-3)', value: p.held.slice(5).reduce((s, h) => s + h.usd * p.usdToBase, 0) }] : []),
                ...(p.futuresUsd > 0 ? [{ id: 'futures', name: 'Futures margin', color: 'var(--ink)', value: p.futuresUsd * p.usdToBase }] : []),
              ]}
            />
          </Card>
        </GridItem>
      </PageGrid>

      <PageGrid>
        {/* Where the all-time number comes from: grouped by market, each with its subtotal. Bars grow from the zero line. */}
        <GridItem span={{ base: 12, lg: 8 }} className="[&>*]:h-full">
          <Card className="flex flex-col">
            <CardHeader title="Where the profit and loss came from" description="From spot and futures orders only. Each part adds up to the total." />
            <div className="flex flex-1 flex-col gap-5">
              {p.breakdown.map((g, gi) => (
                <section key={g.key} aria-label={g.label}>
                  <div className="mb-2 flex items-baseline gap-2.5">
                    <h3 className="flex-1 text-body font-medium text-ink">{g.label}</h3>
                    <span className={cn('text-body font-medium tabular-nums', signCls(g.total))}>{money(g.total, { sign: true })}</span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {g.items.map((it, ii) => (
                      <li key={it.label} className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7rem] items-center gap-4 rounded-md py-1.5 text-small max-sm:grid-cols-[minmax(0,1fr)_7rem]">
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{it.label}</span>
                          <span className="block text-caption text-ink-3 text-pretty">{it.hint}</span>
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
              ))}
              <div className="mt-auto flex items-baseline justify-between border-t border-divider pt-4">
                <span className="text-body font-medium text-ink">Total</span>
                <span className={cn('text-heading font-medium tabular-nums', signCls(p.trading.total))}>{money(p.trading.total, { sign: true })}</span>
              </div>
            </div>
          </Card>
        </GridItem>

        <GridItem span={{ base: 12, lg: 4 }} className="[&>*]:h-full">
          <Card>
            <CardHeader title="Money in and out" description="Deposits, withdrawals and P2P. Not part of profit and loss." />
            <dl className="flex flex-col gap-2.5 text-small">
              <Line label="Put in" value={money(p.money.invested)} />
              <Line label="Taken out" value={money(p.money.withdrawn)} />
              <Line label="Worth now" value={money(totalUsd)} strong />
            </dl>
            <dl className="mt-4 flex flex-col gap-2 border-t border-divider pt-4 text-small">
              {[
                ['Spot trades', p.counts.trades], ['P2P orders', p.counts.p2p], ['Deposits', p.counts.deposits],
                ['Withdrawals', p.counts.withdrawals], ['Futures entries', p.counts.futures],
              ].map(([label, n]) => <Line key={label} label={String(label)} value={formatNumber(Number(n))} muted />)}
            </dl>
          </Card>
        </GridItem>
      </PageGrid>

      <div className={cn('grid grid-cols-1 gap-6', p.futures && 'lg:grid-cols-2')}>
        <Card>
          <CardHeader title="Spot, coins sold" description="What each coin made or lost when sold" />
          {p.closed.length ? (
            <Capped rows={p.closed.map((c) => (
              <li key={c.asset} className="flex min-h-10 items-center gap-3">
                <Picture of="coin" symbol={c.asset} logo={coin(c.asset).logo} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-ink">{c.asset}</span>
                  <span className="block text-small text-ink-3 tabular-nums">{c.sells} sale{c.sells === 1 ? '' : 's'}</span>
                </span>
                <span className={cn('text-body font-medium tabular-nums', signCls(c.gain))}>{money(c.gain, { sign: true, decimals: 0 })}</span>
              </li>
            ))} />
          ) : <p className="text-small text-ink-3">Nothing sold yet.</p>}
        </Card>
        {p.futures ? (
          <Card>
            <CardHeader title="Futures, closed by contract" description={p.futures.since ? `Since ${formatDay(localDate(p.futures.since, user.timezone), { month: 'short', year: 'numeric' })}` : 'Closed positions'} />
            {p.futures.bySymbol.length ? (
              <Capped rows={p.futures.bySymbol.map((s) => {
                const c = contractCoin(s.symbol)
                return (
                  <li key={s.symbol} className="flex min-h-10 items-center gap-3">
                    <Picture of="coin" symbol={c} logo={coin(c).logo} size={32} />
                    <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{s.symbol}</span>
                    <span className={cn('text-body font-medium tabular-nums', signCls(s.usd))}>{money(s.usd, { sign: true })}</span>
                  </li>
                )
              })} />
            ) : <p className="text-small text-ink-3">No closed futures trades yet.</p>}
          </Card>
        ) : null}
      </div>

      <Card className="px-0 pb-2">
        <CardHeader title="Activity" description={`${formatNumber(shown.length)} entries · latest ${page.length} shown`} className="px-5" />
        <nav aria-label="Activity type" className="flex gap-1.5 overflow-x-auto px-5 pb-3 [scrollbar-width:none]">
          {TABS.map((t) => (
            <Link key={t.key} href={t.key === 'all' ? '/wealth/portfolio' : `/wealth/portfolio?tab=${t.key}`} scroll={false} aria-current={t.key === tab ? 'page' : undefined}
              className={chipClass({ selected: t.key === tab })}>{t.label}</Link>
          ))}
        </nav>
        {page.length ? (
          <ul className="text-small">
            {page.map((a, i) => <ActivityItem key={i} a={a} logo={coin(a.asset).logo} tz={user.timezone} money={money} />)}
          </ul>
        ) : <p className="px-5 pb-3 text-small text-ink-3">Nothing here yet.</p>}
      </Card>
    </div>
  )
}

/**
 * The first rows of a list, the rest in a Fold. Side-by-side lists capped at the same count with rows of the same
 * height line up, however long either one is.
 */
function Capped({ rows, limit = 10 }: { rows: React.ReactNode[]; limit?: number }) {
  return (
    <>
      <ul className="flex flex-col gap-1.5">{rows.slice(0, limit)}</ul>
      {rows.length > limit ? (
        <Fold title={`Show ${rows.length - limit} more`} className="mt-1.5">
          <ul className="flex flex-col gap-1.5">{rows.slice(limit)}</ul>
        </Fold>
      ) : null}
    </>
  )
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-ink-3' : 'text-ink-2'}>{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'text-body font-medium text-ink' : muted ? 'text-ink-2' : 'font-medium text-ink')}>{value}</dd>
    </div>
  )
}

const KIND_LABEL: Record<ActivityRow['kind'], string> = { trade: 'Spot', p2p: 'P2P', convert: 'Convert', deposit: 'Deposit', withdrawal: 'Withdrawal', reward: 'Reward', futures: 'Futures' }

function ActivityItem({ a, logo, tz, money }: { a: ActivityRow; logo?: boolean; tz: string; money: (usd: number, o?: { sign?: boolean }) => string }) {
  const In = a.side === 'in' || a.side === 'sell'
  const Arrow = a.kind === 'deposit' ? ArrowDownLeft : a.kind === 'withdrawal' ? ArrowUpRight : a.kind === 'reward' ? Gift : null
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-divider px-5 py-3 last:border-b-0 md:grid-cols-[8.5rem_minmax(0,1fr)_9rem_8rem]">
      <span className="col-span-2 text-caption text-ink-3 tabular-nums md:col-span-1 md:text-small">
        {formatDay(localDate(a.at, tz), { day: 'numeric', month: 'short', year: '2-digit' })} · {formatTime(a.at, tz)}
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <span className="relative">
          <Picture of="coin" symbol={a.asset} logo={logo} size={32} />
          {Arrow ? <span aria-hidden className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-ink text-bg ring-2 ring-surface"><Arrow className="size-2.5" strokeWidth={2.5} /></span> : null}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-body font-medium text-ink">{a.title}</span>
          <span className="block truncate text-small text-ink-3">{KIND_LABEL[a.kind]}{a.detail ? ` · ${a.detail}` : ''}</span>
        </span>
      </span>
      <span className="hidden text-right text-ink-2 tabular-nums md:block">{a.kind === 'futures' ? '' : `${formatNumber(a.amount, a.amount < 1 ? 6 : a.amount < 1000 ? 4 : 2)} ${a.amountAsset}`}</span>
      <span className={cn('text-right font-medium tabular-nums', a.kind === 'futures' ? ((a.usd ?? 0) >= 0 ? 'text-good-ink' : 'text-bad-ink') : In ? 'text-good-ink' : 'text-ink')}>
        {a.usd == null ? '–' : money(a.usd, { sign: true })}
      </span>
    </li>
  )
}

function PortfolioSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Skeleton className="h-[140px] rounded-lg" />
        <Skeleton className="h-[188px] rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-[320px] rounded-lg" />
        <Skeleton className="h-[320px] rounded-lg" />
      </div>
      <Skeleton className="h-[400px] rounded-lg" />
    </div>
  )
}
