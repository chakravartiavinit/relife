import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { addDays, localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, fillDays, syncWindow } from './daily'

// Toggl Track: time you track against projects, per day. Only totals and the top project name are kept,
// never entry descriptions. First sync backfills 90 days, later ones the last 3.
// src/parsers/byok.ts turns each day into tracked.minutes.

export type TogglDay = { date: string; minutes: number; entries: number; topProject?: string }

export type TogglEntry = { start: string; duration: number; project_name?: string | null }

/** Pure: time entries into days in the user's time zone. Running timers (negative duration) count once stopped. */
export function togglDays(entries: TogglEntry[], tz: string) {
  const { days, day } = dayMap<TogglDay & { seconds: number; projects: Map<string, number> }>((date) => ({ date, minutes: 0, entries: 0, seconds: 0, projects: new Map() }))
  for (const e of entries) {
    if (!(e.duration > 0)) continue
    const d = day(localDate(new Date(e.start), tz))
    d.seconds += e.duration
    d.entries++
    if (e.project_name) d.projects.set(e.project_name, (d.projects.get(e.project_name) ?? 0) + e.duration)
  }
  return [...days.values()].map(({ seconds, projects, ...d }): TogglDay => ({
    ...d, minutes: Math.round(seconds / 60), topProject: [...projects].sort((a, b) => b[1] - a[1])[0]?.[0],
  }))
}

export const toggl: Connector = {
  id: 'toggl',
  name: 'Toggl Track',
  category: 'skills',
  description: 'Time you track in Toggl each day, with your top project. Entry descriptions stay in Toggl.',
  provides: ['Tracked time', 'Top project'],
  fields: [{ env: 'TOGGL_API_TOKEN', label: 'API token', secret: true, hint: 'track.toggl.com → Profile settings → API Token (bottom of the page).' }],
  env: ['TOGGL_API_TOKEN'],
  everyMinutes: 60,
  async sync(ctx) {
    const { tz, today, from, backfilled } = syncWindow(ctx, 90)
    const auth = `Basic ${Buffer.from(`${env('TOGGL_API_TOKEN')!.trim()}:api_token`).toString('base64')}`
    // Entries are picked by start time; a day either side covers any time zone. The end day is not included.
    const q = new URLSearchParams({ start_date: addDays(from, -1), end_date: addDays(today, 2), meta: 'true' })
    const entries = await fetchJson<TogglEntry[]>(`https://api.track.toggl.com/api/v9/me/time_entries?${q}`, { headers: { Authorization: auth } })
      .catch((e: Error) => { throw new Error(e.message.includes('rejected') ? 'Toggl rejected the API token. Copy it again from Profile settings → API Token.' : e.message) })
    const days = fillDays(togglDays(entries ?? [], tz), from, today, (date) => ({ date, minutes: 0, entries: 0 }), backfilled)
    await emitDays(ctx, 'toggl', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${entries?.length ?? 0} entries on ${days.length} days`)
  },
}
