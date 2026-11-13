import type { Parser, Rec, TrackerDefaults } from '@/core/types'
import { METRICS } from './shortcuts'
import { asObj } from './util'

const SLEEP: TrackerDefaults = { name: 'Sleep', category: 'health', unit: 'h', aggregate: 'last', target: 7.5, kind: 'duration' }

/**
 * One day of an Apple Health export.zip (core/imports/apple-health.ts). Same source name as the iPhone Shortcuts feed
 * ('apple-health'), so a day never sums two Apple sources; `fill` makes the live Shortcuts day win and lets a newer
 * export refresh only what an earlier import wrote.
 */
export const healthExport: Parser = {
  id: 'health-export',
  match: (e) => e.source === 'apple-health-export',
  parse: (e) => {
    const b = asObj(e)
    const date = String(b.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
    const meta = { importId: b.importId }
    const recs: Rec[] = []
    const metrics = (b.metrics && typeof b.metrics === 'object' ? b.metrics : {}) as Record<string, number>
    for (const [key, value] of Object.entries(metrics)) {
      const known = METRICS[key]
      if (!known || !Number.isFinite(value)) continue
      recs.push({ kind: 'entry', tracker: known.tracker, date, value, source: 'apple-health', mode: 'fill', verified: true, meta, defaults: known.defaults })
    }
    if (typeof b.sleepHours === 'number' && b.sleepHours > 0) {
      recs.push({ kind: 'entry', tracker: 'sleep.hours', date, value: b.sleepHours, source: 'apple-health', mode: 'fill', verified: true, meta, defaults: SLEEP })
    }
    return recs
  },
}
