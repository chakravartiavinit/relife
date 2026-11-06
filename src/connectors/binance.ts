import ccxt from 'ccxt'
import type { Connector, ConnectorCtx } from '@/core/types'
import { USD_STABLES } from '@/domain/money'
import { env } from '@/core/env'

// Read-only Binance sync: balances, spot trades, P2P orders, Convert history.
// Old history beyond what the API returns: export CSV and run scripts/binance-import.ts.

type Cursor = {
  verified?: boolean
  symbols?: Record<string, number> // symbol → last trade timestamp (ms)
  assets?: string[] // assets held last sync, so sold-out ones get a zero holding
  p2pFrom?: number
  convertFrom?: number
}

const DAY = 86_400_000

function client() {
  return new ccxt.binance({
    apiKey: env('BINANCE_API_KEY'),
    secret: env('BINANCE_API_SECRET'),
    enableRateLimit: true,
    options: { adjustForTimeDifference: true },
  })
}
type Client = ReturnType<typeof client>

/** Refuse keys that can move money. */
async function assertReadOnly(ex: Client) {
  const r = (await ex.sapiGetAccountApiRestrictions()) as Record<string, unknown>
  const risky = ['enableSpotAndMarginTrading', 'enableWithdrawals', 'enableInternalTransfer', 'permitsUniversalTransfer', 'enableMargin', 'enableFutures', 'enableVanillaOptions']
    .filter((k) => r[k] === true)
  if (risky.length) {
    throw new Error(`Binance key is not read-only (${risky.join(', ')}). Create a key with only "Enable Reading" ticked.`)
  }
}

export const binance: Connector = {
  id: 'binance',
  name: 'Binance',
  category: 'wealth',
  description: 'Spot trades, P2P orders, converts and live balances, read-only. Feeds the portfolio, P&L and India tax estimate.',
  provides: ['Trades', 'Balances', 'P2P', 'Converts'],
  fields: [
    { env: 'BINANCE_API_KEY', label: 'API key', secret: true },
    { env: 'BINANCE_API_SECRET', label: 'API secret', secret: true, hint: 'Create a read-only key in Binance API Management. Leave trading and withdrawals off.' },
  ],
  env: ['BINANCE_API_KEY', 'BINANCE_API_SECRET'],
  everyMinutes: 60,
  async sync(ctx) {
    const ex = client()
    const cursor: Cursor = { symbols: {}, ...((ctx.cursor as Cursor | null) ?? {}) }
    if (!cursor.verified) {
      await assertReadOnly(ex)
      cursor.verified = true
    }
    const markets = await ex.loadMarkets()
    const now = Date.now()

    // Balances snapshot (one per hour), priced in USD via */USDT tickers.
    const bal = await ex.fetchBalance()
    const totals = bal.total as unknown as Record<string, number>
    const held = Object.entries(totals).filter(([, q]) => q > 0)
    const priceable = (a: string) => (a.startsWith('LD') && markets[`${a.slice(2)}/USDT`] ? a.slice(2) : a) // Simple Earn "LDBTC"
    const symbols = [...new Set(held.map(([a]) => priceable(a)).filter((a) => !USD_STABLES.has(a) && markets[`${a}/USDT`]).map((a) => `${a}/USDT`))]
    const tickers = symbols.length ? await ex.fetchTickers(symbols) : {}
    const price = (a: string) => (USD_STABLES.has(a) ? 1 : tickers[`${priceable(a)}/USDT`]?.last ?? undefined)
    const assets = held.map(([asset, qty]) => ({ asset, qty, priceUsd: price(asset) }))
    for (const gone of (cursor.assets ?? []).filter((a) => !totals[a])) assets.push({ asset: gone, qty: 0, priceUsd: undefined })
    const totalUsd = assets.reduce((s, a) => s + a.qty * (a.priceUsd ?? 0), 0)
    const at = new Date(now).toISOString()
    await ctx.emit({ source: 'binance', externalId: `balances:${at.slice(0, 13)}`, at: new Date(now), body: { type: 'balances', at, totalUsd, assets } })
    cursor.assets = held.map(([a]) => a)

    await syncTrades(ex, markets, ctx, cursor, held.map(([a]) => priceable(a)))
    await optional(ctx, 'P2P', () => syncP2P(ex, ctx, cursor, now))
    await optional(ctx, 'Convert', () => syncConvert(ex, ctx, cursor, now))
    ctx.setCursor(cursor)
  },
}

async function optional(ctx: ConnectorCtx, what: string, fn: () => Promise<void>) {
  try { await fn() } catch (e) { ctx.log(`binance ${what} skipped: ${e instanceof Error ? e.message : e}`) }
}

async function syncTrades(ex: Client, markets: Record<string, unknown>, ctx: ConnectorCtx, cursor: Cursor, heldAssets: string[]) {
  const quotes = (process.env.BINANCE_QUOTES || 'USDT,FDUSD,USDC').split(',').map((s) => s.trim().toUpperCase())
  const extra = (process.env.BINANCE_SYMBOLS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  const candidates = new Set([
    ...Object.keys(cursor.symbols ?? {}),
    ...extra,
    ...heldAssets.filter((a) => !USD_STABLES.has(a)).flatMap((a) => quotes.map((q) => `${a}/${q}`)),
  ])
  for (const symbol of candidates) {
    if (!markets[symbol]) continue
    const last = cursor.symbols?.[symbol]
    // With a start time ccxt pages forward; without one Binance returns the latest 1000.
    const trades = last
      ? await ex.fetchMyTrades(symbol, last + 1, undefined, { paginate: true })
      : await ex.fetchMyTrades(symbol, undefined, 1000)
    for (const t of trades) {
      await ctx.emit({
        source: 'binance', externalId: `trade:${symbol}:${t.id}`, at: new Date(t.timestamp!),
        body: { type: 'trade', id: t.id, symbol, side: t.side, amount: t.amount, price: t.price, timestamp: t.timestamp, fee: t.fee, order: t.order },
      })
      cursor.symbols![symbol] = Math.max(cursor.symbols![symbol] ?? 0, t.timestamp!)
    }
  }
}

type P2POrder = { orderNumber: string; orderStatus: string; createTime: number; [k: string]: unknown }

async function syncP2P(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number) {
  // Re-scan 2 days back each time: orders complete after they are created.
  const from = Math.max((cursor.p2pFrom ?? now - 30 * DAY) - 2 * DAY, now - 365 * DAY)
  for (const tradeType of ['BUY', 'SELL']) {
    for (let page = 1; page <= 20; page++) {
      const r = (await ex.sapiGetC2cOrderMatchListUserOrderHistory({ tradeType, startTimestamp: from, page, rows: 100 })) as { data?: P2POrder[] }
      const rows = r.data ?? []
      for (const o of rows.filter((x) => x.orderStatus === 'COMPLETED')) {
        await ctx.emit({ source: 'binance', externalId: `p2p:${o.orderNumber}`, at: new Date(Number(o.createTime)), body: { type: 'p2p', ...o } })
      }
      if (rows.length < 100) break
    }
  }
  cursor.p2pFrom = now
}

async function syncConvert(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number) {
  // The endpoint wants windows of at most 30 days.
  for (let start = Math.max((cursor.convertFrom ?? now - 90 * DAY) - DAY, now - 365 * DAY); start < now; start += 30 * DAY) {
    const end = Math.min(now, start + 30 * DAY)
    const r = (await ex.sapiGetConvertTradeFlow({ startTime: start, endTime: end, limit: 1000 })) as { list?: { orderId: string | number; orderStatus: string; createTime: number }[] }
    for (const o of (r.list ?? []).filter((x) => x.orderStatus === 'SUCCESS')) {
      await ctx.emit({ source: 'binance', externalId: `convert:${o.orderId}`, at: new Date(Number(o.createTime)), body: { type: 'convert', ...o } })
    }
  }
  cursor.convertFrom = now
}
