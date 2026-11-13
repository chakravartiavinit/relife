import { daysBetween } from '@/core/time'
import { round2 } from './statement'

// De-duplication of a bank row against an app order: the same payment seen twice. Pure and deterministic.

export type LinkRow = { id: string; localDate: string; amount: number; currency: string; description: string; rejected?: string[] }
export type LinkOrder = { id: string; localDate: string; amount: number; currency: string; platform?: string | null }
export type Link = { rowId: string; orderId: string }

/**
 * Pairs a statement row with an app order when the currency and `round2(amount)` match, both are money out (credits
 * and refunds never link), the dates are at most `maxDays` apart and the pair isn't in the row's `rejected` list.
 * Lower score wins: the day gap, minus 0.5 when the description holds the order's platform name. Ties go to the bank
 * date on or after the order date, then to the ids. Greedy and one-to-one.
 */
export function matchStatementRows(rows: LinkRow[], orders: LinkOrder[], opts: { maxDays?: number } = {}): Link[] {
  const maxDays = opts.maxDays ?? 2
  type Cand = { row: LinkRow; order: LinkOrder; score: number; after: number }
  const cands: Cand[] = []
  for (const row of rows) {
    if (row.amount >= 0) continue
    for (const order of orders) {
      if (order.amount >= 0 || order.currency !== row.currency) continue
      if (round2(order.amount) !== round2(row.amount)) continue
      if (row.rejected?.includes(order.id)) continue
      const gap = daysBetween(order.localDate, row.localDate)
      if (Math.abs(gap) > maxDays) continue
      const named = !!order.platform && row.description.toLowerCase().includes(order.platform.toLowerCase())
      cands.push({ row, order, score: Math.abs(gap) - (named ? 0.5 : 0), after: gap >= 0 ? 0 : 1 })
    }
  }
  cands.sort((a, b) => a.score - b.score || a.after - b.after || cmp(a.row.id, b.row.id) || cmp(a.order.id, b.order.id))
  const usedRows = new Set<string>()
  const usedOrders = new Set<string>()
  const out: Link[] = []
  for (const c of cands) {
    if (usedRows.has(c.row.id) || usedOrders.has(c.order.id)) continue
    usedRows.add(c.row.id); usedOrders.add(c.order.id)
    out.push({ rowId: c.row.id, orderId: c.order.id })
  }
  return out
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
