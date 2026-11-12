import { and, asc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import { convert } from './fx'
import { localDate } from './time'
import type { User } from './user'
import { USD_STABLES } from '@/domain/money'
import { allTimePnl, fifo, type Fill, type Movement } from '@/domain/pnl'

// Everything the Portfolio page shows about a crypto exchange account, in USD (the page converts):
// spot holdings with cost basis, futures, all-time P&L with its breakdown, and one activity ledger.

/** Balances worth less than this are dust left after a sale. */
export const DUST_USD = 1

export type Position = { symbol: string; side: 'long' | 'short'; size: number; entry: number; unrealized: number; leverage: number; notional: number; margin: number; mark?: number; liquidation?: number; marginType?: string }
export type ActivityRow = {
  at: Date; kind: 'trade' | 'p2p' | 'convert' | 'deposit' | 'withdrawal' | 'reward' | 'futures'
  asset: string; title: string; detail?: string; amount: number; amountAsset: string; usd: number | null; side?: 'buy' | 'sell' | 'in' | 'out'
}

export async function loadPortfolio(user: User) {
  const today = localDate(new Date(), user.timezone)
  const [accounts, holdings, trades, flows] = await Promise.all([
    db.select().from(schema.accounts).where(and(eq(schema.accounts.userId, user.id), eq(schema.accounts.kind, 'exchange'))),
    db.select().from(schema.holdings).where(eq(schema.holdings.userId, user.id)),
    db.select().from(schema.trades).where(eq(schema.trades.userId, user.id)).orderBy(asc(schema.trades.at)),
    db.select().from(schema.cryptoFlows).where(eq(schema.cryptoFlows.userId, user.id)).orderBy(asc(schema.cryptoFlows.at)),
  ])
  const futuresAcc = accounts.find((a) => a.key.endsWith(':futures'))
  const spotHoldings = holdings.filter((h) => h.accountId !== futuresAcc?.id)
  const usdToBase = (await convert(1, 'USD', user.baseCurrency, today)) ?? 0
  const inrToUsd = async (d: Date) => (await convert(1, 'INR', 'USD', localDate(d, user.timezone))) ?? 0

  // Spot holdings valued now; dust under $1 is set aside.
  const priceOf = new Map(spotHoldings.map((h) => [h.asset, USD_STABLES.has(h.asset) ? 1 : h.priceUsd ?? 0]))
  const valued = spotHoldings.filter((h) => h.qty > 0)
    .map((h) => ({ ...h, price: priceOf.get(h.asset) ?? 0, usd: h.qty * (priceOf.get(h.asset) ?? 0) }))
    .sort((a, b) => b.usd - a.usd)
  const held = valued.filter((h) => h.usd >= DUST_USD)
  const dust = valued.filter((h) => h.usd < DUST_USD)
  const spotUsd = valued.reduce((s, h) => s + h.usd, 0)

  // Spot P&L (FIFO). Stablecoins are cash: buying USDT on P2P is money in, not a position.
  const fills: Fill[] = []
  let skipped = 0
  for (const t of trades) {
    const [asset, quote] = t.symbol.split('/')
    if (!asset || USD_STABLES.has(asset) || t.kind === 'futures') continue
    const known = (t.meta as { usd?: number }).usd // dust conversions carry their dollar value
    const quoteUsd = USD_STABLES.has(quote) ? 1 : quote === 'INR' ? await inrToUsd(t.at) : known != null && t.qty * t.price ? known / (t.qty * t.price) : null
    if (quoteUsd == null) { skipped++; continue }
    const unitPrice = t.price * quoteUsd
    const fee = t.feeAsset === quote || !t.feeAsset ? t.fee * quoteUsd : t.feeAsset === asset ? t.fee * unitPrice : 0 // ponytail: fees paid in BNB are left to the all-time figure
    fills.push({ at: t.at, asset, side: t.side, qty: t.qty, unitPrice, fee })
  }
  // Coins that arrived or left by transfer: a deposit is bought at that day's price, a withdrawal just leaves.
  for (const f of flows) {
    if ((f.kind !== 'deposit' && f.kind !== 'withdrawal' && f.kind !== 'reward') || USD_STABLES.has(f.asset) || !f.amount) continue
    const qty = Math.abs(f.amount)
    // A reward (airdrop) costs what it was worth the day it arrived; with no price that day, nothing.
    if (f.usd == null && f.kind !== 'reward') continue
    fills.push({ at: f.at, asset: f.asset, side: f.kind === 'withdrawal' ? 'out' : 'in', qty, unitPrice: Math.abs(f.usd ?? 0) / qty, fee: 0 })
  }
  const pnl = fifo(fills)
  const basis = new Map(Object.entries(pnl.open).map(([asset, lots]) => {
    const qty = lots.reduce((n, l) => n + l.qty, 0)
    const cost = lots.reduce((n, l) => n + l.qty * l.unitCost, 0)
    return [asset, { qty, avg: qty > 0 ? cost / qty : 0 }]
  }))
  const rows = held.map((h) => {
    const b = basis.get(h.asset)
    const covered = b && b.qty > 1e-12 ? Math.min(b.qty, h.qty) : 0
    const cost = covered * (b?.avg ?? 0)
    const gain = covered && !USD_STABLES.has(h.asset) ? covered * h.price - cost : null
    return { ...h, avg: gain != null ? b!.avg : null, cost: gain != null ? cost : 0, gain, pct: gain != null && cost > 0 ? gain / cost : null, partial: gain != null && covered < h.qty * 0.98 }
  })
  const spotOpen = rows.reduce((s, r) => s + (r.gain ?? 0), 0)
  const spotCost = rows.reduce((s, r) => s + r.cost, 0)
  const closedMap = new Map<string, { gain: number; sells: number }>()
  for (const r of pnl.realized) { const a = closedMap.get(r.asset) ?? { gain: 0, sells: 0 }; closedMap.set(r.asset, { gain: a.gain + r.gain, sells: a.sells + 1 }) }
  const closed = [...closedMap].map(([asset, v]) => ({ asset, ...v })).sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))

  // Futures: margin balance and open positions from the last sync, income from the ledger.
  const fmeta = (futuresAcc?.meta ?? {}) as { walletUsd?: number; unrealizedUsd?: number; positions?: Position[]; at?: string }
  const fUsd = (k: string) => flows.filter((f) => f.kind === k && f.accountId === futuresAcc?.id).reduce((s, f) => s + (f.usd ?? 0), 0)
  const bySymbol = new Map<string, number>()
  for (const f of flows) if (f.kind === 'futures_pnl' && f.symbol) bySymbol.set(f.symbol, (bySymbol.get(f.symbol) ?? 0) + (f.usd ?? 0))
  const futures = futuresAcc ? {
    walletUsd: fmeta.walletUsd ?? 0, openUsd: fmeta.unrealizedUsd ?? 0, positions: fmeta.positions ?? [], at: fmeta.at ?? null,
    realized: fUsd('futures_pnl'), funding: fUsd('funding'), commission: fUsd('commission'), other: fUsd('other'),
    bySymbol: [...bySymbol].map(([symbol, usd]) => ({ symbol, usd })).sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd)),
    since: flows.find((f) => f.accountId === futuresAcc.id)?.at ?? null,
  } : null
  const futuresUsd = futures ? futures.walletUsd + futures.openUsd : 0

  // All-time: value now + money out − money in. In: crypto deposits and rupees paid on P2P; out: the reverse.
  const moves: Movement[] = []
  // Money put in and taken out, for information only: it isn't profit or loss.
  // A Pay transfer that also shows as a deposit or withdrawal (same coin and amount, within 3 days) is one move.
  const transfers = flows.filter((f) => (f.kind === 'deposit' || f.kind === 'withdrawal') && (f.meta as { via?: string }).via !== 'pay')
  const twin = (f: typeof flows[number]) => (f.meta as { via?: string }).via === 'pay' && transfers.some((d) => d.kind === f.kind && d.asset === f.asset && Math.abs(Math.abs(d.amount) - Math.abs(f.amount)) < 0.01 && Math.abs(d.at.getTime() - f.at.getTime()) < 3 * 86_400_000)
  for (const f of flows) {
    if ((f.kind !== 'deposit' && f.kind !== 'withdrawal') || twin(f)) continue
    moves.push({ kind: f.kind === 'deposit' ? 'in' : 'out', usd: f.usd == null ? null : Math.abs(f.usd) })
  }
  const p2p = trades.filter((t) => t.kind === 'p2p' || t.kind === 'fiat')
  for (const t of p2p) {
    const [, quote] = t.symbol.split('/')
    const total = (t.meta as { totalPrice?: number }).totalPrice ?? t.qty * t.price
    moves.push({ kind: t.side === 'buy' ? 'in' : 'out', usd: USD_STABLES.has(quote) ? total : quote === 'INR' ? total * (await inrToUsd(t.at)) : null })
  }
  const money = allTimePnl(spotUsd + futuresUsd, moves)

  // Profit and loss comes only from orders: spot buys and sells, and futures trades with their funding and fees.
  const sells = pnl.realized.length
  const groups: { key: 'spot' | 'futures'; label: string; items: { label: string; usd: number; hint: string; open?: boolean }[] }[] = [
    { key: 'spot', label: 'Spot', items: [
      { label: 'Coins sold', usd: pnl.totals.realizedGain, hint: `${sells} sale${sells === 1 ? '' : 's'}, trading fees already taken off` },
      { label: 'Coins still held', usd: spotOpen, hint: 'Today’s price against what you paid', open: true },
    ] },
    ...(futures ? [{ key: 'futures' as const, label: 'Futures', items: [
      { label: 'Closed trades', usd: futures.realized, hint: 'Profit and loss of positions you closed' },
      { label: 'Open positions', usd: futures.openUsd, hint: 'If you closed them at today’s price', open: true },
      { label: 'Funding', usd: futures.funding, hint: 'Paid or received every 8 hours while a position is open' },
      { label: 'Trading fees', usd: futures.commission + futures.other, hint: 'Fees on futures orders, less any rebates' },
    ] }] : []),
  ]
  const breakdown = groups.map((g) => ({ ...g, total: g.items.reduce((s, i) => s + i.usd, 0) }))
  const items = groups.flatMap((g) => g.items)
  const trading = {
    total: items.reduce((s, i) => s + i.usd, 0),
    realized: items.filter((i) => !i.open).reduce((s, i) => s + i.usd, 0),
    open: items.filter((i) => i.open).reduce((s, i) => s + i.usd, 0),
  }

  // Activity: one ledger. Fills of one order are grouped; futures income is grouped per contract and day.
  const activity: ActivityRow[] = []
  const orders = new Map<string, ActivityRow & { fills: number; total: number; quote: string; via: string; usdKnown: number | null }>()
  for (const t of trades) {
    const [asset, quote = 'USD'] = t.symbol.split('/')
    const key = `${t.symbol}|${t.side}|${t.kind}|${Math.floor(t.at.getTime() / 60_000)}`
    const o = orders.get(key) ?? { at: t.at, kind: t.kind === 'p2p' || t.kind === 'fiat' ? 'p2p' as const : t.kind === 'convert' || t.kind === 'dust' ? 'convert' as const : 'trade' as const, asset, title: `${t.side === 'buy' ? 'Bought' : 'Sold'} ${asset}`, amount: 0, amountAsset: asset, usd: null, side: t.side, fills: 0, total: 0, quote, via: t.kind, usdKnown: null }
    o.amount += t.qty; o.total += t.qty * t.price; o.fills++
    const known = (t.meta as { usd?: number }).usd
    if (known != null) o.usdKnown = (o.usdKnown ?? 0) + known
    orders.set(key, o)
  }
  for (const o of orders.values()) {
    const avg = o.total / (o.amount || 1)
    const quoteUsd = USD_STABLES.has(o.quote) ? 1 : o.quote === 'INR' ? await inrToUsd(o.at) : o.usdKnown != null && o.total ? o.usdKnown / o.total : null
    activity.push({ ...o, usd: quoteUsd == null ? null : o.total * quoteUsd * (o.side === 'buy' ? -1 : 1), detail: `${VIA[o.via] ?? ''}${fmtPrice(avg, o.quote)} each${o.fills > 1 ? ` · ${o.fills} fills` : ''}` })
  }
  for (const f of flows) {
    if (f.kind === 'deposit' || f.kind === 'withdrawal') {
      activity.push({ at: f.at, kind: f.kind, asset: f.asset, title: (f.meta as { via?: string }).via === 'pay' ? `${f.kind === 'deposit' ? 'Received' : 'Sent'} ${f.asset}` : `${f.kind === 'deposit' ? 'Deposited' : 'Withdrew'} ${f.asset}`, detail: (f.meta as { via?: string }).via === 'pay' ? (f.kind === 'deposit' ? 'Binance Pay, received' : 'Binance Pay, sent') : (f.meta as { network?: string }).network ? `${(f.meta as { network?: string }).network} network` : undefined, amount: Math.abs(f.amount), amountAsset: f.asset, usd: f.usd, side: f.kind === 'deposit' ? 'in' : 'out' })
    }
  }
  for (const f of flows) {
    if (f.kind === 'reward') activity.push({ at: f.at, kind: 'reward', asset: f.asset, title: `Received ${f.asset}`, detail: String((f.meta as { info?: string }).info ?? 'Reward'), amount: Math.abs(f.amount), amountAsset: f.asset, usd: f.usd, side: 'in' })
  }
  const futDays = new Map<string, ActivityRow>()
  for (const f of flows) {
    if (f.accountId !== futuresAcc?.id || f.kind === 'transfer' || f.kind === 'deposit' || f.kind === 'withdrawal') continue
    const day = localDate(f.at, user.timezone)
    const key = `${f.symbol ?? f.asset}|${day}`
    const row = futDays.get(key) ?? { at: f.at, kind: 'futures' as const, asset: f.symbol ? contractCoin(f.symbol) : f.asset, title: `${f.symbol ?? f.asset} futures`, detail: '', amount: 0, amountAsset: f.asset, usd: 0 }
    row.usd = (row.usd ?? 0) + (f.usd ?? 0)
    row.amount += f.amount
    if (f.at > row.at) row.at = f.at
    futDays.set(key, row)
  }
  for (const r of futDays.values()) activity.push({ ...r, detail: 'Closed P&L, funding and fees that day', side: (r.usd ?? 0) >= 0 ? 'in' : 'out' })
  activity.sort((a, b) => b.at.getTime() - a.at.getTime())

  return {
    usdToBase, rows, dust, held, spotUsd, spotOpen, spotCost, futures, futuresUsd, closed, pnl, skipped, money, trading, breakdown, activity,
    counts: { trades: trades.filter((t) => t.kind === 'spot').length, p2p: p2p.length, deposits: flows.filter((f) => f.kind === 'deposit').length, withdrawals: flows.filter((f) => f.kind === 'withdrawal').length, futures: flows.filter((f) => f.accountId === futuresAcc?.id && f.kind !== 'transfer').length },
    empty: !holdings.length && !trades.length && !flows.length,
  }
}

/** The coin behind a futures contract: BTCUSDT → BTC, 1000PEPEUSDT → PEPE. */
export const contractCoin = (symbol: string) => symbol.replace(/(USDT|USDC|BUSD|FDUSD)$/, '').replace(/^(1000000|1000|1M)(?=[A-Z])/, '')

const VIA: Record<string, string> = { p2p: 'P2P · ', fiat: 'Card / UPI · ', convert: 'Convert · ', dust: 'Small balance to BNB · ' }

const fmtPrice = (v: number, quote: string) => {
  const usd = USD_STABLES.has(quote)
  const n = v.toLocaleString('en-IN', { maximumFractionDigits: v < 1 ? 4 : 2 })
  return usd ? `$${n}` : quote === 'INR' ? `₹${n}` : `${n} ${quote}`
}

/** Holdings rows the Wealth overview shows (spot only, no dust). */
export async function topCoins(user: User) {
  const accounts = await db.select().from(schema.accounts).where(and(eq(schema.accounts.userId, user.id), eq(schema.accounts.kind, 'exchange')))
  const spot = accounts.filter((a) => !a.key.endsWith(':futures')).map((a) => a.id)
  if (!spot.length) return []
  const holdings = await db.select().from(schema.holdings).where(and(eq(schema.holdings.userId, user.id), inArray(schema.holdings.accountId, spot)))
  return holdings.map((h) => ({ asset: h.asset, usd: h.qty * (USD_STABLES.has(h.asset) ? 1 : h.priceUsd ?? 0) }))
    .filter((h) => h.usd >= DUST_USD).sort((a, b) => b.usd - a.usd)
}
