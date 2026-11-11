import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { dayMap, emitDays, fillDays, pastedName, request, syncWindow } from './daily'

// Last.fm: every song you scrobble from Spotify, Apple Music, YouTube Music and the rest. Each day becomes
// tracks played, an estimate of minutes listened (Last.fm doesn't store song lengths in the feed) and the
// top artist. First sync backfills 60 days, later ones the last 3.

export type LastfmDay = { date: string; tracks: number; minutes: number; topArtist?: string }

type Track = { artist: { '#text': string }; date?: { uts: string }; '@attr'?: { nowplaying?: string } }
type Recent = { recenttracks?: { track: Track[] | Track; '@attr': { totalPages: string } }; error?: number; message?: string }

// ponytail: an average song length; ask track.getInfo per song only if the estimate ever matters.
const MIN_PER_TRACK = 3.5

/** Pure: scrobbles into days in the user's time zone. Exported for tests. */
export function lastfmDays(tracks: Track[], tz: string) {
  const { days, day } = dayMap<LastfmDay & { artists: Map<string, number> }>((date) => ({ date, tracks: 0, minutes: 0, artists: new Map() }))
  for (const t of tracks) {
    if (!t.date || t['@attr']?.nowplaying) continue // the song playing now has no time yet
    const d = day(localDate(new Date(Number(t.date.uts) * 1000), tz))
    d.tracks++
    const a = t.artist['#text']
    if (a) d.artists.set(a, (d.artists.get(a) ?? 0) + 1)
  }
  return [...days.values()].map(({ artists, ...d }): LastfmDay => ({
    ...d, minutes: Math.round(d.tracks * MIN_PER_TRACK), topArtist: [...artists].sort((a, b) => b[1] - a[1])[0]?.[0],
  }))
}

/** Last.fm sends its error code in the body, often with a 403, so read the body before the status. */
function lastfmError(code: number, message?: string) {
  if (code === 6) return 'Last.fm user not found. Check the username (the name in last.fm/user/<name>).'
  if (code === 10 || code === 26) return 'Last.fm rejected the API key. Copy it again from last.fm/api/accounts.'
  if (code === 17) return 'This Last.fm profile hides recent listening. Untick "Hide recent listening information" in Last.fm Settings → Privacy.'
  if (code === 29) return 'Rate limited. It will try again on the next sync.'
  if ([8, 11, 16].includes(code)) return `Last.fm timed out or is busy (error ${code}). It will try again on the next sync.`
  return `Last.fm: ${message ?? `error ${code}`}`
}

async function recent(get: (env: string) => string | undefined, extra: Record<string, string>) {
  const q = new URLSearchParams({
    method: 'user.getrecenttracks', user: pastedName(get('LASTFM_USERNAME')!, 'user'), api_key: get('LASTFM_API_KEY')!.trim(), format: 'json', ...extra,
  })
  const res = await request(`https://ws.audioscrobbler.com/2.0/?${q}`)
  const body = await res.json().catch(() => null) as Recent | null
  if (body?.error) throw new Error(lastfmError(body.error, body.message))
  if (res.status === 429) throw new Error(lastfmError(29))
  if (!res.ok || !body) throw new Error(`HTTP ${res.status}`)
  return body
}

export const lastfm: Connector = {
  id: 'lastfm',
  name: 'Last.fm',
  category: 'hobbies',
  description: 'Music you listen to anywhere that scrobbles to Last.fm: songs and time each day, and your top artist.',
  provides: ['Listening time', 'Songs played', 'Top artist'],
  fields: [
    { env: 'LASTFM_USERNAME', label: 'Last.fm username', placeholder: 'rj', hint: 'Turn on scrobbling in Spotify (Settings → Social) or your music app first.' },
    { env: 'LASTFM_API_KEY', label: 'API key', secret: true, hint: 'Free, in a minute: last.fm/api/account/create. Only the API key is needed.' },
  ],
  env: ['LASTFM_USERNAME', 'LASTFM_API_KEY'],
  everyMinutes: 60,
  async check(get) {
    await recent(get, { limit: '1' })
  },
  async sync(ctx) {
    const { tz, today, from, backfilled } = syncWindow(ctx, 60)
    const fromTs = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000) - 86_400 // a day early covers any time zone
    const tracks: Track[] = []
    for (let page = 1; page <= 30; page++) {
      const r = await recent(env, { limit: '200', from: String(fromTs), page: String(page) })
      const list = r.recenttracks?.track
      tracks.push(...(Array.isArray(list) ? list : list ? [list] : []))
      if (page >= Number(r.recenttracks?.['@attr'].totalPages ?? 1)) break
    }
    const days = fillDays(lastfmDays(tracks, tz), from, today, (date) => ({ date, tracks: 0, minutes: 0 }), backfilled)
    await emitDays(ctx, 'lastfm', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${tracks.length} scrobbles on ${days.length} days`)
  },
}
