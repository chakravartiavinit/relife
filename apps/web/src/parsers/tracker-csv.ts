import type { Parser } from '@/core/types'
import { asObj } from './util'

/** One value from a tracker CSV (core/imports/tracker-csv.ts). Typed-in history: not verified, never over live data. */
export const trackerCsv: Parser = {
  id: 'tracker-csv',
  match: (e) => e.source === 'tracker-csv',
  parse: (e) => {
    const b = asObj(e)
    const date = String(b.date ?? '')
    const slug = String(b.slug ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !slug || typeof b.value !== 'number' || !Number.isFinite(b.value)) return []
    return [{
      kind: 'entry', tracker: slug, date, value: b.value, source: 'csv', mode: 'fill', verified: false,
      note: typeof b.note === 'string' && b.note ? b.note : undefined, meta: { importId: b.importId },
      defaults: { unit: typeof b.unit === 'string' && b.unit ? b.unit : undefined },
    }]
  },
}
