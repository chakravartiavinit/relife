import { sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { Connector } from '@/core/types'

/** Daily USD-based FX rates (free, no key). Stored directly; no raw events. */
export const fx: Connector = {
  id: 'fx',
  name: 'Exchange rates',
  category: 'wealth',
  description: 'Daily USD-based exchange rates, so money in any currency adds up in yours. Free, no key.',
  provides: ['Currency rates'],
  fields: [],
  env: [],
  everyMinutes: 720,
  async sync(ctx) {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(30_000) })
    if (res.status === 429) throw new Error('The exchange-rate service is rate limiting this computer. It tries again in 12 hours.')
    if (!res.ok) throw new Error(`FX rates HTTP ${res.status}`)
    const j = (await res.json()) as { result: string; time_last_update_unix: number; rates: Record<string, number> }
    if (j.result !== 'success' || !j.rates) throw new Error('FX rates: unexpected response')
    const date = new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10)
    // A zero or missing rate would divide every amount in that currency by nothing.
    const rows = Object.entries(j.rates).filter(([, rate]) => Number.isFinite(rate) && rate > 0).map(([quote, rate]) => ({ date, quote, rate }))
    if (!rows.length) throw new Error('FX rates: no usable rates in the response')
    await db.insert(schema.fxRates).values(rows)
      .onConflictDoUpdate({ target: [schema.fxRates.date, schema.fxRates.quote], set: { rate: sql`excluded.rate` } })
    ctx.log(`fx: ${rows.length} rates for ${date}`)
  },
}
