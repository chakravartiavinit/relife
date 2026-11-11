import type { Connector } from '@/core/types'
import { localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, fillDays, syncWindow } from './daily'
import { appFields, token } from './oauth'

// Google Calendar, signed in with OAuth (read-only). Each day: minutes in meetings (events with other
// people that you didn't decline) and minutes of Focus time blocks. Only times and counts are kept, never
// titles or guests. Events count up to now, so today grows through the day. First sync backfills 60 days.

export type CalendarDay = { date: string; meetings: number; meetingMinutes: number; focusMinutes: number }

type Event = {
  status?: string
  eventType?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { self?: boolean; resource?: boolean; responseStatus?: string }[]
}

const blank = (date: string): CalendarDay => ({ date, meetings: 0, meetingMinutes: 0, focusMinutes: 0 })

/** Pure: events into days in the user's time zone. Exported for tests. */
export function calendarDays(events: Event[], tz: string) {
  const { days, day } = dayMap(blank)
  for (const e of events) {
    // All-day events (no dateTime) and cancelled ones aren't time spent.
    if (e.status === 'cancelled' || !e.start?.dateTime || !e.end?.dateTime) continue
    const start = Date.parse(e.start.dateTime)
    const minutes = Math.min(12 * 60, Math.max(0, Math.round((Date.parse(e.end.dateTime) - start) / 60_000)))
    const d = day(localDate(new Date(start), tz))
    if (e.eventType === 'focusTime') { d.focusMinutes += minutes; continue }
    if (e.eventType && e.eventType !== 'default') continue // out of office, working location…
    const people = (e.attendees ?? []).filter((a) => !a.resource)
    const me = people.find((a) => a.self)
    if (people.length < 2 || me?.responseStatus === 'declined') continue
    d.meetings++
    d.meetingMinutes += minutes
  }
  return [...days.values()]
}

export const googleCalendar: Connector = {
  id: 'google-calendar',
  name: 'Google Calendar',
  category: 'mind',
  description: 'Time in meetings and in Focus time blocks each day, from your Google Calendar. Titles and guests stay in Google.',
  provides: ['Meeting time', 'Focus time'],
  fields: appFields('GOOGLE_CALENDAR', 'An OAuth client (Web application) from console.cloud.google.com → APIs & Services → Credentials.'),
  env: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET'],
  oauth: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
    clientIdEnv: 'GOOGLE_CALENDAR_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CALENDAR_CLIENT_SECRET',
    // offline + consent: Google only sends a refresh token when asked like this.
    authParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  everyMinutes: 60,
  async sync(ctx) {
    const headers = { Authorization: `Bearer ${await token(ctx, googleCalendar)}` }
    const { tz, today, from, backfilled } = syncWindow(ctx, 60)
    const events: Event[] = []
    let page: string | undefined
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({
        timeMin: new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString(), timeMax: new Date().toISOString(),
        singleEvents: 'true', maxResults: '2500', ...(page ? { pageToken: page } : {}),
      })
      const r = await fetchJson<{ items: Event[]; nextPageToken?: string }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers })
        .catch((e: Error) => { throw new Error(/rejected/.test(e.message) ? 'Google refused the calendar read. Check that the Google Calendar API is on in your Cloud project, or sign in again.' : e.message) })
      events.push(...r.items)
      page = r.nextPageToken
      if (!page) break
    }
    const days = fillDays(calendarDays(events, tz), from, today, blank, backfilled)
    await emitDays(ctx, 'google-calendar', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${events.length} events on ${days.length} days`)
  },
}
