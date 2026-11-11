import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, fillDays, pastedName, rejectedAs, syncWindow } from './daily'

// Open Library: the books on your public "Already Read" shelf, each on the day you marked it read. No key.
// This stands in for Goodreads, which switched off its public shelf feeds in late October 2026. You can
// import your Goodreads export into Open Library (openlibrary.org/account/import), so the shelf follows you.
// A day is the time you marked the book read, so a bulk import lands on one day. First sync backfills 365 days.

export type BooksDay = { date: string; books: number; titles?: string[] }

type Entry = { work?: { title?: string }; logged_date?: string }
type Shelf = { numFound?: number; reading_log_entries?: Entry[] }

/** Pure: shelf entries into days in the user's time zone. Open Library logs times in UTC. Exported for tests. */
export function openLibraryDays(entries: Entry[], tz: string) {
  const { days, day } = dayMap<BooksDay & { titles: string[] }>((date) => ({ date, books: 0, titles: [] }))
  for (const e of entries) {
    const m = e.logged_date?.match(/^(\d{4})\/(\d{2})\/(\d{2}), (\d{2}:\d{2}:\d{2})/)
    if (!m) continue
    const d = day(localDate(new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}Z`), tz))
    d.books++
    if (e.work?.title) d.titles.push(e.work.title)
  }
  return [...days.values()]
}

/** The username from a bare name or a profile link (openlibrary.org/people/mekBot). */
export function openLibraryUser(input: string) {
  const name = pastedName(input, 'people')
  if (!/^[\w-]+$/.test(name)) throw new Error('That is not an Open Library username. Use the name in your profile link (openlibrary.org/people/<name>).')
  return name
}

const NOT_FOUND = 'Open Library user not found. Check the username (the name in openlibrary.org/people/<name>).'
const PRIVATE = 'Your Open Library reading log is private. Make it public under Account → Preferences → Privacy → Reading Log, then connect again.'

/** One page of the shelf (100 books). A private log answers 403, which fetchJson words as a rejected key. Open Library now and then answers a slow 500, so a 5xx is tried once more. */
const shelf = async (user: string, page: number, limit?: number): Promise<Shelf> => {
  const url = `https://openlibrary.org/people/${user}/books/already-read.json?page=${page}${limit ? `&limit=${limit}` : ''}`
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchJson<Shelf>(url, {}, NOT_FOUND).catch(rejectedAs(PRIVATE))
    } catch (e) {
      if (attempt >= 2 || !/^HTTP 5\d\d/.test((e as Error).message)) throw e
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

export const openlibrary: Connector = {
  id: 'openlibrary',
  name: 'Open Library',
  category: 'mind',
  description: 'Books you finish, from your public Open Library "Already Read" shelf. No key or login needed.',
  provides: ['Books read', 'Titles'],
  fields: [{ env: 'OPENLIBRARY_USERNAME', label: 'Open Library username', placeholder: 'mekBot', hint: 'Your profile name (openlibrary.org/people/<name>). Make your reading log public: Account → Preferences → Privacy.' }],
  env: ['OPENLIBRARY_USERNAME'],
  everyMinutes: 120,
  async check(get) {
    await shelf(openLibraryUser(get('OPENLIBRARY_USERNAME')!), 1, 1)
  },
  async sync(ctx) {
    const { tz, today, from, backfilled } = syncWindow(ctx, 365)
    const user = openLibraryUser(env('OPENLIBRARY_USERNAME')!)
    const entries: Entry[] = []
    for (let page = 1; page <= 20; page++) {
      const r = await shelf(user, page)
      entries.push(...(r.reading_log_entries ?? []))
      if (!r.reading_log_entries?.length || entries.length >= (r.numFound ?? 0)) break
    }
    const days = fillDays(openLibraryDays(entries, tz).filter((d) => d.date >= from), from, today, (date) => ({ date, books: 0 }), backfilled)
    await emitDays(ctx, 'openlibrary', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${entries.length} books on the shelf, ${days.length} days`)
  },
}
