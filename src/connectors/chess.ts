import { createHash } from 'node:crypto'
import type { Connector, ConnectorCtx } from '@/core/types'
import { env } from '@/core/env'
import { addDays, localDate } from '@/core/time'

// Lichess and Chess.com from your public username: no key, no login. Each sync rebuilds whole days
// (games, wins, draws, losses, minutes played, rating) and emits one raw event per day and site;
// src/parsers/chess.ts turns them into the Chess hobby's minutes plus chess.* stat trackers.
// First sync backfills about 90 days; later ones the last few days.

export type ChessDay = {
  platform: 'lichess' | 'chesscom'
  date: string
  games: number; wins: number; draws: number; losses: number
  /** Minutes at the board. Chess.com: from start and end times. Lichess: estimated from the game speed. */
  minutes: number
  /** Rating at the end of the day in your main time control (the one you play most). */
  rating?: number
  control?: string
}

const UA = { 'User-Agent': 'ReLife (self-hosted life tracker; github.com/relife)' }

async function getJson<T>(url: string, accept = 'application/json'): Promise<T> {
  const res = await fetch(url, { headers: { ...UA, Accept: accept } })
  if (res.status === 404) throw new Error('Username not found. Check the spelling.')
  if (res.status === 429) throw new Error('Rate limited. It will try again next hour.')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** One event per day; the id includes the numbers, so a day re-syncs only when it changes. */
async function emitDays(ctx: ConnectorCtx, days: Iterable<ChessDay>) {
  const now = new Date()
  for (const d of days) {
    const hash = createHash('sha256').update(JSON.stringify(d)).digest('hex').slice(0, 12)
    await ctx.emit({ source: d.platform, externalId: `${d.date}:${hash}`, at: now, body: d })
  }
}

const blank = (platform: ChessDay['platform'], date: string): ChessDay => ({ platform, date, games: 0, wins: 0, draws: 0, losses: 0, minutes: 0 })

// ---------------------------------------------------------------------------------------------- Lichess

// Typical minutes per game by speed, for Lichess, whose public activity feed has no game times.
// ponytail: an estimate; switch to the games export (needs it to be reachable) for exact times.
const SPEED_MIN: Record<string, number> = { ultraBullet: 0.5, bullet: 2, blitz: 7, rapid: 20, classical: 50 }

type LichessUser = { perfs: Record<string, { games?: number; rating?: number }> }
type Activity = { interval: { start: number }; games?: Record<string, { win: number; loss: number; draw: number; rp?: { after: number } }> }[]

export const lichess: Connector = {
  id: 'lichess',
  name: 'Lichess',
  category: 'hobbies',
  description: 'Your Lichess games, wins and rating every day, from your public profile. Feeds the Chess hobby.',
  provides: ['Games', 'Win rate', 'Rating'],
  fields: [{ env: 'LICHESS_USERNAME', label: 'Lichess username', placeholder: 'magnus', hint: 'Your public username. No key or login needed.' }],
  env: ['LICHESS_USERNAME'],
  everyMinutes: 60,
  async sync(ctx) {
    const u = encodeURIComponent(env('LICHESS_USERNAME')!.trim())
    const tz = ctx.user.timezone
    const backfilled = (ctx.cursor as { backfilled?: boolean } | null)?.backfilled
    const from = addDays(localDate(new Date(), tz), backfilled ? -3 : -90)
    // The rating-history endpoint now returns nothing, so ratings come from the activity feed (the rating
    // after each day's games) plus today's rating from the profile.
    const [user, activity] = await Promise.all([
      getJson<LichessUser>(`https://lichess.org/api/user/${u}`),
      getJson<Activity>(`https://lichess.org/api/user/${u}/activity`),
    ])
    // Main control: the speed with the most games.
    const main = Object.entries(user.perfs).filter(([k]) => k in SPEED_MIN)
      .sort((a, b) => (b[1].games ?? 0) - (a[1].games ?? 0))[0]?.[0]
    const days = new Map<string, ChessDay>()
    const day = (date: string) => days.get(date) ?? days.set(date, blank('lichess', date)).get(date)!

    for (const a of activity) {
      const date = localDate(new Date(a.interval.start), tz)
      if (date < from) continue
      for (const [speed, g] of Object.entries(a.games ?? {})) {
        const d = day(date)
        const n = g.win + g.loss + g.draw
        d.games += n; d.wins += g.win; d.losses += g.loss; d.draws += g.draw
        d.minutes += Math.round(n * (SPEED_MIN[speed] ?? 0))
        if (speed === main && g.rp?.after) Object.assign(d, { rating: g.rp.after, control: main })
      }
    }
    const current = main ? user.perfs[main]?.rating : undefined
    const today = localDate(new Date(), tz)
    if (current && !days.get(today)?.rating) Object.assign(day(today), { rating: current, control: main })
    await emitDays(ctx, days.values())
    ctx.setCursor({ backfilled: true })
    ctx.log(`${days.size} days${main ? `, main control ${main}` : ''}`)
  },
}

// -------------------------------------------------------------------------------------------- Chess.com

type ComGame = {
  end_time: number; time_class: string; rated: boolean; rules: string; pgn?: string
  white: { username: string; rating: number; result: string }
  black: { username: string; rating: number; result: string }
}
const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

/** Start time from the PGN's UTCDate and UTCTime tags; null if missing. */
function startOf(pgn?: string) {
  const d = pgn?.match(/\[UTCDate "(\d{4})\.(\d{2})\.(\d{2})"\]/)
  const t = pgn?.match(/\[UTCTime "(\d{2}:\d{2}:\d{2})"\]/)
  return d && t ? Date.parse(`${d[1]}-${d[2]}-${d[3]}T${t[1]}Z`) : null
}

/** Pure: a month's games into days for one player. Exported for tests. */
export function chesscomDays(games: ComGame[], username: string, tz: string, from: string) {
  const me = username.toLowerCase()
  const mine = games.filter((g) => g.rules === 'chess' && [g.white.username, g.black.username].some((n) => n.toLowerCase() === me))
  const count = new Map<string, number>()
  for (const g of mine) count.set(g.time_class, (count.get(g.time_class) ?? 0) + 1)
  const main = [...count].filter(([c]) => c !== 'daily').sort((a, b) => b[1] - a[1])[0]?.[0]
  const days = new Map<string, ChessDay>()
  for (const g of [...mine].sort((a, b) => a.end_time - b.end_time)) {
    const end = g.end_time * 1000
    const date = localDate(new Date(end), tz)
    if (date < from) continue
    const d = days.get(date) ?? days.set(date, blank('chesscom', date)).get(date)!
    const side = g.white.username.toLowerCase() === me ? g.white : g.black
    d.games++
    if (side.result === 'win') d.wins++
    else if (DRAWS.has(side.result)) d.draws++
    else d.losses++
    const start = startOf(g.pgn)
    // Daily (correspondence) games last days; they don't count as time at the board.
    if (g.time_class !== 'daily' && start) d.minutes += Math.min(180, Math.max(0, Math.round((end - start) / 60_000)))
    if (g.rated && g.time_class === main) Object.assign(d, { rating: side.rating, control: main })
  }
  return days
}

export const chesscom: Connector = {
  id: 'chesscom',
  name: 'Chess.com',
  category: 'hobbies',
  description: 'Every Chess.com game from your public profile: minutes played, wins and rating each day. Feeds the Chess hobby.',
  provides: ['Games', 'Time played', 'Rating'],
  fields: [{ env: 'CHESSCOM_USERNAME', label: 'Chess.com username', placeholder: 'hikaru', hint: 'Your public username. No key or login needed.' }],
  env: ['CHESSCOM_USERNAME'],
  everyMinutes: 60,
  async sync(ctx) {
    const username = env('CHESSCOM_USERNAME')!.trim()
    const tz = ctx.user.timezone
    const backfilled = (ctx.cursor as { backfilled?: boolean } | null)?.backfilled
    const from = addDays(localDate(new Date(), tz), backfilled ? -3 : -90)
    const { archives } = await getJson<{ archives: string[] }>(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`)
    // Monthly archives that can hold days on or after `from`.
    const wanted = archives.filter((url) => {
      const [y, m] = url.split('/').slice(-2)
      return `${y}-${m}` >= from.slice(0, 7)
    })
    const games: ComGame[] = []
    for (const url of wanted) games.push(...(await getJson<{ games: ComGame[] }>(url)).games)
    const days = chesscomDays(games, username, tz, from)
    await emitDays(ctx, days.values())
    ctx.setCursor({ backfilled: true })
    ctx.log(`${games.length} games in ${wanted.length} month(s), ${days.size} days`)
  },
}
