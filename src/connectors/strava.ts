import { createHash } from 'node:crypto'
import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { dayMap, emitDays, fetchJson, fillDays, syncWindow } from './daily'

// Strava: every run, ride, walk, swim and workout you record, as minutes moving and distance per day.
// Strava has no personal keys, so you make a small API app once and paste its client ID, secret and a
// refresh token (docs/CONNECTORS.md shows the one command). Strava swaps the refresh token now and then;
// the newest one is kept encrypted in the sync cursor. First sync backfills 90 days, later ones 7.

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

type Cursor = { backfilled?: boolean; seed?: string; token?: string }

export const strava: Connector = {
  id: 'strava',
  name: 'Strava',
  category: 'health',
  description: 'Every run, ride, walk and workout you record on Strava: active minutes and distance each day.',
  provides: ['Active minutes', 'Running', 'Cycling'],
  fields: [
    { env: 'STRAVA_CLIENT_ID', label: 'Client ID', placeholder: '123456', hint: 'strava.com/settings/api → create an app (any name; website and callback domain: localhost).' },
    { env: 'STRAVA_CLIENT_SECRET', label: 'Client secret', secret: true },
    { env: 'STRAVA_REFRESH_TOKEN', label: 'Refresh token', secret: true, hint: 'Needs the activity:read_all scope. docs/CONNECTORS.md shows how to get it in one step.' },
  ],
  env: ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN'],
  everyMinutes: 60,
  async sync(ctx) {
    const { encrypt, decrypt } = await import('@/core/secrets') // lazy: secrets imports the connector list
    const cur = (ctx.cursor ?? {}) as Cursor
    const given = env('STRAVA_REFRESH_TOKEN')!.trim()
    const seed = createHash('sha256').update(given).digest('hex').slice(0, 16)
    // Use the newest token Strava gave us, unless a different one was pasted since.
    let refresh = given
    if (cur.seed === seed && cur.token) try { refresh = decrypt(Buffer.from(cur.token, 'base64')).t ?? given } catch { /* key changed: use the pasted one */ }

    const tok = await fetchJson<{ access_token: string; refresh_token: string }>('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env('STRAVA_CLIENT_ID')!.trim(), client_secret: env('STRAVA_CLIENT_SECRET')!.trim(), grant_type: 'refresh_token', refresh_token: refresh }),
    }).catch((e: Error) => { throw new Error(e.message.startsWith('HTTP 400') ? 'Strava rejected the refresh token. Make a new one (docs/CONNECTORS.md).' : e.message) })
    const token = encrypt({ t: tok.refresh_token }).toString('base64')
    if (tok.refresh_token !== refresh) {
      // Save the new token now: a failed sync keeps the old cursor, and the old token may no longer work.
      const { db, schema } = await import('@/db')
      const { and, eq } = await import('drizzle-orm')
      await db.update(schema.connections).set({ cursor: { ...cur, seed, token } satisfies Cursor })
        .where(and(eq(schema.connections.userId, ctx.user.id), eq(schema.connections.connectorId, 'strava')))
    }

    const { from, today, backfilled } = syncWindow(ctx, 90, 7)
    // Strava filters by UTC time; start a day early so the window's first local day is whole.
    const after = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000) - 86_400
    const activities: Activity[] = []
    for (let page = 1; page <= 10; page++) {
      const list = await fetchJson<Activity[]>(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200&page=${page}`, { headers: { Authorization: `Bearer ${tok.access_token}` } })
      activities.push(...list)
      if (list.length < 200) break
    }
    const days = fillDays(stravaDays(activities).values(), from, today, blank, backfilled)
    const n = await emitDays(ctx, 'strava', days)
    ctx.setCursor({ backfilled: true, seed, token } satisfies Cursor)
    ctx.log(`${activities.length} activities on ${n} days${backfilled ? '' : ' (backfill)'}`)
  },
}
