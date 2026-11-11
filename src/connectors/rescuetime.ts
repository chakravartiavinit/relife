import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { emitDays, fetchJson, syncWindow } from './daily'

// RescueTime: how productive your computer time was. The daily summary feed gives one row per day for the
// last two weeks (never today), so the first sync backfills 14 days and later ones refresh the same window.
// src/parsers/daily.ts turns each day into productivity.pulse, productive.minutes and distracting.minutes.

export type RescueDay = { date: string; pulse?: number; productiveMin: number; distractingMin: number; loggedMin: number }

export type RescueRow = {
  date: string
  productivity_pulse?: number | null
  total_hours?: number
  all_productive_hours?: number
  all_distracting_hours?: number
}

const minutes = (hours?: number) => Math.round((hours ?? 0) * 60)

/** Pure: feed rows into days. A day with nothing logged has no pulse (0 would read as a bad day). Exported for tests. */
export function rescueDays(rows: RescueRow[], from: string, today: string): RescueDay[] {
  return rows
    .filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.date) && r.date.slice(0, 10) >= from && r.date.slice(0, 10) <= today)
    .map((r) => ({
      date: r.date.slice(0, 10),
      pulse: (r.total_hours ?? 0) > 0 && r.productivity_pulse != null ? Math.round(r.productivity_pulse) : undefined,
      productiveMin: minutes(r.all_productive_hours),
      distractingMin: minutes(r.all_distracting_hours),
      loggedMin: minutes(r.total_hours),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export const rescuetime: Connector = {
  id: 'rescuetime',
  name: 'RescueTime',
  category: 'mind',
  description: 'Your daily productivity pulse, and the minutes you spent on productive and distracting things on your computer.',
  provides: ['Productivity pulse', 'Productive time', 'Distracting time'],
  fields: [{ env: 'RESCUETIME_API_KEY', label: 'API key', secret: true, hint: 'rescuetime.com/anapi/manage → Create a new API key.' }],
  env: ['RESCUETIME_API_KEY'],
  everyMinutes: 120,
  async sync(ctx) {
    const { today, from } = syncWindow(ctx, 14)
    const rows = await fetchJson<RescueRow[]>('https://www.rescuetime.com/anapi/daily_summary_feed', { headers: { Authorization: `Bearer ${env('RESCUETIME_API_KEY')!.trim()}` } })
      // RescueTime answers a wrong key with HTTP 400 "key not found".
      .catch((e: Error) => { throw new Error(/^HTTP 400|rejected/.test(e.message) ? 'RescueTime did not accept the API key. Make a new one at rescuetime.com/anapi/manage.' : e.message) })
    const days = rescueDays(Array.isArray(rows) ? rows : [], from, today)
    await emitDays(ctx, 'rescuetime', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${days.length} days`)
  },
}
