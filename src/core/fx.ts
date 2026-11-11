import { and, desc, eq, lte } from 'drizzle-orm'
import { db, schema } from '@/db'
import { USD_STABLES } from '@/domain/money'

// Rates are stored as "units of quote per 1 USD" per day (fetched by the `fx` connector).

// Kept for an hour: the web and the worker are long-running, and today's rate lands when the fx sync runs.
const memo = new Map<string, { rate: number | null; at: number }>()
const MEMO_MS = 60 * 60_000

async function usdRate(quote: string, day: string): Promise<number | null> {
  const q = quote.toUpperCase()
  if (USD_STABLES.has(q)) return 1
  const k = `${q}|${day}`
  const hit = memo.get(k)
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.rate
  const [row] = await db.select().from(schema.fxRates)
    .where(and(eq(schema.fxRates.quote, q), lte(schema.fxRates.date, day)))
    .orderBy(desc(schema.fxRates.date)).limit(1)
  const rate = row?.rate ?? FALLBACK[q] ?? null
  memo.set(k, { rate, at: Date.now() })
  return rate
}

// Used only until the fx connector has run once.
const FALLBACK: Record<string, number> = { INR: 88, EUR: 0.86, GBP: 0.75, JPY: 150, AED: 3.67, SGD: 1.3 }

/** Convert amount between fiat currencies (or USD stablecoins) using the rate for `day`. */
export async function convert(amount: number, from: string, to: string, day = new Date().toISOString().slice(0, 10)) {
  if (from.toUpperCase() === to.toUpperCase()) return amount
  const [a, b] = await Promise.all([usdRate(from, day), usdRate(to, day)])
  if (a == null || b == null) return null
  return (amount / a) * b
}
