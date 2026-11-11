import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { emitDays, fillDays, syncWindow } from './daily'

// Anki: cards reviewed each day and the time you spent, read from the AnkiConnect add-on that runs inside
// Anki on this computer (add-on code 2055492159). Anki must be open for a sync to work; a closed Anki just
// shows a message, and the next sync catches up because Anki keeps the whole history. First sync backfills
// 90 days. Cards come from Anki's own review counts (its day starts at the rollover hour, 4 am by default);
// minutes are summed from each review's answer time, which Anki caps at 60 seconds, on your calendar day.

export type AnkiDay = { date: string; cards: number; minutes?: number }

type Reply<T> = { result: T; error: string | null }
/** One review row: [id (unix ms), cardId, usn, ease, ivl, lastIvl, factor, time (ms), type]. */
type Review = number[]

const NOT_OPEN = 'Open Anki with the AnkiConnect add-on (code 2055492159), then sync again.'

/** Pure: Anki's per-day counts and review rows into days. Rows with type 4 (rescheduled by hand) aren't study. Exported for tests. */
export function ankiDays(counts: [string, number][], reviews: Review[], tz: string, from: string): AnkiDay[] {
  const minutes = new Map<string, number>()
  for (const r of reviews) {
    if (r[8] === 4) continue
    const date = localDate(new Date(r[0]), tz)
    minutes.set(date, (minutes.get(date) ?? 0) + (r[7] ?? 0) / 60_000)
  }
  return counts.filter(([date]) => date >= from).map(([date, cards]) => ({ date, cards, minutes: minutes.has(date) ? Math.round(minutes.get(date)!) : undefined }))
}

async function call<T>(url: string, key: string | undefined, action: string, params: object = {}) {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', body: JSON.stringify({ action, version: 6, params, ...(key ? { key } : {}) }), signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new Error(NOT_OPEN)
  }
  if (!res.ok) throw new Error(`Anki answered HTTP ${res.status}. Is ${url} the AnkiConnect address?`)
  const body = (await res.json().catch(() => null)) as Reply<T> | null
  if (!body || typeof body !== 'object' || !('error' in body)) throw new Error(`${url} is not AnkiConnect. Check the address.`)
  if (body.error) throw new Error(/api key/i.test(body.error) ? 'AnkiConnect rejected the key. Check the API key set in the add-on config.' : `AnkiConnect: ${body.error}`)
  return body.result
}

export const anki: Connector = {
  id: 'anki',
  name: 'Anki',
  category: 'skills',
  description: 'Flashcards you review in Anki each day and the minutes you spend, through the AnkiConnect add-on. Anki must be open.',
  provides: ['Cards reviewed', 'Study minutes'],
  fields: [
    { env: 'ANKI_CONNECT_URL', label: 'AnkiConnect address', optional: true, placeholder: 'http://127.0.0.1:8765', hint: 'Install the AnkiConnect add-on (Tools → Add-ons → Get Add-ons → 2055492159) and keep Anki open. Leave blank for the default address.' },
    { env: 'ANKI_CONNECT_KEY', label: 'AnkiConnect API key', optional: true, secret: true, hint: 'Only if you set an apiKey in the add-on config.' },
  ],
  env: [],
  everyMinutes: 60,
  async sync(ctx) {
    const { tz, today, from, backfilled } = syncWindow(ctx, 90)
    const url = env('ANKI_CONNECT_URL')?.trim() || 'http://127.0.0.1:8765'
    const key = env('ANKI_CONNECT_KEY')?.trim() || undefined
    const counts = await call<[string, number][]>(url, key, 'getNumCardsReviewedByDay')
    // Minutes need the review rows: cardReviews reads one deck at a time (exact deck, not its subdecks).
    // Start a day early so any time zone is covered. If this fails the cards still count, just without minutes.
    const startID = Date.parse(`${from}T00:00:00Z`) - 86_400_000
    const reviews: Review[] = []
    try {
      for (const deck of await call<string[]>(url, key, 'deckNames')) reviews.push(...(await call<Review[]>(url, key, 'cardReviews', { deck, startID })))
    } catch (e) {
      ctx.log(`no study minutes: ${(e as Error).message}`)
    }
    const days = fillDays(ankiDays(counts, reviews, tz, from), from, today, (date) => ({ date, cards: 0 }), backfilled)
    await emitDays(ctx, 'anki', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${days.length} days, ${days.reduce((s, d) => s + d.cards, 0)} cards`)
  },
}
