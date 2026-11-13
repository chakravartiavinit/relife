import type { Connector } from '@/core/types'
import { localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, syncWindow } from './daily'
import { apiError, appFields, checkApp, token } from './oauth'

// WHOOP, signed in with OAuth (developer API v2). Each day: recovery, HRV, resting heart rate, sleep hours
// and sleep performance (on the day you woke up), and the day's strain (on the day the cycle started).
// First sync backfills 90 days, later ones the last 3.

export type WhoopDay = { date: string; recovery?: number; hrv?: number; restingHr?: number; sleepHours?: number; sleepScore?: number; strain?: number }

type Page<T> = { records: T[]; next_token?: string | null }
type Sleep = { id: string; end: string; nap: boolean; score_state: string; score?: { stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number }; sleep_performance_percentage?: number } }
type Recovery = { sleep_id?: string; created_at: string; score_state: string; score?: { recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number } }
type Cycle = { start: string; score_state: string; score?: { strain?: number } }

const r1 = (n: number) => Math.round(n * 10) / 10

/** Pure: WHOOP records into days in the user's time zone. Only scored records count. Exported for tests. */
export function whoopDays(input: { sleep: Sleep[]; recovery: Recovery[]; cycles: Cycle[] }, tz: string) {
  const { days, day } = dayMap<WhoopDay>((date) => ({ date }))
  const sleepDay = new Map<string, string>()
  for (const s of input.sleep) {
    if (s.nap || s.score_state !== 'SCORED' || !s.score) continue
    const date = localDate(new Date(s.end), tz)
    sleepDay.set(s.id, date)
    const st = s.score.stage_summary
    const d = day(date)
    if (st?.total_in_bed_time_milli) d.sleepHours = r1((d.sleepHours ?? 0) + (st.total_in_bed_time_milli - (st.total_awake_time_milli ?? 0)) / 3_600_000)
    if (s.score.sleep_performance_percentage != null) d.sleepScore = Math.round(s.score.sleep_performance_percentage)
  }
  for (const r of input.recovery) {
    if (r.score_state !== 'SCORED' || !r.score) continue
    const d = day((r.sleep_id && sleepDay.get(r.sleep_id)) || localDate(new Date(r.created_at), tz))
    if (r.score.recovery_score != null) d.recovery = Math.round(r.score.recovery_score)
    if (r.score.hrv_rmssd_milli != null) d.hrv = Math.round(r.score.hrv_rmssd_milli)
    if (r.score.resting_heart_rate != null) d.restingHr = Math.round(r.score.resting_heart_rate)
  }
  for (const c of input.cycles) {
    if (c.score_state !== 'SCORED' || c.score?.strain == null) continue
    day(localDate(new Date(c.start), tz)).strain = r1(c.score.strain)
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export const whoop: Connector = {
  id: 'whoop',
  name: 'WHOOP',
  category: 'health',
  description: 'Recovery, HRV, sleep and strain from your WHOOP, every day.',
  provides: ['Recovery', 'HRV', 'Strain'],
  fields: appFields('WHOOP', 'From your app at developer-dashboard.whoop.com.'),
  env: ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET'],
  oauth: {
    authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    // `offline` is what gives a refresh token.
    scopes: ['read:recovery', 'read:sleep', 'read:cycles', 'offline'],
    clientIdEnv: 'WHOOP_CLIENT_ID',
    clientSecretEnv: 'WHOOP_CLIENT_SECRET',
    setupUrl: 'https://developer-dashboard.whoop.com',
    httpsOnly: true,
    // WHOOP swaps the refresh token on every refresh and only sends a new one when `offline` is asked again.
    tokenParams: { scope: 'offline' },
  },
  everyMinutes: 60,
  check: (get) => checkApp('WHOOP', whoop, get),
  async sync(ctx) {
    const headers = { Authorization: `Bearer ${await token(ctx, whoop)}` }
    const { tz, today, from } = syncWindow(ctx, 90)
    // Two days early, so a night that started before the window's first day is whole.
    const start = new Date(Date.parse(`${from}T00:00:00Z`) - 2 * 86_400_000).toISOString()
    const get = async <T,>(path: string) => {
      const out: T[] = []
      let next: string | null | undefined
      for (let i = 0; i < 40; i++) {
        const q = new URLSearchParams({ start, limit: '25', ...(next ? { nextToken: next } : {}) })
        const p = await fetchJson<Page<T>>(`https://api.prod.whoop.com/developer/v2/${path}?${q}`, { headers })
          .catch(apiError('WHOOP'))
        out.push(...p.records)
        next = p.next_token
        if (!next) break
      }
      return out
    }
    const [sleep, recovery, cycles] = await Promise.all([get<Sleep>('activity/sleep'), get<Recovery>('recovery'), get<Cycle>('cycle')])
    const days = whoopDays({ sleep, recovery, cycles }, tz).filter((d) => d.date >= from && d.date <= today)
    await emitDays(ctx, 'whoop', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${days.length} days`)
  },
}
