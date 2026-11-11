import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, fillDays, syncWindow } from './daily'

// Hevy: strength workouts, per day: how many, how long and the weight lifted (kg × reps, warm-ups left out).
// Needs Hevy Pro for the API key. Workouts come newest first, 10 a page; paging stops once a page is older than
// the window. First sync backfills 90 days, later ones the last 3.
// src/parsers/daily.ts turns each day into hevy.workouts and hevy.volume, and hevy.minutes.

export type HevyDay = { date: string; workouts: number; minutes: number; volumeKg: number; exercises: number }

export type HevyWorkout = {
  start_time: string
  end_time?: string
  exercises?: { sets?: { type?: string; weight_kg?: number | null; reps?: number | null }[] }[]
}

type Page = { page: number; page_count: number; workouts: HevyWorkout[] }

const blank = (date: string): HevyDay => ({ date, workouts: 0, minutes: 0, volumeKg: 0, exercises: 0 })

/** Pure: workouts into days in the user's time zone. Exported for tests. */
export function hevyDays(workouts: HevyWorkout[], tz: string) {
  const { days, day } = dayMap(blank)
  for (const w of workouts) {
    const start = Date.parse(w.start_time)
    if (!Number.isFinite(start)) continue
    const d = day(localDate(new Date(start), tz))
    const end = Date.parse(w.end_time ?? '')
    d.workouts++
    d.minutes += Number.isFinite(end) && end > start ? Math.round((end - start) / 60_000) : 0
    for (const ex of w.exercises ?? []) {
      d.exercises++
      for (const s of ex.sets ?? []) if (s.type !== 'warmup') d.volumeKg += (s.weight_kg ?? 0) * (s.reps ?? 0)
    }
  }
  for (const d of days.values()) d.volumeKg = Math.round(d.volumeKg)
  return [...days.values()]
}

export const hevy: Connector = {
  id: 'hevy',
  name: 'Hevy',
  category: 'health',
  description: 'Gym workouts from Hevy: how many each day, how long, and the weight you lifted. Needs Hevy Pro.',
  provides: ['Workouts', 'Workout time', 'Volume lifted'],
  fields: [{ env: 'HEVY_API_KEY', label: 'API key', secret: true, hint: 'hevy.com/settings?developer. The API is part of Hevy Pro.' }],
  env: ['HEVY_API_KEY'],
  everyMinutes: 60,
  async sync(ctx) {
    const { tz, today, from, backfilled } = syncWindow(ctx, 90)
    const headers = { 'api-key': env('HEVY_API_KEY')!.trim() }
    const workouts: HevyWorkout[] = []
    for (let page = 1; page <= 60; page++) {
      const r = await fetchJson<Page>(`https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`, { headers })
        .catch((e: Error) => { throw new Error(e.message.includes('rejected') ? 'Hevy rejected the API key. Copy it from hevy.com/settings?developer; the API needs Hevy Pro.' : e.message) })
      workouts.push(...(r.workouts ?? []))
      const oldest = r.workouts?.at(-1)
      if (!oldest || page >= (r.page_count ?? 1) || localDate(new Date(oldest.start_time), tz) < from) break
    }
    const days = fillDays(hevyDays(workouts, tz), from, today, blank, backfilled)
    await emitDays(ctx, 'hevy', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${workouts.length} workouts on ${days.length} days`)
  },
}
