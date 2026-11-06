// FIFO cost basis. Pure function: callers convert prices into one valuation currency first.

export type Fill = {
  at: Date
  asset: string
  side: 'buy' | 'sell'
  qty: number
  unitPrice: number // in valuation currency
  fee: number // in valuation currency
}

export type Realized = { at: Date; asset: string; qty: number; proceeds: number; cost: number; gain: number }
export type Lot = { qty: number; unitCost: number; at: Date }

export type PnL = {
  realized: Realized[]
  open: Record<string, Lot[]>
  totals: { realizedGain: number; gains: number; losses: number; fees: number }
  /** Sells larger than known buys (history incomplete). Cost basis treated as 0. */
  unmatched: { asset: string; qty: number }[]
}

export function fifo(fills: Fill[]): PnL {
  const open: Record<string, Lot[]> = {}
  const realized: Realized[] = []
  const unmatched: PnL['unmatched'] = []
  let fees = 0

  for (const f of [...fills].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    fees += f.fee
    const lots = (open[f.asset] ??= [])
    if (f.side === 'buy') {
      // Buy fees are part of the cost basis.
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
    if (remaining > 1e-12) unmatched.push({ asset: f.asset, qty: remaining })
    const proceeds = f.qty * f.unitPrice - f.fee
    realized.push({ at: f.at, asset: f.asset, qty: f.qty, proceeds, cost, gain: proceeds - cost })
  }

  const gains = realized.reduce((s, r) => s + Math.max(r.gain, 0), 0)
  const losses = realized.reduce((s, r) => s + Math.min(r.gain, 0), 0)
  return { realized, open, totals: { realizedGain: gains + losses, gains, losses, fees }, unmatched }
}

/**
 * India VDA tax (Sec 115BBH): flat 30% on each profitable transfer; losses cannot be set off
 * or carried forward. Plus 4% cess. TDS (Sec 194S, 1%) is shown separately as an estimate.
 * ponytail: per-transfer gains, no surcharge slabs; check with a CA before filing.
 */
export function indiaCryptoTax(realized: Realized[]) {
  const taxableGains = realized.reduce((s, r) => s + Math.max(r.gain, 0), 0)
  const tax = taxableGains * 0.3 * 1.04
  const sellValue = realized.reduce((s, r) => s + r.proceeds, 0)
  return { taxableGains, tax, tdsEstimate: sellValue * 0.01 }
}

/** Indian financial year (Apr–Mar) label for a date, e.g. "FY 2026-27". */
export function financialYear(d: Date): string {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
  return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`
}
