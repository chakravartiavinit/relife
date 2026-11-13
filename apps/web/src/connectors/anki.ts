import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { isLocalHost } from '@/core/safe-fetch'
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

/**
 * Pure: review rows into days. Only real answers count (types 0–3 with a button pressed): "set due date" and
 * reschedule rows (types 4 and 5) can be thousands at once and aren't study. Without rows (`null`: reading them
 * failed) Anki's own per-day counts stand in, without minutes. Exported for tests.
 */
export function ankiDays(counts: [string, number][], reviews: Review[] | null, tz: string, from: string): AnkiDay[] {
  if (!reviews) return counts.filter(([date]) => date >= from).map(([date, cards]) => ({ date, cards }))
  const days = new Map<string, { cards: number; ms: number }>()
  for (const r of reviews) {
    if (!(r[8] >= 0 && r[8] <= 3 && r[3] > 0)) continue
    const date = localDate(new Date(r[0]), tz)
    if (date < from) continue
    const d = days.get(date) ?? { cards: 0, ms: 0 }
    d.cards++
    d.ms += r[7] ?? 0
    days.set(date, d)
  }
  return [...days].map(([date, d]) => ({ date, cards: d.cards, minutes: Math.round(d.ms / 60_000) }))
}

/** The address as typed: `localhost:8765` gets its http://, a trailing slash goes. */
const ankiUrl = (typed?: string) => {
  const t = typed?.trim().replace(/\/+$/, '')
  return t ? (/^https?:\/\//i.test(t) ? t : `http://${t}`) : 'http://127.0.0.1:8765'
}

/** The one answer for anything that is not AnkiConnect: what a wrong address did (status, body) is not echoed back. */
const NOT_ANKI = 'That address is not AnkiConnect. Check the address.'

async function call<T>(url: string, key: string | undefined, action: string, params: object = {}) {
  // AnkiConnect runs on this computer (or your home network), and the address is typed by a person: refuse a public host,
  // so the app cannot be pointed at someone else's server, and never follow a redirect elsewhere.
  let u: URL
  try { u = new URL(url) } catch { throw new Error(NOT_ANKI) }
  if (!/^https?:$/.test(u.protocol) || !(await isLocalHost(u.hostname))) throw new Error('AnkiConnect must be on this computer or your home network. Use an address like http://127.0.0.1:8765.')
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', body: JSON.stringify({ action, version: 6, params, ...(key ? { key } : {}) }), redirect: 'error', signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new Error(NOT_OPEN)
  }
  if (!res.ok) throw new Error(NOT_ANKI)
  const body = (await res.json().catch(() => null)) as Reply<T> | null
  if (!body || typeof body !== 'object' || !('error' in body)) throw new Error(NOT_ANKI)
  if (body.error) throw new Error(/api key/i.test(body.error) ? 'AnkiConnect rejected the key. Check the API key set in the add-on config.' : `AnkiConnect: ${String(body.error).slice(0, 100)}`)
  return body.result
}

/** Marks the message of an Anki that isn't running: not a typo, so saving the address is fine. */
const isNotOpen = (e: unknown) => (e as Error).message === NOT_OPEN

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
  async check(get) {
    // Anki is often closed when you connect, and that is fine: only a wrong address or key is a problem to fix now.
    await call(ankiUrl(get('ANKI_CONNECT_URL')), get('ANKI_CONNECT_KEY')?.trim() || undefined, 'version').catch((e) => { if (!isNotOpen(e)) throw e })
  },
  async sync(ctx) {
    const { tz, today, from, backfilled } = syncWindow(ctx, 90)
    const url = ankiUrl(env('ANKI_CONNECT_URL'))
    const key = env('ANKI_CONNECT_KEY')?.trim() || undefined
    const counts = await call<[string, number][]>(url, key, 'getNumCardsReviewedByDay')
    // Review rows: cardReviews reads one deck at a time (exact deck, not its subdecks). Start a day early so any
    // time zone is covered. If this fails, Anki's own counts stand in, without minutes.
    const startID = Date.parse(`${from}T00:00:00Z`) - 86_400_000
    let reviews: Review[] | null = []
    try {
      for (const deck of await call<string[]>(url, key, 'deckNames')) reviews.push(...(await call<Review[]>(url, key, 'cardReviews', { deck, startID })))
    } catch (e) {
      reviews = null
      ctx.log(`no review rows, using Anki's counts: ${(e as Error).message}`)
    }
    const days = fillDays(ankiDays(counts, reviews, tz, from), from, today, (date) => ({ date, cards: 0 }), backfilled)
    await emitDays(ctx, 'anki', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${days.length} days, ${days.reduce((s, d) => s + d.cards, 0)} cards`)
  },
}
