import type { Connector } from '@/core/types'
import { appFields, token as accessToken } from './oauth'
import { dayMap, emitDays, fetchJson, fillDays, syncWindow } from './daily'

// Strava: every run, ride, walk, swim and workout you record, as minutes moving and distance per day.
// You sign in with Strava (OAuth) through a small API app of your own; a pasted refresh token also works.
// First sync backfills 90 days, later ones 7.

export type StravaDay = {
  date: string
  activities: number
  /** Moving minutes across every activity. */
  minutes: number
  runKm: number
  rideKm: number
  /** Distance on foot that isn't a run: walks and hikes. */
  walkKm: number
  swimKm: number
}

type Activity = { sport_type?: string; type: string; moving_time: number; distance: number; start_date_local: string }

const RUN = /run/i, RIDE = /ride|cycl/i, WALK = /walk|hike/i, SWIM = /swim/i
const km = (m: number) => Math.round(m / 10) / 100

const blank = (date: string): StravaDay => ({ date, activities: 0, minutes: 0, runKm: 0, rideKm: 0, walkKm: 0, swimKm: 0 })

/** Pure: activities into days, on the local date Strava recorded them. Exported for tests. */
export function stravaDays(activities: Activity[]) {
  const { days, day } = dayMap(blank)
  for (const a of activities) {
    const d = day(a.start_date_local.slice(0, 10))
    const sport = a.sport_type ?? a.type
    d.activities++
    d.minutes += Math.round(a.moving_time / 60)
    if (RUN.test(sport)) d.runKm = km(d.runKm * 1000 + a.distance)
    else if (RIDE.test(sport)) d.rideKm = km(d.rideKm * 1000 + a.distance)
    else if (WALK.test(sport)) d.walkKm = km(d.walkKm * 1000 + a.distance)
    else if (SWIM.test(sport)) d.swimKm = km(d.swimKm * 1000 + a.distance)
  }
  return days
}

export const strava: Connector = {
  id: 'strava',
  name: 'Strava',
  category: 'health',
  description: 'Every run, ride, walk and workout you record on Strava: active minutes and distance each day.',
  provides: ['Active minutes', 'Running', 'Cycling'],
  fields: [
    ...appFields('STRAVA', 'From your app at strava.com/settings/api. Set its authorization callback domain to 127.0.0.1 (the host of the redirect address).'),
    { env: 'STRAVA_REFRESH_TOKEN', label: 'Refresh token', secret: true, optional: true, hint: 'Only if this Mac has no browser: paste one instead of signing in (docs/CONNECTORS.md).' },
  ],
  env: ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET'],
  oauth: {
    authorizeUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    scopes: ['read', 'activity:read_all'],
    scopeSeparator: ',',
    clientIdEnv: 'STRAVA_CLIENT_ID',
    clientSecretEnv: 'STRAVA_CLIENT_SECRET',
    refreshTokenEnv: 'STRAVA_REFRESH_TOKEN',
    authParams: { approval_prompt: 'auto' },
    setupUrl: 'https://www.strava.com/settings/api',
  },
  everyMinutes: 60,
  async sync(ctx) {
    const token = await accessToken(ctx, strava)
    const { from, today, backfilled } = syncWindow(ctx, 90, 7)
    // Strava filters by UTC time; start a day early so the window's first local day is whole.
    const after = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000) - 86_400
    const activities: Activity[] = []
    for (let page = 1; page <= 10; page++) {
      const list = await fetchJson<Activity[]>(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200&page=${page}`, { headers: { Authorization: `Bearer ${token}` } })
      activities.push(...list)
      if (list.length < 200) break
    }
    const days = fillDays(stravaDays(activities).values(), from, today, blank, backfilled)
    await emitDays(ctx, 'strava', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${activities.length} activities on ${days.length} days${backfilled ? '' : ' (backfill)'}`)
  },
}
