import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { convert } from '@/core/fx'
import { formatDay, formatTime, localDate } from '@/core/time'
import { formatMoney, formatNumber, USD_STABLES } from '@/domain/money'
import { fifo, financialYear, indiaCryptoTax, type Fill } from '@/domain/pnl'
import { Badge, Card, CardHeader, PageHeader, Skeleton, Stat } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { cn } from '@/ui/cn'
import { Ticker } from '@/ui/components/ticker'

export const metadata: Metadata = { title: 'Portfolio' }

export default function PortfolioPage({ searchParams }: PageProps<'/wealth/portfolio'>) {
  return (
    <>
      <PageHeader eyebrow="Wealth" title="Portfolio" description="Crypto holdings, trades and realized gains." />
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
  const today = localDate(new Date(), user.timezone)

  const [holdings, trades] = await Promise.all([
    db.select().from(schema.holdings).where(eq(schema.holdings.userId, user.id)),
    db.select().from(schema.trades).where(eq(schema.trades.userId, user.id)).orderBy(asc(schema.trades.at)),
  ])

  if (!holdings.length && !trades.length) {
    return (
      <Card>
        <EmptyState
          title="No crypto connected"
          description="Add a read-only Binance API key in Connectors. Holdings, trades and P2P orders sync automatically."
          action={<Link href="/connectors" className={buttonClass({ variant: 'primary' })}>Connect Binance</Link>}
        />
      </Card>
    )
  }

  // Holdings valued now.
  const usdToBase = (await convert(1, 'USD', base, today)) ?? 0
  const priceOf = new Map<string, number>()
  for (const h of holdings) priceOf.set(h.asset, USD_STABLES.has(h.asset) ? 1 : h.priceUsd ?? 0)
  const held = holdings
    .map((h) => ({ ...h, price: priceOf.get(h.asset) ?? 0, usd: h.qty * (priceOf.get(h.asset) ?? 0) }))
    .filter((h) => h.qty > 0)
    .sort((a, b) => b.usd - a.usd)
  const totalUsd = held.reduce((s, h) => s + h.usd, 0)

  // Trades → fills valued in USD. Stable quotes = USD; INR quotes converted on the trade date; others skipped.
  const fills: Fill[] = []
  let skipped = 0
  for (const t of trades) {
    const [asset, quote] = t.symbol.split('/')
    let quoteUsd: number | null = null
    if (USD_STABLES.has(quote)) quoteUsd = 1
    else if (quote === 'INR') quoteUsd = await convert(1, 'INR', 'USD', localDate(t.at, user.timezone))
    if (quoteUsd == null || !asset) { skipped++; continue }
    const unitPrice = t.price * quoteUsd
    const fee = t.feeAsset === quote || !t.feeAsset ? t.fee * quoteUsd : t.feeAsset === asset ? t.fee * unitPrice : 0 // ponytail: fees paid in a third asset (BNB) are ignored
    fills.push({ at: t.at, asset, side: t.side, qty: t.qty, unitPrice, fee })
  }
  const pnl = fifo(fills)
  let unrealizedUsd = 0
  for (const [asset, lots] of Object.entries(pnl.open)) {
    const p = priceOf.get(asset)
    if (p == null) continue
    for (const l of lots) unrealizedUsd += l.qty * (p - l.unitCost)
  }

  // Tax for the selected Indian financial year, in INR at each sale date.
  const years = [...new Set(pnl.realized.map((r) => financialYear(r.at)))].sort().reverse()
  const currentFy = financialYear(new Date())
  if (!years.includes(currentFy)) years.unshift(currentFy)
  const fyParam = (await searchParams).fy
  const fy = typeof fyParam === 'string' && years.includes(fyParam) ? fyParam : currentFy
  const realizedInr = await Promise.all(pnl.realized.filter((r) => financialYear(r.at) === fy).map(async (r) => {
    const rate = (await convert(1, 'USD', 'INR', localDate(r.at, user.timezone))) ?? 0
    return { ...r, proceeds: r.proceeds * rate, cost: r.cost * rate, gain: r.gain * rate }
  }))
  const tax = indiaCryptoTax(realizedInr)

  const recent = [...trades].reverse().slice(0, 50)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
          <Stat label="Holdings" value={<Ticker value={totalUsd * usdToBase} currency={base} />} sub={formatMoney(totalUsd, 'USD')} />
          <Stat
            label="Unrealized"
            value={formatMoney(unrealizedUsd * usdToBase, base, { sign: true })}
            tone={unrealizedUsd >= 0 ? 'good' : 'bad'}
            sub={formatMoney(unrealizedUsd, 'USD', { sign: true })}
          />
          <Stat
            label="Realized (all time)"
            value={formatMoney(pnl.totals.realizedGain * usdToBase, base, { sign: true })}
            tone={pnl.totals.realizedGain >= 0 ? 'good' : 'bad'}
            sub={`${pnl.realized.length} sell${pnl.realized.length === 1 ? '' : 's'}`}
          />
          <Stat label="Fees paid" value={formatMoney(pnl.totals.fees * usdToBase, base)} sub={formatMoney(pnl.totals.fees, 'USD')} />
        </div>
        {skipped || pnl.unmatched.length ? (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-4">
            {skipped ? <Badge color="var(--warn)">{skipped} trade{skipped === 1 ? '' : 's'} not valued (non-USD/INR quote)</Badge> : null}
            {pnl.unmatched.length ? <Badge color="var(--warn)">Sells exceed known buys for {pnl.unmatched.map((u) => u.asset).join(', ')}: import older history</Badge> : null}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="px-0 pb-2">
          <CardHeader title="Holdings" description="Binance · prices in USD" className="px-5" />
          {held.length ? (
            <div role="table" aria-label="Holdings" className="text-sm">
              <div role="row" className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_8rem] gap-4 border-b border-divider px-5 pb-2 text-[12px] font-medium text-ink-3 sm:grid">
                <span role="columnheader">Asset</span>
                <span role="columnheader" className="text-right">Quantity</span>
                <span role="columnheader" className="text-right">Price</span>
                <span role="columnheader" className="text-right">Value</span>
              </div>
              {held.map((h) => (
                <div role="row" key={h.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-divider px-5 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_8rem]">
                  <span role="cell" className="min-w-0">
                    <span className="block font-medium text-ink">{h.asset}</span>
                    <span className="mt-1.5 block h-1.5 max-w-40 rounded-full bg-surface-2" aria-label={`${Math.round((h.usd / (totalUsd || 1)) * 100)}% of holdings`}>
                      <span className="block h-full rounded-full" style={{ width: `${(h.usd / (totalUsd || 1)) * 100}%`, background: 'var(--cat-wealth)' }} />
                    </span>
                  </span>
                  <span role="cell" className="hidden text-right text-ink-2 tabular-nums sm:block">{formatNumber(h.qty, h.qty < 1 ? 6 : 4)}</span>
                  <span role="cell" className="hidden text-right text-ink-2 tabular-nums sm:block">{formatMoney(h.price, 'USD', { decimals: h.price < 1 ? 4 : 2 })}</span>
                  <span role="cell" className="text-right tabular-nums">
                    <span className="block font-medium text-ink">{formatMoney(h.usd * usdToBase, base)}</span>
                    <span className="block text-[12px] text-ink-3">{formatMoney(h.usd, 'USD')}<span className="sm:hidden"> · {formatNumber(h.qty, 4)}</span></span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 pb-3 text-[13px] text-ink-3">No holdings synced yet.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="India tax estimate" description="Flat 30% + 4% cess on gains, losses not set off" />
          <nav aria-label="Financial year" className="mb-4 flex flex-wrap gap-1">
            {years.map((y) => (
              <Link
                key={y}
                href={`/wealth/portfolio?fy=${encodeURIComponent(y)}`}
                aria-current={y === fy ? 'true' : undefined}
                className={cn(buttonClass({ variant: y === fy ? 'primary' : 'ghost', size: 'sm' }))}
              >
                {y}
              </Link>
            ))}
          </nav>
          <dl className="flex flex-col gap-3 text-sm">
            <Row label="Taxable gains" value={formatMoney(tax.taxableGains, 'INR')} />
            <Row label="Tax (30% + cess)" value={formatMoney(tax.tax, 'INR')} strong />
            <Row label="TDS, 1% of sells (est.)" value={formatMoney(tax.tdsEstimate, 'INR')} />
            <Row label="Sells this year" value={formatNumber(realizedInr.length)} />
          </dl>
          <p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-[12px] text-ink-2">Estimate only, valued at each sale date’s USD/INR rate. Verify with a CA before filing.</p>
        </Card>
      </div>

      <Card className="px-0 pb-2">
        <CardHeader title="Recent trades" description={`Latest ${recent.length} of ${trades.length}`} className="px-5" />
        {recent.length ? (
          <div role="table" aria-label="Recent trades" className="text-sm">
            <div role="row" className="hidden grid-cols-[8rem_minmax(0,1fr)_5rem_8rem_8rem_6rem] gap-4 border-b border-divider px-5 pb-2 text-[12px] font-medium text-ink-3 sm:grid">
              <span role="columnheader">Date</span>
              <span role="columnheader">Pair</span>
              <span role="columnheader">Side</span>
              <span role="columnheader" className="text-right">Quantity</span>
              <span role="columnheader" className="text-right">Price</span>
              <span role="columnheader">Type</span>
            </div>
            {recent.map((t) => {
              const quote = t.symbol.split('/')[1] ?? ''
              return (
                <div role="row" key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-divider px-5 py-3 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)_5rem_8rem_8rem_6rem]">
                  <span role="cell" className="col-span-2 text-[12px] text-ink-3 tabular-nums sm:col-span-1 sm:text-[13px]">
                    {formatDay(localDate(t.at, user.timezone), { day: 'numeric', month: 'short', year: '2-digit' })} · {formatTime(t.at, user.timezone)}
                  </span>
                  <span role="cell" className="font-medium text-ink">{t.symbol}</span>
                  <span role="cell" className={cn('text-right text-[13px] font-medium sm:text-left', t.side === 'buy' ? 'text-good' : 'text-bad')}>
                    {t.side === 'buy' ? 'Buy' : 'Sell'}
                  </span>
                  <span role="cell" className="text-ink-2 tabular-nums sm:text-right">{formatNumber(t.qty, 6)}</span>
                  <span role="cell" className="text-right text-ink-2 tabular-nums">{formatMoney(t.price, quote || 'USD', { decimals: t.price < 1 ? 6 : 2 })}</span>
                  <span role="cell" className="hidden sm:block"><Badge>{t.kind}</Badge></span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="px-5 pb-3 text-[13px] text-ink-3">No trades yet.</p>
        )}
      </Card>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'font-display text-[20px] font-bold text-ink' : 'font-medium text-ink')}>{value}</dd>
    </div>
  )
}

function PortfolioSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-[118px] rounded-lg" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[320px] rounded-lg" />
        <Skeleton className="h-[320px] rounded-lg" />
      </div>
      <Skeleton className="h-[400px] rounded-lg" />
    </div>
  )
}
