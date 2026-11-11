import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { dayMap, emitDays, fillDays } from './daily'

// Letterboxd: the films you log in your diary, from your public RSS feed (letterboxd.com/<you>/rss/). No key.
// The feed holds only your latest 50 diary entries, so the first sync backfills whatever the feed has and
// older films are never seen. Each day becomes films watched, their titles and the average rating you gave.

export type LetterboxdDay = { date: string; films: number; titles?: string[]; rating?: number }

/** The newest this many diary entries are all the feed holds. */
const FEED_WATCHES = 50

type Watch = { date: string; title: string; year?: string; rating?: number }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (m, dec, hex, name) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name] ?? m).trim()

/** Pure: the text of one tag inside an item, e.g. `letterboxd:watchedDate`. */
const tag = (item: string, name: string) => {
  const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return m ? decode(m[1]) : undefined
}

/** Pure: diary entries from the RSS text. Lists and reviews without a watched date are skipped. Exported for tests. */
export function letterboxdWatches(xml: string): Watch[] {
  const out: Watch[] = []
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const date = tag(item, 'letterboxd:watchedDate')
    const title = tag(item, 'letterboxd:filmTitle')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) continue
    const rating = Number(tag(item, 'letterboxd:memberRating'))
    out.push({ date, title, year: tag(item, 'letterboxd:filmYear'), rating: rating > 0 ? rating : undefined })
  }
  return out
}

/** Pure: diary entries into days. The watched date is the calendar day you picked, so no time zone applies. Exported for tests. */
export function letterboxdDays(watches: Watch[]) {
  const { days, day } = dayMap<LetterboxdDay & { titles: string[]; ratings: number[] }>((date) => ({ date, films: 0, titles: [], ratings: [] }))
  for (const w of watches) {
    const d = day(w.date)
    d.films++
    d.titles.push(w.year ? `${w.title} (${w.year})` : w.title)
    if (w.rating) d.ratings.push(w.rating)
  }
  return [...days.values()].map(({ ratings, ...d }): LetterboxdDay => ({
    ...d, rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : undefined,
  }))
}

/** The username from a bare name or a profile link (letterboxd.com/dave/). */
export function letterboxdUser(input: string) {
  const name = input.trim().replace(/^https?:\/\//i, '').replace(/^(?:www\.)?letterboxd\.com\//i, '').split(/[/?#]/)[0]
  if (!/^[\w-]+$/.test(name)) throw new Error('That is not a Letterboxd username. Use the name after letterboxd.com/ on your profile.')
  return name
}

export const letterboxd: Connector = {
  id: 'letterboxd',
  name: 'Letterboxd',
  category: 'hobbies',
  description: 'Films you log in your Letterboxd diary, each day, from your public feed. No key or login needed.',
  provides: ['Films watched', 'Titles', 'Ratings'],
  fields: [{ env: 'LETTERBOXD_USERNAME', label: 'Letterboxd username', placeholder: 'dave', hint: 'Your public profile name (letterboxd.com/<name>) or its link. The feed holds your latest 50 diary entries.' }],
  env: ['LETTERBOXD_USERNAME'],
  everyMinutes: 120,
  async sync(ctx) {
    const user = letterboxdUser(env('LETTERBOXD_USERNAME')!)
    const res = await fetch(`https://letterboxd.com/${user}/rss/`, { headers: { 'User-Agent': 'ReLife (self-hosted life tracker)', Accept: 'application/rss+xml' } })
    if (res.status === 404) throw new Error('Letterboxd user not found, or the profile is private. Check the username.')
    if (res.status === 429) throw new Error('Rate limited. It will try again on the next sync.')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()
    if (!xml.includes('<rss')) throw new Error('Letterboxd did not return a feed. It will try again on the next sync.')
    const watches = letterboxdWatches(xml)
    let days = letterboxdDays(watches).sort((a, b) => a.date.localeCompare(b.date))
    // A full feed is cut off mid-history, so its oldest day may be missing films it really had.
    if (watches.length >= FEED_WATCHES) days = days.slice(1)
    const today = localDate(new Date(), ctx.user.timezone)
    const from = days[0]?.date ?? today
    days = fillDays(days, from, today, (date) => ({ date, films: 0 }), false)
    await emitDays(ctx, 'letterboxd', days)
    ctx.log(`${watches.length} diary entries on ${days.length} days`)
  },
}
