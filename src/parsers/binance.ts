import type { AccountRef, Parser, Rec } from '@/core/types'
import { asObj } from './util'

export const BINANCE: AccountRef = { key: 'binance', kind: 'exchange', name: 'Binance', institution: 'Binance', currency: 'USD' }

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
