// FIFO cost basis. Pure function: callers convert prices into one valuation currency first.

export type Fill = {
  at: Date
  asset: string
  /** 'in' and 'out' move coins without trading: a deposit adds a lot at that day's price, a withdrawal removes lots with no gain. */
  side: 'buy' | 'sell' | 'in' | 'out'
  qty: number
  unitPrice: number // in valuation currency
  fee: number // in valuation currency
}

export type Realized = { at: Date; asset: string; qty: number; proceeds: number; cost: number; gain: number }
export type Lot = { qty: number; unitCost: number; at: Date }

export type PnL = {
  realized: Realized[]
  open: Record<string, Lot[]>
  /** movedGain: what withdrawn coins were worth when they left, minus what they cost. */
  totals: { realizedGain: number; gains: number; losses: number; fees: number; movedGain: number }
  /** Sold more than history explains, per asset. That part is counted at break-even, not as pure profit. */
  unmatched: { asset: string; qty: number; soldQty: number; soldValue: number }[]
}

export function fifo(fills: Fill[]): PnL {
  const open: Record<string, Lot[]> = {}
  const realized: Realized[] = []
  const missing = new Map<string, { qty: number; soldQty: number; soldValue: number }>()
  const miss = (a: string) => missing.get(a) ?? (missing.set(a, { qty: 0, soldQty: 0, soldValue: 0 }), missing.get(a)!)
  let movedGain = 0
  let fees = 0

  for (const f of [...fills].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    fees += f.fee
    const lots = (open[f.asset] ??= [])
    if (f.side === 'buy' || f.side === 'in') {
      // Buy fees are part of the cost basis; a deposit costs what the coins were worth that day.
      lots.push({ qty: f.qty, unitCost: (f.qty * f.unitPrice + f.fee) / f.qty, at: f.at })
      continue
    }
    let remaining = f.qty
    let cost = 0
    while (remaining > 1e-12 && lots.length) {
      const lot = lots[0]
      const take = Math.min(lot.qty, remaining)
      cost += take * lot.unitCost
      lot.qty -= take
      remaining -= take
      if (lot.qty <= 1e-12) lots.shift()
    }
    if (f.side === 'out') { // moved elsewhere, not sold
      movedGain += (f.qty - remaining) * f.unitPrice - cost
      if (remaining > 1e-9) miss(f.asset).qty += remaining
      continue
    }
    const proceeds = f.qty * f.unitPrice - f.fee
    if (remaining > 1e-12) {
      const m = miss(f.asset)
      m.qty += remaining
      m.soldQty += remaining
      m.soldValue += (remaining / f.qty) * proceeds
      cost += (remaining / f.qty) * proceeds // unknown cost: break-even rather than a made-up gain
    }
    realized.push({ at: f.at, asset: f.asset, qty: f.qty, proceeds, cost, gain: proceeds - cost })
  }

  const gains = realized.reduce((s, r) => s + Math.max(r.gain, 0), 0)
  const losses = realized.reduce((s, r) => s + Math.min(r.gain, 0), 0)
  const unmatched = [...missing].map(([asset, m]) => ({ asset, ...m }))
  return { realized, open, totals: { realizedGain: gains + losses, gains, losses, fees, movedGain }, unmatched }
}

export type Movement = { kind: 'in' | 'out'; usd: number | null }

/**
 * All-time result of an exchange account: what it's worth now, plus everything taken out, minus
 * everything put in. Catches what trade-by-trade P&L misses (earn rewards, airdrops, dust, fees in BNB).
 * Movements with no known value are counted, not guessed.
 */
export function allTimePnl(valueUsd: number, moves: Movement[]) {
  let invested = 0, withdrawn = 0, unvalued = 0
  for (const m of moves) {
    if (m.usd == null) { unvalued++; continue }
    if (m.kind === 'in') invested += Math.abs(m.usd)
    else withdrawn += Math.abs(m.usd)
  }
  const pnl = valueUsd + withdrawn - invested
  const netIn = invested - withdrawn
  return { pnl, invested, withdrawn, netIn, pct: netIn > 0 ? pnl / netIn : null, unvalued }
}
