import ccxt from 'ccxt'
import { inflateRawSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Connector, ConnectorCtx } from '@/core/types'
import { USD_STABLES } from '@/domain/money'
import { env } from '@/core/env'

// Read-only Binance sync: spot and funding balances, USDⓈ-M futures (wallet, open positions, income),
// spot trades, P2P orders, Convert, and crypto deposits and withdrawals.
//
// The first sync reads the whole history: every spot pair is checked once (Binance has no "pairs you
// traded" endpoint, so this takes about ten minutes), and P2P, Convert, deposits, withdrawals and futures
// income are read from the start. Later syncs read only what's new.

type Cursor = {
  /** Fingerprint of the key whose permissions were checked (older cursors stored `true`). A new key is checked again. */
  verified?: boolean | string
  symbols?: Record<string, number> // symbol → last trade timestamp (ms)
  assets?: string[] // assets held last sync, so sold-out ones get a zero holding
  scanned?: boolean // every spot pair checked once
  p2pFrom?: number
  p2pFull?: boolean
  convertFrom?: number
  convertFull?: boolean
  flowsFrom?: number // deposits and withdrawals
  futuresFrom?: number // futures income
  futuresFull?: boolean // older futures history read from Binance's yearly downloads
  futuresYears?: number // how many of those yearly files are done (kept if a later one fails, so none is asked for twice)
  futuresTries?: number // failed attempts at the file in progress; the monthly download quota is small
  scanIndex?: number // first-sync pair scan: pairs done so far (sorted), so an outage resumes instead of starting over
  futuresAnchor?: number // when the yearly downloads started: every file and the API catch-up are measured from it, so a resumed run leaves no gap
  payFrom?: number // Binance Pay
  rewardsFrom?: number // airdrops, Launchpool and other rewards
  fiatFrom?: number // crypto bought or sold with card or UPI
  dustFrom?: number // small balances converted to BNB
}

const DAY = 86_400_000
const START = Date.parse('2019-01-01') // before any account here; empty windows are cheap
const SCAN_QUOTES = ['USDT', 'FDUSD', 'USDC', 'BTC', 'BNB', 'ETH', 'BUSD', 'TUSD']

const RETRY_WAITS = [3_000, 15_000, 60_000] // after a rate limit or an outage: three more tries, longer each time

/** Worth trying again soon: Binance busy, rate limited or unreachable. Not a ban (418), a blocked region or a clock that's off. */
const retriable = (e: unknown) => e instanceof ccxt.NetworkError && !/\b418\b|restricted location|\b451\b|"code":\s*-1021/i.test(e.message)

/** `retry: false` for the Connect dialog's check, which has 15 seconds. */
function client(key = env('BINANCE_API_KEY'), secret = env('BINANCE_API_SECRET'), retry = true) {
  const ex = new ccxt.binance({
    apiKey: key,
    secret,
    enableRateLimit: true,
    timeout: 30_000, // a request that never answers would hang the whole sync
    options: { adjustForTimeDifference: true },
  })
  // Every request goes through here, so a 429 or a hiccup waits and retries (signed again, with a fresh
  // timestamp) instead of failing a sync that may be ten minutes in.
  const fetch2 = ex.fetch2.bind(ex) as (...a: unknown[]) => Promise<unknown>
  ex.fetch2 = (async (...a: unknown[]) => {
    for (let i = 0; ; i++) {
      try { return await fetch2(...a) } catch (e) {
        if (!retry || i >= RETRY_WAITS.length || !retriable(e)) throw e
        await sleep(RETRY_WAITS[i])
      }
    }
  }) as typeof ex.fetch2
  return ex
}
type Client = ReturnType<typeof client>

/**
 * Binance's answer to a bad key, in words that say what to fix. ccxt puts the Binance code in the message
 * (`{"code":-2015,...}`). Null when it's something else.
 */
export function keyProblem(e: unknown): string | null {
  const code = /"code":\s*(-\d+)/.exec(e instanceof Error ? e.message : String(e))?.[1]
  switch (code) {
    case '-2014': case '-2008': case '-1022':
      return 'Binance doesn’t accept this API key or secret. Paste both again in full, with no spaces.'
    case '-2015':
      return 'Binance rejected the key. In API Management check that the key still exists, that “Enable Reading” is ticked, and that its trusted IP list includes this computer’s public IP (run curl ifconfig.me).'
    case '-2017':
      return 'Binance has locked this API key. Create a new read-only key in API Management.'
    case '-1021':
      return 'This computer’s clock is off from Binance’s. Turn on automatic date and time in System Settings, then try again.'
    default:
      return null
  }
}

/** Binance serves nothing to some countries (HTTP 451); retrying never helps. */
const blockedRegion = (e: unknown) => /restricted location|\b451\b/i.test(e instanceof Error ? e.message : String(e))

/**
 * Why futures can't be read, when spot could. "Enable Reading" covers futures reads, but Binance refuses (-2015)
 * a key made before the futures account was opened. "Enable Futures" is a trading permission and never needed.
 */
export function futuresProblem(e: unknown): string | null {
  return /"code":\s*-2015/.test(e instanceof Error ? e.message : String(e))
    ? 'Binance refused futures reads for this key. Keys made before the futures account was opened can’t read futures. Create a new key with only “Enable Reading” ticked; don’t tick “Enable Futures”.'
    : null
}

/** The permissions that make a key unsafe, as a sentence; null when the key is read-only. */
export function readOnlyProblem(r: Record<string, unknown>): string | null {
  const risky = ['enableSpotAndMarginTrading', 'enableWithdrawals', 'enableInternalTransfer', 'permitsUniversalTransfer', 'enableMargin', 'enableFutures', 'enableVanillaOptions']
    .filter((k) => r[k] === true)
  return risky.length ? `Binance key is not read-only (${risky.join(', ')}). Create a key with only "Enable Reading" ticked; it reads futures too.` : null
}

/** Refuse keys that can move money. */
async function assertReadOnly(ex: Client) {
  const problem = readOnlyProblem((await ex.sapiGetAccountApiRestrictions()) as Record<string, unknown>)
  if (problem) throw new Error(problem)
}

/** Rows of a time window from an endpoint that can't page: a full answer may have more behind it, so the window is halved until it isn't. Repeats are dropped later by id. */
export async function windowRows<R>(start: number, end: number, limit: number, read: (start: number, end: number) => Promise<R[] | null>): Promise<R[]> {
  const rows = (await read(start, end)) ?? []
  if (rows.length < limit || end - start < 2) return rows
  const mid = Math.floor((start + end) / 2)
  return [...(await windowRows(start, mid, limit, read)), ...(await windowRows(mid + 1, end, limit, read))]
}

/** A window of history Binance refuses as too old is skipped; rate limits, outages and key problems are not, so a cursor never moves past unread data. */
async function window<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn() } catch (e) {
    if (e instanceof ccxt.NetworkError || e instanceof ccxt.AuthenticationError || e instanceof ccxt.PermissionDenied || keyProblem(e)) throw e
    return null
  }
}

export const binance: Connector = {
  id: 'binance',
  name: 'Binance',
  category: 'wealth',
  description: 'Spot, futures, P2P, Convert, deposits and withdrawals, read-only. Feeds the portfolio and all-time profit and loss.',
  provides: ['Spot', 'Futures', 'P2P', 'Deposits'],
  fields: [
    { env: 'BINANCE_API_KEY', label: 'API key', secret: true },
    { env: 'BINANCE_API_SECRET', label: 'API secret', secret: true, hint: 'Binance → API Management → Create API. Tick only “Enable Reading”; leave trading, withdrawals and futures off. If you limit the key to trusted IPs, add this computer’s public IP (curl ifconfig.me). ReLife tests the key when you connect.' },
  ],
  env: ['BINANCE_API_KEY', 'BINANCE_API_SECRET'],
  everyMinutes: 15, // balances and prices for the portfolio; later runs only fetch what's new
  /** One signed read of the key's permissions: a wrong key, a blocked IP or a key that can trade is reported before saving. */
  async check(get) {
    const ex = client(get('BINANCE_API_KEY'), get('BINANCE_API_SECRET'), false)
    try {
      await ex.loadTimeDifference()
      await assertReadOnly(ex)
    } catch (e) {
      const problem = keyProblem(e)
      if (problem) throw new Error(problem)
      if (e instanceof Error && e.message.startsWith('Binance key is not read-only')) throw e
      // Anything else (Binance busy, offline, blocked region): can't tell now; the first sync reports it.
    }
  },
  async sync(ctx) {
    try { await run(ctx) } catch (e) {
      throw blockedRegion(e) ? new Error('Binance doesn’t serve requests from this location (HTTP 451). Run ReLife from another region or through a VPN.')
        : keyProblem(e) ? new Error(keyProblem(e)!) : e
    }
  },
}

async function run(ctx: ConnectorCtx) {
  const ex = client()
  await ex.loadTimeDifference() // before the first signed call, so a clock a few seconds off isn't refused (-1021)
  const cursor: Cursor = { symbols: {}, ...((ctx.cursor as Cursor | null) ?? {}) }
  // Disconnect keeps the cursor, so a replacement key must not inherit the old key's check.
  const fingerprint = createHash('sha256').update(env('BINANCE_API_KEY') ?? '').digest('hex').slice(0, 16)
  if (cursor.verified !== fingerprint) {
    await assertReadOnly(ex)
    cursor.verified = fingerprint
  }
  const markets = await ex.loadMarkets()
  const now = Date.now()
  const prices = priceBook(ex, markets)

  // Balances snapshot (one per hour): Spot plus Funding (where P2P buys land), priced via */USDT.
  const bal = await ex.fetchBalance()
  const totals = { ...(bal.total as unknown as Record<string, number>) }
  await optional(ctx, 'Funding wallet', async () => {
    const funding = (await ex.fetchBalance({ type: 'funding' })).total as unknown as Record<string, number>
    for (const [a, q] of Object.entries(funding)) if (q > 0) totals[a] = (totals[a] ?? 0) + q
  })
  const held = Object.entries(totals).filter(([, q]) => q > 0)
  const priceable = (a: string) => (a.startsWith('LD') && markets[`${a.slice(2)}/USDT`] ? a.slice(2) : a) // Simple Earn "LDBTC"
  const symbols = [...new Set(held.map(([a]) => priceable(a)).filter((a) => !USD_STABLES.has(a) && markets[`${a}/USDT`]).map((a) => `${a}/USDT`))]
  const tickers = symbols.length ? await ex.fetchTickers(symbols) : {}
  const price = (a: string) => (USD_STABLES.has(a) ? 1 : tickers[`${priceable(a)}/USDT`]?.last ?? undefined)
  const assets = held.map(([asset, qty]) => ({ asset, qty, priceUsd: price(asset) }))
  for (const gone of (cursor.assets ?? []).filter((a) => !totals[a])) assets.push({ asset: gone, qty: 0, priceUsd: undefined })
  const totalUsd = assets.reduce((s, a) => s + a.qty * (a.priceUsd ?? 0), 0)
  // USDⓈ-M futures: margin balance (wallet + unrealized) and open positions.
  let futures: unknown = null
  let futuresReadable = false // no futures account or permission: don't ask for its income every sync
  await optional(ctx, 'Futures account', async () => {
    const a = (await ex.fapiPrivateV2GetAccount().catch((e: unknown) => {
      const problem = futuresProblem(e)
      throw problem ? new Error(problem) : e
    })) as { totalWalletBalance?: string; totalUnrealizedProfit?: string; totalMarginBalance?: string; totalMaintMargin?: string; positions?: Record<string, string>[] }
    // Mark and liquidation prices come from position risk. On cross margin the whole wallet backs a
    // position, so how close it is to liquidation can't be read from its own margin.
    const risk = (await ex.fapiPrivateV2GetPositionRisk()) as Record<string, string>[]
    const riskOf = (p: Record<string, string>) => risk.find((r) => r.symbol === p.symbol && r.positionSide === p.positionSide)
    const positions = (a.positions ?? []).filter((p) => Number(p.positionAmt) !== 0).map((p) => {
      const r = riskOf(p)
      return {
        symbol: p.symbol, size: Number(p.positionAmt), entry: Number(p.entryPrice), unrealized: Number(p.unrealizedProfit),
        leverage: Number(p.leverage), notional: Number(p.notional), margin: Number(p.initialMargin), side: Number(p.positionAmt) > 0 ? 'long' : 'short',
        mark: r ? Number(r.markPrice) : undefined, liquidation: r && Number(r.liquidationPrice) > 0 ? Number(r.liquidationPrice) : undefined,
        marginType: r?.marginType,
      }
    })
    const balance = Number(a.totalMarginBalance ?? 0)
    // Binance's margin ratio: liquidation starts at 100%.
    futuresReadable = true
    futures = { walletUsd: Number(a.totalWalletBalance ?? 0), unrealizedUsd: Number(a.totalUnrealizedProfit ?? 0), marginUsd: balance, marginRatio: balance > 0 ? Number(a.totalMaintMargin ?? 0) / balance : null, positions }
  })
  const at = new Date(now).toISOString()
  await ctx.emit({ source: 'binance', externalId: `balances:${at.slice(0, 13)}`, at: new Date(now), body: { type: 'balances', at, totalUsd, assets, futures } })
  cursor.assets = held.map(([a]) => a)

  if (!cursor.scanned) await scanSpot(ex, markets, ctx, cursor)
  await syncTrades(ex, markets, ctx, cursor, held.map(([a]) => priceable(a)))
  await optional(ctx, 'P2P', () => syncP2P(ex, ctx, cursor, now))
  await optional(ctx, 'Convert', () => syncConvert(ex, ctx, cursor, now))
  await optional(ctx, 'Deposits and withdrawals', () => syncFlows(ex, ctx, cursor, now, prices))
  if (futuresReadable) await optional(ctx, 'Futures income', () => syncFutures(ex, ctx, cursor, now, prices))
  await optional(ctx, 'Binance Pay', () => syncPay(ex, ctx, cursor, now, prices))
  await optional(ctx, 'Rewards', () => syncRewards(ex, ctx, cursor, now, prices))
  await optional(ctx, 'Card and UPI orders', () => syncFiat(ex, ctx, cursor, now))
  await optional(ctx, 'Small balance conversions', () => syncDust(ex, ctx, cursor, now, prices))
  ctx.setCursor(cursor)
}

async function optional(ctx: ConnectorCtx, what: string, fn: () => Promise<void>) {
  try { await fn() } catch (e) { ctx.log(`binance ${what} skipped: ${e instanceof Error ? e.message : e}`) }
}

/** USD price of an asset on a day (daily close against USDT), cached per run. Stablecoins are $1. */
function priceBook(ex: Client, markets: Record<string, unknown>) {
  const cache = new Map<string, number | null>()
  return async (asset: string, ms: number): Promise<number | null> => {
    const a = asset.toUpperCase()
    if (USD_STABLES.has(a)) return 1
    const day = Math.floor(ms / DAY) * DAY
    const key = `${a}:${day}`
    if (cache.has(key)) return cache.get(key)!
    let p: number | null = null
    try {
      if (markets[`${a}/USDT`]) p = (await ex.fetchOHLCV(`${a}/USDT`, '1d', day, 1))[0]?.[4] ?? null
    } catch (e) {
      if (e instanceof ccxt.NetworkError) throw e // not cached as "no price": a value stored once stays wrong; the next sync tries again
      /* delisted or no history: left unvalued */
    }
    cache.set(key, p)
    return p
  }
}

type Trade = { id?: string; symbol?: string; side?: string; amount?: number; price?: number; timestamp?: number; fee?: unknown; order?: string }

async function emitTrade(ctx: ConnectorCtx, cursor: Cursor, symbol: string, t: Trade) {
  await ctx.emit({
    source: 'binance', externalId: `trade:${symbol}:${t.id}`, at: new Date(t.timestamp!),
    body: { type: 'trade', id: t.id, symbol, side: t.side, amount: t.amount, price: t.price, timestamp: t.timestamp, fee: t.fee, order: t.order },
  })
  cursor.symbols![symbol] = Math.max(cursor.symbols![symbol] ?? 0, t.timestamp!)
}

/**
 * Once: check every spot pair against the common quotes, oldest trade first, so coins you bought and
 * sold completely (never held at a sync) are counted too. Delisted pairs that refuse are skipped.
 */
async function scanSpot(ex: Client, markets: Record<string, unknown>, ctx: ConnectorCtx, cursor: Cursor) {
  const pairs = Object.entries(markets).filter(([, m]) => { const x = m as { spot?: boolean; quote?: string }; return x.spot && SCAN_QUOTES.includes(x.quote ?? '') }).map(([s]) => s).sort()
  const start = cursor.scanIndex ?? 0
  ctx.log(`binance: checking ${pairs.length - start} of ${pairs.length} spot pairs for past trades (first sync only)`)
  let found = 0
  for (let i = start; i < pairs.length; i++) {
    const symbol = pairs[i]
    try {
      found += await tradesFromId(ex, symbol, 0, (t) => emitTrade(ctx, cursor, symbol, t))
    } catch (e) {
      // A pair Binance refuses (delisted) is skipped. A key problem stops the sync. An outage or rate limit pauses
      // the scan here (marking it done would leave that pair's trades out for good); the rest of the sync still
      // runs, and the next one resumes at this pair.
      if (e instanceof ccxt.AuthenticationError || e instanceof ccxt.PermissionDenied || keyProblem(e)) throw e
      if (e instanceof ccxt.NetworkError) {
        ctx.log(`binance: spot scan paused at ${symbol} (${i}/${pairs.length}): ${e.message}`)
        return
      }
    }
    cursor.scanIndex = i + 1
  }
  ctx.log(`binance: ${found} spot trades across ${Object.keys(cursor.symbols ?? {}).length} pairs`)
  cursor.scanned = true
}

/** Every trade of a pair from a trade id on, 1000 at a time. */
async function tradesFromId(ex: Client, symbol: string, fromId: number, each: (t: Trade) => Promise<void>) {
  let n = 0
  for (;;) {
    const page = (await ex.fetchMyTrades(symbol, undefined, 1000, { fromId })) as Trade[]
    for (const t of page) await each(t)
    n += page.length
    if (page.length < 1000) return n
    fromId = Number(page.at(-1)!.id) + 1
  }
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
    const each = (t: Trade) => emitTrade(ctx, cursor, symbol, t)
    if (!last) { await tradesFromId(ex, symbol, 0, each); continue } // never seen: the whole history, not just the latest 1000
    // From the newest trade already read (it comes again; repeats are dropped by id, and a second fill in the same
    // millisecond isn't skipped). Forward, 1000 at a time, so a long gap leaves no hole.
    let from = last
    for (;;) {
      const page = (await ex.fetchMyTrades(symbol, from, 1000)) as Trade[]
      for (const t of page) await each(t)
      const newest = page.at(-1)?.timestamp
      if (page.length < 1000 || newest == null) break
      if (newest <= from) { await tradesFromId(ex, symbol, Number(page.at(-1)!.id) + 1, each); break } // 1000 fills in one millisecond
      from = newest
    }
  }
}

type P2POrder = { orderNumber: string; orderStatus: string; createTime: number; [k: string]: unknown }

async function syncP2P(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number) {
  // The first time from the start of P2P, then 2 days back each time (orders complete after they're created).
  // The endpoint wants windows of at most 30 days.
  const from = cursor.p2pFull ? Math.max((cursor.p2pFrom ?? now) - 2 * DAY, now - 365 * DAY) : Date.parse('2020-06-10')
  for (let start = from; start < now; start += 30 * DAY) {
    const end = Math.min(now, start + 30 * DAY)
    for (const tradeType of ['BUY', 'SELL']) {
      for (let page = 1; page <= 20; page++) {
        // Windows older than Binance keeps are refused; those are skipped, not the whole read.
        const r = await window(() => ex.sapiGetC2cOrderMatchListUserOrderHistory({ tradeType, startTimestamp: start, endTimestamp: end, page, rows: 100 })) as { data?: P2POrder[] } | null
        const rows = r?.data ?? []
        for (const o of rows.filter((x) => x.orderStatus === 'COMPLETED')) {
          await ctx.emit({ source: 'binance', externalId: `p2p:${o.orderNumber}`, at: new Date(Number(o.createTime)), body: { type: 'p2p', ...o } })
        }
        if (rows.length < 100) break
      }
    }
  }
  cursor.p2pFrom = now
  cursor.p2pFull = true
}

async function syncConvert(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number) {
  // Windows of at most 30 days; the first time from 2021.
  const from = cursor.convertFull ? Math.max((cursor.convertFrom ?? now) - DAY, now - 365 * DAY) : Date.parse('2021-01-01')
  for (let start = from; start < now; start += 30 * DAY) {
    const end = Math.min(now, start + 30 * DAY)
    const rows = await windowRows(start, end, 1000, async (a, b) => ((await window(() => ex.sapiGetConvertTradeFlow({ startTime: a, endTime: b, limit: 1000 }))) as { list?: { orderId: string | number; orderStatus: string; createTime: number }[] } | null)?.list ?? null)
    for (const o of rows.filter((x) => x.orderStatus === 'SUCCESS')) {
      await ctx.emit({ source: 'binance', externalId: `convert:${o.orderId}`, at: new Date(Number(o.createTime)), body: { type: 'convert', ...o } })
    }
  }
  cursor.convertFrom = now
  cursor.convertFull = true
}

type Price = (asset: string, ms: number) => Promise<number | null>

/** Crypto deposits (credited) and withdrawals (completed), valued in USD on the day. 90-day windows. */
async function syncFlows(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number, price: Price) {
  const from = cursor.flowsFrom ? cursor.flowsFrom - 3 * DAY : START
  for (let start = from; start < now; start += 89 * DAY) {
    const end = Math.min(now, start + 89 * DAY)
    const deps = await windowRows(start, end, 1000, async (a, b) => (await ex.sapiGetCapitalDepositHisrec({ startTime: a, endTime: b, limit: 1000 })) as Record<string, string | number>[])
    for (const d of deps.filter((x) => Number(x.status) === 1 || Number(x.status) === 6)) {
      const at = Number(d.insertTime)
      const p = await price(String(d.coin), at)
      await ctx.emit({
        source: 'binance', externalId: `deposit:${d.id ?? d.txId}`, at: new Date(at),
        body: { type: 'deposit', coin: d.coin, amount: Number(d.amount), network: d.network, at, usd: p == null ? null : p * Number(d.amount) },
      })
    }
    const wds = await windowRows(start, end, 1000, async (a, b) => (await ex.sapiGetCapitalWithdrawHistory({ startTime: a, endTime: b, limit: 1000 })) as Record<string, string | number>[])
    for (const w of wds.filter((x) => Number(x.status) === 6)) {
      const at = Date.parse(`${String(w.completeTime ?? w.applyTime).replace(' ', 'T')}Z`)
      const amount = Number(w.amount) + Number(w.transactionFee ?? 0) // what left the account, fee included
      const p = await price(String(w.coin), at)
      await ctx.emit({
        source: 'binance', externalId: `withdrawal:${w.id}`, at: new Date(at),
        body: { type: 'withdrawal', coin: w.coin, amount, fee: Number(w.transactionFee ?? 0), network: w.network, at, usd: p == null ? null : p * amount },
      })
    }
  }
  cursor.flowsFrom = now
}

type Income = { time: number; incomeType: string; income: number; asset: string; symbol: string | null; tranId: string }

async function emitIncome(ctx: ConnectorCtx, price: Price, r: Income) {
  const p = await price(r.asset, r.time)
  await ctx.emit({
    // Same id from the download and the API, so the overlap isn't counted twice.
    source: 'binance', externalId: `futures:${r.tranId}:${r.incomeType}:${r.symbol ?? ''}`, at: new Date(r.time),
    body: { type: 'futures-income', incomeType: r.incomeType, asset: r.asset, amount: r.income, symbol: r.symbol, at: r.time, usd: p == null ? null : p * r.income },
  })
}

/**
 * USDⓈ-M futures income: realized P&L, funding, fees, transfers. The API only reaches back a few months,
 * so the first sync also asks Binance for a yearly download of everything older (a zipped CSV).
 * The API answers a too-wide range with only the last 7 days, so it's read in 90-day windows.
 */
async function syncFutures(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number, price: Price) {
  if (!cursor.futuresFull) {
    const anchor = (cursor.futuresAnchor ??= now)
    // ponytail: three yearly files (Binance limits how many downloads you can ask for); older accounts need more.
    for (let y = 3 - (cursor.futuresYears ?? 0); y >= 1; y--) {
      let rows: Income[] = []
      try { rows = await downloadIncome(ex, anchor - y * 365 * DAY, anchor - (y - 1) * 365 * DAY - 1) } catch (e) {
        // Each file counts against Binance's monthly download quota, so a file that keeps failing is given up on
        // after three runs (an account younger than that has nothing to give). Outages and key problems just wait.
        if (e instanceof ccxt.NetworkError || keyProblem(e) || (cursor.futuresTries = (cursor.futuresTries ?? 0) + 1) < 3) throw e
        ctx.log(`binance: no futures file for year ${4 - y} of 3 (${e instanceof Error ? e.message : e})`)
      }
      for (const r of rows) await emitIncome(ctx, price, r)
      ctx.log(`binance: ${rows.length} older futures entries from year ${4 - y} of 3`)
      cursor.futuresYears = 4 - y
      cursor.futuresTries = 0
    }
    cursor.futuresFull = true
    cursor.futuresFrom = anchor - 30 * DAY // the newest days come from the API below
  }
  for (let from = cursor.futuresFrom ?? now - 90 * DAY; from < now; from += 90 * DAY) {
    const to = Math.min(now, from + 90 * DAY)
    let start = from
    for (let guard = 0; guard < 200; guard++) {
      const rows = (await ex.fapiPrivateGetIncome({ startTime: start, endTime: to, limit: 1000 })) as Record<string, string | number>[]
      for (const r of rows) await emitIncome(ctx, price, { time: Number(r.time), incomeType: String(r.incomeType), income: Number(r.income), asset: String(r.asset), symbol: r.symbol ? String(r.symbol) : null, tranId: String(r.tranId) })
      if (rows.length < 1000) break
      start = Number(rows.at(-1)!.time) // re-reads the last millisecond; repeats are dropped by id
    }
  }
  cursor.futuresFrom = now - DAY
}

/** Ask Binance to prepare a futures income file for a range (at most a year), wait for it, read it. */
async function downloadIncome(ex: Client, start: number, end: number): Promise<Income[]> {
  const { downloadId } = (await ex.fapiPrivateGetIncomeAsyn({ startTime: start, endTime: end })) as { downloadId: string }
  for (let i = 0; i < 60; i++) {
    await sleep(5000)
    const s = (await ex.fapiPrivateGetIncomeAsynId({ downloadId })) as { status: string; url?: string }
    if (s.status !== 'completed' || !s.url) continue
    const file = await fetch(s.url, { signal: AbortSignal.timeout(60_000) })
    if (!file.ok) throw new Error(`Binance futures file HTTP ${file.status}`)
    const zip = Buffer.from(await file.arrayBuffer())
    return parseIncomeCsv(unzipFirst(zip).toString('utf8'))
  }
  throw new Error('Binance took too long to prepare the futures history file')
}

/** The first file in a zip, via its central directory. Enough for Binance's one-file downloads. */
export function unzipFirst(buf: Buffer): Buffer {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('not a zip file')
  const cd = buf.readUInt32LE(eocd + 16)
  const method = buf.readUInt16LE(cd + 10)
  const size = buf.readUInt32LE(cd + 20)
  const local = buf.readUInt32LE(cd + 42)
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
  const data = buf.subarray(start, start + size)
  return method === 0 ? data : inflateRawSync(data)
}

/** "Date(UTC)","type","Amount","Asset","Symbol","Transaction ID" → income rows. */
export function parseIncomeCsv(csv: string): Income[] {
  return csv.replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).filter((l) => l.trim()).map((l) => {
    const [date, type, amount, asset, symbol, tranId] = l.split(',').map((x) => x.trim().replace(/^"|"$/g, ''))
    return { time: Date.parse(`${date.replace(' ', 'T')}Z`), incomeType: type, income: Number(amount), asset, symbol: symbol || null, tranId }
  }).filter((r) => r.tranId && Number.isFinite(r.time) && Number.isFinite(r.income))
}

/**
 * Binance Pay: sending to or receiving from other Binance users. Not in withdrawal history, so without it
 * money paid out to people looks lost. 89-day windows back until Binance stops answering (about 18 months).
 */
async function syncPay(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number, price: Price) {
  const oldest = cursor.payFrom ? cursor.payFrom - 3 * DAY : now - 2 * 365 * DAY
  for (let end = now; end > oldest; end -= 89 * DAY) {
    const start = Math.max(oldest, end - 89 * DAY)
    let refused = false
    const rows = await windowRows(start, end, 100, async (a, b) => {
      const r = await window(() => ex.sapiGetPayTransactions({ startTime: a, endTime: b, limit: 100 })) as { data?: Record<string, string | number>[] } | null
      if (!r) refused = true
      return r?.data ?? null
    })
    if (refused) break // older than Binance keeps
    for (const t of rows) {
      const at = Number(t.transactionTime)
      const amount = Number(t.amount)
      const p = await price(String(t.currency), at)
      await ctx.emit({
        source: 'binance', externalId: `pay:${t.transactionId}`, at: new Date(at),
        body: { type: amount < 0 ? 'withdrawal' : 'deposit', coin: t.currency, amount: Math.abs(amount), via: 'pay', orderType: t.orderType, at, usd: p == null ? null : p * Math.abs(amount) },
      })
    }
  }
  cursor.payFrom = now
}

/**
 * Airdrops, Launchpool and other rewards Binance paid into the account. Without them, selling a coin you
 * were given looks like selling coins you never had. 90-day windows; the first time from 2019.
 */
async function syncRewards(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number, price: Price) {
  for (let start = cursor.rewardsFrom ? cursor.rewardsFrom - 3 * DAY : START; start < now; start += 90 * DAY) {
    const end = Math.min(now, start + 90 * DAY)
    const rows = await windowRows(start, end, 500, async (a, b) => ((await ex.sapiGetAssetAssetDividend({ startTime: a, endTime: b, limit: 500 })) as { rows?: Record<string, string | number>[] }).rows ?? [])
    for (const d of rows) {
      const at = Number(d.divTime)
      const amount = Number(d.amount)
      const p = await price(String(d.asset), at)
      await ctx.emit({
        source: 'binance', externalId: `reward:${d.tranId ?? d.id}`, at: new Date(at),
        body: { type: 'reward', coin: d.asset, amount, info: d.enInfo, at, usd: p == null ? null : p * amount },
      })
    }
  }
  cursor.rewardsFrom = now
}

/** Crypto bought or sold with rupees by card, UPI or bank (Binance "Buy/Sell Crypto"), completed only. */
async function syncFiat(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number) {
  const begin = cursor.fiatFrom ? cursor.fiatFrom - 3 * DAY : START
  for (const transactionType of [0, 1]) { // 0 buy, 1 sell
    for (let page = 1; page <= 50; page++) {
      const r = (await ex.sapiGetFiatPayments({ transactionType, beginTime: begin, endTime: now, page, rows: 500 })) as { data?: Record<string, string | number>[] }
      const rows = r.data ?? []
      for (const o of rows.filter((x) => x.status === 'Completed')) {
        await ctx.emit({ source: 'binance', externalId: `fiat:${o.orderNo}`, at: new Date(Number(o.createTime)), body: { type: 'fiat', side: transactionType === 0 ? 'buy' : 'sell', ...o } })
      }
      if (rows.length < 500) break
    }
  }
  cursor.fiatFrom = now
}

/** "Convert small balances to BNB": each coin converted is a sale, valued in dollars on the day. */
async function syncDust(ex: Client, ctx: ConnectorCtx, cursor: Cursor, now: number, price: Price) {
  const r = (await ex.sapiGetAssetDribblet({ startTime: cursor.dustFrom ? cursor.dustFrom - 3 * DAY : START, endTime: now })) as { userAssetDribblets?: { userAssetDribbletDetails?: Record<string, string | number>[] }[] }
  for (const d of r.userAssetDribblets ?? []) {
    for (const x of d.userAssetDribbletDetails ?? []) {
      const at = Number(x.operateTime)
      const bnb = await price('BNB', at)
      await ctx.emit({
        source: 'binance', externalId: `dust:${x.transId}:${x.fromAsset}`, at: new Date(at),
        body: { type: 'dust', fromAsset: x.fromAsset, amount: Number(x.amount), bnb: Number(x.transferedAmount), fee: Number(x.serviceChargeAmount), at, usd: bnb == null ? null : bnb * Number(x.transferedAmount) },
      })
    }
  }
  cursor.dustFrom = now
}
