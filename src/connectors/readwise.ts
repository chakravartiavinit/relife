import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { addDays, localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, fillDays, syncWindow } from './daily'

// Readwise: highlights you make while reading (Kindle, articles, books, podcasts…), counted per day. Only counts
// and the number of different books or articles are kept, never the text. First sync backfills 90 days, later
// ones the last 3. src/parsers/byok.ts turns each day into highlights.made.

export type ReadwiseDay = { date: string; highlights: number; sources: number }

export type Highlight = { highlighted_at?: string | null; book_id?: number }

type Page = { count: number; next: string | null; results: Highlight[] }

/** Pure: highlights into days (on when you made them) in the user's time zone. Exported for tests. */
export function readwiseDays(highlights: Highlight[], tz: string) {
  const { days, day } = dayMap<ReadwiseDay & { books: Set<number> }>((date) => ({ date, highlights: 0, sources: 0, books: new Set() }))
  for (const h of highlights) {
    if (!h.highlighted_at || !Number.isFinite(Date.parse(h.highlighted_at))) continue
    const d = day(localDate(new Date(h.highlighted_at), tz))
    d.highlights++
    if (h.book_id != null) d.books.add(h.book_id)
  }
  return [...days.values()].map(({ books, ...d }): ReadwiseDay => ({ ...d, sources: books.size }))
}

export const readwise: Connector = {
  id: 'readwise',
  name: 'Readwise',
  category: 'mind',
  description: 'Highlights you make while reading, per day. Only counts leave Readwise, never the text.',
  provides: ['Highlights', 'Books and articles'],
  fields: [{ env: 'READWISE_TOKEN', label: 'Access token', secret: true, hint: 'readwise.io/access_token.' }],
  env: ['READWISE_TOKEN'],
  everyMinutes: 120,
  async sync(ctx) {
    const { tz, today, from, backfilled } = syncWindow(ctx, 90)
    const headers = { Authorization: `Token ${env('READWISE_TOKEN')!.trim()}` }
    const q = new URLSearchParams({ highlighted_at__gt: `${addDays(from, -1)}T00:00:00Z`, page_size: '1000' })
    const highlights: Highlight[] = []
    let next: string | null = `https://readwise.io/api/v2/highlights/?${q}`
    // The highlight list allows 20 requests a minute; 1000 a page makes that plenty.
    for (let page = 0; next && page < 20; page++) {
      const r: Page = await fetchJson<Page>(next, { headers })
        .catch((e: Error) => { throw new Error(e.message.includes('rejected') ? 'Readwise rejected the token. Copy it again from readwise.io/access_token.' : e.message) })
      highlights.push(...r.results)
      next = r.next
    }
    const days = fillDays(readwiseDays(highlights, tz), from, today, (date) => ({ date, highlights: 0, sources: 0 }), backfilled)
    await emitDays(ctx, 'readwise', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${highlights.length} highlights on ${days.length} days`)
  },
}
