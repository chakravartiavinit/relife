import type { AccountRef, FlowKind, Parser, Rec } from '@/core/types'
import { asObj } from './util'

export const BINANCE: AccountRef = { key: 'binance', kind: 'exchange', name: 'Binance', institution: 'Binance', currency: 'USD' }
export const BINANCE_FUTURES: AccountRef = { key: 'binance:futures', kind: 'exchange', name: 'Binance Futures', institution: 'Binance', currency: 'USD' }

const FLOW: Record<string, FlowKind> = { REALIZED_PNL: 'futures_pnl', FUNDING_FEE: 'funding', COMMISSION: 'commission', COMMISSION_REBATE: 'commission', TRANSFER: 'transfer', INTERNAL_TRANSFER: 'transfer' }

const QUOTES = ['FDUSD', 'USDT', 'USDC', 'BUSD', 'TUSD', 'DAI', 'BTC', 'ETH', 'BNB', 'INR', 'EUR', 'GBP', 'TRY', 'BRL', 'AUD', 'JPY']
const STABLE_OR_FIAT = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'DAI', 'INR', 'USD', 'EUR', 'GBP'])

/** "BTCUSDT" → "BTC/USDT". Already-split symbols pass through. */
export function splitPair(pair: string): string {
  const p = pair.toUpperCase().replace(/[^A-Z0-9/]/g, '')
  if (p.includes('/')) return p
  const q = QUOTES.find((x) => p.endsWith(x) && p.length > x.length)
  return q ? `${p.slice(0, -q.length)}/${q}` : p
}

const n = (v: unknown) => Number(String(v ?? '').replace(/,/g, '')) || 0
const asset = (v: unknown) => /[A-Z]+$/.exec(String(v ?? '').toUpperCase())?.[0]

type Ccxt = { id: string; symbol: string; side: 'buy' | 'sell'; amount: number; price: number; timestamp: number; fee?: { cost?: number; currency?: string } }

/** Raw events from the Binance connector (API) and from CSV exports (scripts/binance-import.ts). */
export const binance: Parser = {
  id: 'binance',
  match: (e) => e.source === 'binance' || e.source === 'binance.csv',
  parse: (e) => {
    const b = asObj(e)
    if (e.source === 'binance.csv') return csvRow(b, e.externalId)

    switch (b.type) {
      case 'balances': {
        const at = new Date(String(b.at ?? e.at.toISOString()))
        const assets = (b.assets as { asset: string; qty: number; priceUsd?: number }[]) ?? []
        const recs: Rec[] = assets.map((a) => ({ kind: 'holding', account: BINANCE, asset: a.asset, qty: a.qty, priceUsd: a.priceUsd, at }))
        recs.push({ kind: 'balance', account: BINANCE, amount: n(b.totalUsd), at })
        // Futures: the margin balance (wallet + open P&L) counts as USDT held; positions go on the account.
        const f = b.futures as { marginUsd: number; walletUsd: number; unrealizedUsd: number; marginRatio?: number | null; positions: unknown[] } | null | undefined
        if (f) {
          recs.push({ kind: 'holding', account: BINANCE_FUTURES, asset: 'USDT', qty: f.marginUsd, priceUsd: 1, at })
          recs.push({ kind: 'balance', account: BINANCE_FUTURES, amount: f.marginUsd, at, meta: { walletUsd: f.walletUsd, unrealizedUsd: f.unrealizedUsd, marginRatio: f.marginRatio ?? null, positions: f.positions, at: at.toISOString() } })
        }
        return recs
      }
      case 'trade': {
        const t = b as unknown as Ccxt
        return [{
          kind: 'trade', account: BINANCE, at: new Date(t.timestamp), symbol: t.symbol, side: t.side,
          qty: t.amount, price: t.price, fee: t.fee?.cost ?? 0, feeAsset: t.fee?.currency, tradeKind: 'spot',
          source: 'binance', externalRef: `trade:${t.symbol}:${t.id}`,
        }]
      }
      case 'p2p': {
        if (b.orderStatus !== 'COMPLETED') return []
        return [{
          kind: 'trade', account: BINANCE, at: new Date(n(b.createTime)), symbol: `${b.asset}/${b.fiat}`,
          side: b.tradeType === 'SELL' ? 'sell' : 'buy', qty: n(b.amount), price: n(b.unitPrice),
          fee: n(b.commission), feeAsset: String(b.asset), tradeKind: 'p2p',
          source: 'binance', externalRef: `p2p:${b.orderNumber}`, meta: { totalPrice: n(b.totalPrice), counterparty: b.counterPartNickName },
        }]
      }
      case 'convert': {
        if (b.orderStatus !== 'SUCCESS') return []
        const from = String(b.fromAsset)
        const to = String(b.toAsset)
        const fromAmt = n(b.fromAmount)
        const toAmt = n(b.toAmount)
        // Selling into a stable/fiat is a sell of fromAsset; otherwise a buy of toAsset paid in fromAsset.
        const sell = STABLE_OR_FIAT.has(to) && !STABLE_OR_FIAT.has(from)
        return [{
          kind: 'trade', account: BINANCE, at: new Date(n(b.createTime)),
          symbol: sell ? `${from}/${to}` : `${to}/${from}`, side: sell ? 'sell' : 'buy',
          qty: sell ? fromAmt : toAmt, price: sell ? toAmt / fromAmt : fromAmt / toAmt, fee: 0,
          tradeKind: 'convert', source: 'binance', externalRef: `convert:${b.orderId}`,
        }]
      }
      case 'deposit':
      case 'withdrawal': {
        const sign = b.type === 'deposit' ? 1 : -1
        const usd = b.usd == null ? undefined : sign * n(b.usd)
        return [{
          kind: 'flow', account: BINANCE, at: new Date(n(b.at)), flow: b.type, asset: String(b.coin), amount: sign * n(b.amount), usd,
          source: 'binance', externalRef: e.externalId, meta: { network: b.network, ...(b.fee ? { fee: n(b.fee) } : {}), ...(b.via ? { via: b.via } : {}) },
        }]
      }
      case 'fiat': {
        // Card or UPI: rupees for USDT (or back). Money in or out, like P2P.
        const crypto = String(b.cryptoCurrency), fiat = String(b.fiatCurrency)
        const qty = n(b.obtainAmount), total = n(b.sourceAmount)
        if (!qty) return []
        return [{
          kind: 'trade', account: BINANCE, at: new Date(n(b.createTime)), symbol: `${crypto}/${fiat}`, side: b.side === 'sell' ? 'sell' : 'buy',
          qty, price: total / qty, fee: n(b.totalFee), feeAsset: fiat, tradeKind: 'fiat',
          source: 'binance', externalRef: e.externalId, meta: { totalPrice: total, method: b.paymentMethod },
        }]
      }
      case 'dust': {
        // Small balance → BNB: a sale of the small coin, valued in dollars that day (meta.usd).
        if (!n(b.amount) || b.fromAsset === 'BNB') return [] // BNB to BNB isn't a sale
        return [{
          kind: 'trade', account: BINANCE, at: new Date(n(b.at)), symbol: `${b.fromAsset}/BNB`, side: 'sell',
          qty: n(b.amount), price: n(b.bnb) / n(b.amount), fee: n(b.fee), feeAsset: 'BNB', tradeKind: 'dust',
          source: 'binance', externalRef: e.externalId, meta: b.usd == null ? {} : { usd: n(b.usd) },
        }]
      }
      case 'reward': {
        return [{
          kind: 'flow', account: BINANCE, at: new Date(n(b.at)), flow: 'reward', asset: String(b.coin), amount: n(b.amount),
          usd: b.usd == null ? undefined : n(b.usd), source: 'binance', externalRef: e.externalId, meta: { info: b.info },
        }]
      }
      case 'futures-income': {
        return [{
          kind: 'flow', account: BINANCE_FUTURES, at: new Date(n(b.at)), flow: FLOW[String(b.incomeType)] ?? 'other', asset: String(b.asset),
          amount: n(b.amount), usd: b.usd == null ? undefined : n(b.usd), symbol: b.symbol ? String(b.symbol) : undefined,
          source: 'binance', externalRef: e.externalId, meta: { incomeType: b.incomeType },
        }]
      }
      default:
        return []
    }
  },
}

// Two export layouts are common:
//   Date(UTC), Pair, Side, Price, Executed, Amount, Fee         (amounts carry the asset: "0.001BTC")
//   Date(UTC), Market, Type, Price, Amount, Total, Fee, Fee Coin
function csvRow(r: Record<string, unknown>, ref: string): Rec[] {
  const pair = String(r['Pair'] ?? r['Market'] ?? '')
  const side = String(r['Side'] ?? r['Type'] ?? '').toLowerCase()
  const date = String(r['Date(UTC)'] ?? r['Date'] ?? '')
  if (!pair || (side !== 'buy' && side !== 'sell') || !date) return []
  const at = new Date(/Z|[+-]\d\d:?\d\d$/.test(date) ? date : `${date.replace(' ', 'T')}Z`)
  const qty = n(String(r['Executed'] ?? r['Amount']).replace(/[A-Z]+$/i, ''))
  const fee = String(r['Fee'] ?? '')
  return [{
    kind: 'trade', account: BINANCE, at, symbol: splitPair(pair), side, qty, price: n(r['Price']),
    fee: n(fee.replace(/[A-Z]+$/i, '')), feeAsset: String(r['Fee Coin'] ?? asset(fee) ?? '') || undefined,
    tradeKind: 'spot', source: 'binance', externalRef: `csv:${ref}`,
  }]
}

/**
 * Binance's Transaction History statement (Wallet → Transaction History → Export) lists a trade as separate
 * lines at the same second: the coin bought or sold, the coin spent or received, and the fee. This puts
 * them back together. Only spot buys and sells; deposits, P2P and the rest come from the API.
 * Columns: User_ID, UTC_Time, Account, Operation, Coin, Change, Remark.
 */
export function tradesFromStatement(rows: Record<string, string>[]) {
  const STABLE_QUOTE = /^(USDT|FDUSD|USDC|BUSD|TUSD|DAI)$/
  const groups = new Map<string, Record<string, string>[]>()
  for (const r of rows) {
    if ((r.Account ?? 'Spot') !== 'Spot' || !/^(Transaction (Buy|Spend|Sold|Revenue|Fee)|Buy|Sell|Fee)$/.test(r.Operation ?? '')) continue
    const g = groups.get(r.UTC_Time) ?? []
    g.push(r)
    groups.set(r.UTC_Time, g)
  }
  const out: { at: Date; base: string; quote: string; side: 'buy' | 'sell'; qty: number; price: number; fee: number; feeAsset?: string }[] = []
  let skipped = 0
  for (const [time, g] of groups) {
    const sum = new Map<string, number>()
    let fee = 0, feeAsset: string | undefined
    for (const r of g) {
      const change = Number(r.Change)
      if (/Fee$/.test(r.Operation)) { fee += Math.abs(change); feeAsset = r.Coin; continue }
      sum.set(r.Coin, (sum.get(r.Coin) ?? 0) + change)
    }
    // One coin goes up and one goes down. The stablecoin side is the quote.
    const up = [...sum].filter(([, v]) => v > 0), down = [...sum].filter(([, v]) => v < 0)
    if (up.length !== 1 || down.length !== 1) { skipped++; continue }
    const [[inCoin, inQty]] = up, [[outCoin, outQty]] = down
    const buy = STABLE_QUOTE.test(outCoin) || !STABLE_QUOTE.test(inCoin)
    const [base, quote, qty, total] = buy ? [inCoin, outCoin, inQty, -outQty] : [outCoin, inCoin, -outQty, inQty]
    out.push({ at: new Date(`${time.replace(' ', 'T')}Z`), base, quote, side: buy ? 'buy' : 'sell', qty, price: total / qty, fee, feeAsset })
  }
  return { trades: out, skipped }
}
