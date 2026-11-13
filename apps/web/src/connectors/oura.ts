import type { Connector } from '@/core/types'
import { addDays } from '@/core/time'
import { dayMap, emitDays, fetchJson, syncWindow } from './daily'
import { apiError, appFields, checkApp, token } from './oauth'

// Oura Ring, signed in with OAuth (personal access tokens were retired in December 2025). Each day: sleep
// hours and score, readiness, HRV, lowest heart rate and steps. Oura keys every summary to the day you
// woke up, which is the day ReLife uses too. First sync backfills 90 days, later ones the last 3.

export type OuraDay = {
  date: string
  sleepHours?: number
  sleepScore?: number
  readiness?: number
  hrv?: number
  restingHr?: number
  steps?: number
}

type Page<T> = { data: T[]; next_token?: string | null }
type Sleep = { day: string; type: string; total_sleep_duration?: number | null; average_hrv?: number | null; lowest_heart_rate?: number | null }

const r1 = (n: number) => Math.round(n * 10) / 10

/** Pure: Oura's four collections into days. Exported for tests. */
export function ouraDays(input: {
  sleep: Sleep[]
  dailySleep: { day: string; score?: number | null }[]
  readiness: { day: string; score?: number | null }[]
  activity: { day: string; steps?: number }[]
}) {
  const { days, day } = dayMap<OuraDay>((date) => ({ date }))
  // The main sleep of each night; naps and rest periods don't count as the night's sleep.
  for (const s of input.sleep.filter((x) => x.type === 'long_sleep')) {
    const d = day(s.day)
    if (s.total_sleep_duration) d.sleepHours = r1((d.sleepHours ?? 0) + s.total_sleep_duration / 3600)
    if (s.average_hrv) d.hrv = Math.round(s.average_hrv)
    if (s.lowest_heart_rate) d.restingHr = s.lowest_heart_rate
  }
  for (const s of input.dailySleep) if (s.score != null) day(s.day).sleepScore = s.score
  for (const r of input.readiness) if (r.score != null) day(r.day).readiness = r.score
  for (const a of input.activity) if (a.steps != null) day(a.day).steps = a.steps
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export const oura: Connector = {
  id: 'oura',
  name: 'Oura',
  category: 'health',
  description: 'Sleep, readiness, HRV and steps from your Oura Ring, each morning after it syncs.',
  provides: ['Sleep score', 'Readiness', 'HRV'],
  fields: appFields('OURA', 'From your app at cloud.ouraring.com/oauth/applications.'),
  env: ['OURA_CLIENT_ID', 'OURA_CLIENT_SECRET'],
  oauth: {
    authorizeUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scopes: ['daily', 'heartrate', 'personal'],
    clientIdEnv: 'OURA_CLIENT_ID',
    clientSecretEnv: 'OURA_CLIENT_SECRET',
    setupUrl: 'https://cloud.ouraring.com/oauth/applications',
  },
  everyMinutes: 60,
  check: (get) => checkApp('Oura', oura, get),
  async sync(ctx) {
    const headers = { Authorization: `Bearer ${await token(ctx, oura)}` }
    const { today, from } = syncWindow(ctx, 90)
    const get = async <T,>(collection: string) => {
      const out: T[] = []
      let next: string | null | undefined
      do {
        // end_date a day later: Oura's end is exclusive for some collections.
        const q = new URLSearchParams({ start_date: from, end_date: addDays(today, 1), ...(next ? { next_token: next } : {}) })
        const p = await fetchJson<Page<T>>(`https://api.ouraring.com/v2/usercollection/${collection}?${q}`, { headers })
          .catch(apiError('Oura', ' Oura only shares data while your membership is active.'))
        out.push(...p.data)
        next = p.next_token
      } while (next)
      return out
    }
    const [sleep, dailySleep, readiness, activity] = await Promise.all([
      get<Sleep>('sleep'), get<{ day: string; score?: number }>('daily_sleep'),
      get<{ day: string; score?: number }>('daily_readiness'), get<{ day: string; steps?: number }>('daily_activity'),
    ])
    const days = ouraDays({ sleep, dailySleep, readiness, activity }).filter((d) => d.date >= from && d.date <= today)
    await emitDays(ctx, 'oura', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${days.length} days`)
  },
}
