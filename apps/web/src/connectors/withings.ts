import type { Connector } from '@/core/types'
import { addDays, localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, syncWindow } from './daily'
import { appFields, token } from './oauth'

// Withings scales, watches and sleep mats, signed in with OAuth. Each day: weight and body fat (the day's
// last weigh-in), sleep hours and sleep score, and steps. First sync backfills 90 days, later ones 3.

export type WithingsDay = { date: string; weight?: number; fat?: number; sleepHours?: number; sleepScore?: number; steps?: number }

type Measure = { date: number; category: number; measures: { value: number; type: number; unit: number }[] }
type Sleep = { date: string; data: { total_sleep_time?: number; sleep_score?: number } }
type Activity = { date: string; steps?: number }

const WEIGHT = 1, FAT = 6

/** Pure: Withings replies into days. Measures are real readings only (category 1), latest wins. Exported for tests. */
export function withingsDays(input: { measures: Measure[]; sleep: Sleep[]; activity: Activity[] }, tz: string) {
  const { days, day } = dayMap<WithingsDay>((date) => ({ date }))
  for (const g of [...input.measures].filter((x) => x.category === 1).sort((a, b) => a.date - b.date)) {
    const d = day(localDate(new Date(g.date * 1000), tz))
    for (const m of g.measures) {
      const v = Math.round(m.value * 10 ** m.unit * 10) / 10
      if (m.type === WEIGHT) d.weight = v
      if (m.type === FAT) d.fat = v
    }
  }
  for (const s of input.sleep) {
    const d = day(s.date)
    if (s.data.total_sleep_time) d.sleepHours = Math.round((s.data.total_sleep_time / 3600) * 10) / 10
    if (s.data.sleep_score != null) d.sleepScore = s.data.sleep_score
  }
  for (const a of input.activity) if (a.steps != null) day(a.date).steps = a.steps
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export const withings: Connector = {
  id: 'withings',
  name: 'Withings',
  category: 'health',
  description: 'Weight and body fat from your Withings scale, plus sleep and steps from its watches and sleep mats.',
  provides: ['Weight', 'Body fat', 'Sleep'],
  fields: appFields('WITHINGS', 'From your app at developer.withings.com (Public API integration).'),
  env: ['WITHINGS_CLIENT_ID', 'WITHINGS_CLIENT_SECRET'],
  oauth: {
    authorizeUrl: 'https://account.withings.com/oauth2_user/authorize2',
    tokenUrl: 'https://wbsapi.withings.net/v2/oauth2',
    scopes: ['user.metrics', 'user.activity'],
    scopeSeparator: ',',
    clientIdEnv: 'WITHINGS_CLIENT_ID',
    clientSecretEnv: 'WITHINGS_CLIENT_SECRET',
    tokenParams: { action: 'requesttoken' },
    setupUrl: 'https://developer.withings.com/dashboard/',
  },
  everyMinutes: 60,
  async sync(ctx) {
    const auth = `Bearer ${await token(ctx, withings)}`
    const { tz, today, from } = syncWindow(ctx, 90)
    // Withings answers every call with HTTP 200 and a `status`; 0 means OK.
    const call = async <T,>(path: string, params: Record<string, string>) => {
      const r = await fetchJson<{ status: number; body: T; error?: string }>(`https://wbsapi.withings.net${path}`, {
        method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params),
      })
      if (r.status === 401) throw new Error('The Withings sign-in expired. Sign in again in You › Connections.')
      if (r.status !== 0) throw new Error(`Withings: ${r.error ?? `status ${r.status}`}`)
      return r.body
    }
    const range = { startdate: String(Math.floor(Date.parse(`${addDays(from, -1)}T00:00:00Z`) / 1000)), enddate: String(Math.floor(Date.now() / 1000)) }
    const ymd = { startdateymd: from, enddateymd: today }
    // Lists come in pages: `more` says there's another, starting at `offset`.
    const list = async <T,>(key: string, path: string, params: Record<string, string>) => {
      const out: T[] = []
      for (let offset = 0, i = 0; i < 20; i++) {
        const b = await call<{ more?: unknown; offset?: number; [k: string]: unknown }>(path, { ...params, ...(offset ? { offset: String(offset) } : {}) })
        out.push(...(b[key] as T[]))
        if (!b.more || !b.offset) break
        offset = b.offset
      }
      return out
    }
    const measures = await list<Measure>('measuregrps', '/measure', { action: 'getmeas', meastypes: `${WEIGHT},${FAT}`, category: '1', ...range })
    const sleep = await list<Sleep>('series', '/v2/sleep', { action: 'getsummary', ...ymd, data_fields: 'total_sleep_time,sleep_score' })
    const activity = await list<Activity>('activities', '/v2/measure', { action: 'getactivity', ...ymd, data_fields: 'steps' })
    const days = withingsDays({ measures, sleep, activity }, tz).filter((d) => d.date >= from && d.date <= today)
    await emitDays(ctx, 'withings', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${days.length} days`)
  },
}
