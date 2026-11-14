import type { Parser, Rec } from '@/core/types'
import { asObj } from './util'

/**
 * One day from a Google Takeout (core/imports/takeout.ts): Fit's daily activity metrics and the number of YouTube
 * videos watched. `fill` keeps live data (Strava, Oura, your own logs) untouched.
 */
export const takeout: Parser = {
  id: 'takeout',
  match: (e) => e.source === 'google-fit-export' || e.source === 'youtube-history',
  parse: (e) => {
    const b = asObj(e)
    const date = String(b.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
    const meta = { importId: b.importId }
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    if (e.source === 'youtube-history') {
      const videos = num(b.videos)
      if (!videos) return []
      return [{
        kind: 'entry', tracker: 'youtube.videos', date, value: videos, source: 'youtube', mode: 'fill', verified: true,
        note: typeof b.topChannel === 'string' ? b.topChannel : undefined, meta,
        defaults: { name: 'YouTube videos', category: 'mind', kind: 'number', direction: 'down', aggregate: 'sum' },
      }]
    }
    const recs: Rec[] = []
    const entry = (tracker: string, value: number | null, defaults: Rec extends infer R ? (R extends { kind: 'entry'; defaults?: infer D } ? D : never) : never) => {
      if (value !== null && value > 0) recs.push({ kind: 'entry', tracker, date, value, source: 'google-fit', mode: 'fill', verified: true, meta, defaults })
    }
    entry('steps', num(b.steps), { name: 'Steps', category: 'health', target: 8000 })
    const m = num(b.distanceM)
    entry('walking.km', m === null ? null : Math.round((m / 1000) * 100) / 100, { name: 'Walking distance', category: 'health', unit: 'km' })
    entry('move.minutes', num(b.moveMinutes), { name: 'Move minutes', category: 'health', kind: 'duration', unit: 'min' })
    entry('heart.points', num(b.heartPoints), { name: 'Heart points', category: 'health', kind: 'number', direction: 'up' })
    return recs
  },
}
