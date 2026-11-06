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
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) throw new Error(`FX rates HTTP ${res.status}`)
    const j = (await res.json()) as { result: string; time_last_update_unix: number; rates: Record<string, number> }
    if (j.result !== 'success') throw new Error('FX rates: unexpected response')
    const date = new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10)
    const rows = Object.entries(j.rates).map(([quote, rate]) => ({ date, quote, rate }))
    await db.insert(schema.fxRates).values(rows)
      .onConflictDoUpdate({ target: [schema.fxRates.date, schema.fxRates.quote], set: { rate: sql`excluded.rate` } })
    ctx.log(`fx: ${rows.length} rates for ${date}`)
  },
}
