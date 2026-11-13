import type { Connector, ConnectorCtx } from '@/core/types'
import { env } from '@/core/env'
import { addDays, localDate } from '@/core/time'
import { emitDays, fetchJson, fillDays, syncWindow } from './daily'
import { fetchT, handleOf } from './net'

// Lichess and Chess.com from your public username: no key, no login. Each sync rebuilds whole days
// (games, wins, draws, losses, minutes played, rating) and emits one raw event per day and site;
// src/parsers/chess.ts turns them into the Chess hobby's minutes plus chess.* stat trackers.
// First sync backfills about 90 days; later ones the last few days.

export type ChessDay = {
  platform: 'lichess' | 'chesscom'
  date: string
  games: number; wins: number; draws: number; losses: number
  /** Minutes at the board, from each game's start and end times. */
  minutes: number
  /** Rating at the end of the day in your main time control (the one you play most). */
  rating?: number
  control?: string
}

const UA = { 'User-Agent': 'ReLife (self-hosted life tracker; github.com/relife)' }

const notFound = (site: string, u: string) => `No ${site} user “${u}”. Check the username.`

async function getRes(url: string, accept: string, missing: string, ms?: number) {
  const res = await fetchT(url, { headers: { ...UA, Accept: accept } }, ms)
  if (res.status === 404) throw new Error(missing)
  if (res.status === 429) throw new Error('Rate limited. It will try again next hour.')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}
const getJson = <T>(url: string, missing: string) => fetchJson<T>(url, { headers: UA }, missing)

const SPEED_NAMES: Record<string, true> = { ultraBullet: true, bullet: true, blitz: true, rapid: true, classical: true }

const blank = (platform: ChessDay['platform'], date: string): ChessDay => ({ platform, date, games: 0, wins: 0, draws: 0, losses: 0, minutes: 0 })

// ---------------------------------------------------------------------------------------------- Lichess

type LichessUser = { id: string; disabled?: boolean; tosViolation?: boolean; perfs?: Record<string, { games?: number; rating?: number }> }
type LichessGame = {
  createdAt: number; lastMoveAt: number; status: string; winner?: 'white' | 'black'; perf: string; speed: string; rated?: boolean
  players: Record<'white' | 'black', { user?: { id: string }; rating?: number; ratingDiff?: number }>
}

// Games that never started, or were abandoned before a move, are not games played.
const UNPLAYED = new Set(['created', 'started', 'aborted', 'noStart', 'unknownFinish'])
// A game's wall-clock length; a stuck clock or a correspondence game shouldn't count as hours at the board.
const MAX_GAME_MIN = 180
// Fewer than this many games a sync would take minutes at Lichess's streaming speed (about 20 games a second).
const FIRST_SYNC_GAMES = 1500
const SYNC_GAMES = 400

/**
 * Pure: a user's Lichess games (any order) into days in their time zone. `main` is the time control whose
 * rating is tracked. The rating after a game is its rating before plus the change. Exported for tests.
 */
export function lichessDays(games: LichessGame[], me: string, main: string | undefined, tz: string, from: string) {
  const days = new Map<string, ChessDay>()
  for (const g of [...games].sort((a, b) => a.lastMoveAt - b.lastMoveAt)) {
    if (UNPLAYED.has(g.status)) continue
    const side = (['white', 'black'] as const).find((c) => g.players[c]?.user?.id === me)
    if (!side) continue
    const date = localDate(new Date(g.lastMoveAt), tz)
    if (date < from) continue
    const d = days.get(date) ?? days.set(date, blank('lichess', date)).get(date)!
    d.games++
    if (g.winner === side) d.wins++
    else if (g.winner) d.losses++
    else d.draws++
    if (g.speed !== 'correspondence') d.minutes += Math.min(MAX_GAME_MIN, Math.max(0, Math.round((g.lastMoveAt - g.createdAt) / 60_000)))
    const p = g.players[side]
    if (g.rated && g.perf === main && p.rating != null) Object.assign(d, { rating: p.rating + (p.ratingDiff ?? 0), control: main })
  }
  return days
}

/** Lichess keeps closed accounts at HTTP 200 with no ratings. */
function lichessProfile(u: string) {
  return getJson<LichessUser>(`https://lichess.org/api/user/${u}`, notFound('Lichess', decodeURIComponent(u))).then((p) => {
    if (p.disabled || p.tosViolation || !p.perfs) throw new Error(`The Lichess account “${decodeURIComponent(u)}” is closed.`)
    return p
  })
}

export const lichess: Connector = {
  id: 'lichess',
  name: 'Lichess',
  category: 'hobbies',
  description: 'Your Lichess games, wins, minutes played and rating every day, from your public profile. Feeds the Chess hobby.',
  provides: ['Games', 'Time played', 'Rating'],
  fields: [{ env: 'LICHESS_USERNAME', label: 'Lichess username', placeholder: 'DrNykterstein', hint: 'Your public username, from lichess.org/@/<name>. No key or login needed.' }],
  env: ['LICHESS_USERNAME'],
  everyMinutes: 60,
  async check(get) {
    await lichessProfile(encodeURIComponent(handleOf(get('LICHESS_USERNAME'))))
  },
  async sync(ctx) {
    const u = encodeURIComponent(handleOf(env('LICHESS_USERNAME')))
    const tz = ctx.user.timezone
    // v2: games export. Older cursors (activity feed, UTC days) get one fresh 90-day rebuild that overwrites them.
    const prev = ctx.cursor as { backfilled?: boolean; v?: number } | null
    const backfilled = prev?.backfilled && prev.v === 2
    const today = localDate(new Date(), tz)
    let from = addDays(today, backfilled ? -3 : -90)
    const user = await lichessProfile(u)
    // Main control: the speed with the most games.
    const main = Object.entries(user.perfs!).filter(([k]) => k in SPEED_NAMES)
      .sort((a, b) => (b[1].games ?? 0) - (a[1].games ?? 0))[0]?.[0]
    // The games export has each game's real start and end (the activity feed groups by UTC day, keeps seven days
    // and has no times). Newest first; a day at the cap may be cut short, so it is dropped.
    const max = backfilled ? SYNC_GAMES : FIRST_SYNC_GAMES
    const since = Date.parse(`${addDays(from, -1)}T00:00:00Z`) // a day early covers any time zone
    const res = await getRes(`https://lichess.org/api/games/user/${u}?since=${since}&max=${max}&moves=false&tags=false&sort=dateDesc`, 'application/x-ndjson', notFound('Lichess', decodeURIComponent(u)), 120_000)
    const games = (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as LichessGame)
    // Never past today: a cap hit by today's games alone keeps today (maybe short) instead of zeroing it.
    if (games.length >= max) from = [addDays(localDate(new Date(games.at(-1)!.lastMoveAt), tz), 1), today].sort()[0]
    // Days without games are sent as zero, so a day the old activity feed credited wrongly is corrected. A first
    // ever sync starts at the first day with games.
    const days = new Map(fillDays(lichessDays(games, user.id, main, tz, from).values(), from, today, (d) => blank('lichess', d), !!prev).map((d) => [d.date, d]))
    const current = main ? user.perfs![main]?.rating : undefined
    if (current && !days.get(today)?.rating) Object.assign(days.get(today) ?? days.set(today, blank('lichess', today)).get(today)!, { rating: current, control: main })
    await emitDays(ctx, (d) => d.platform, days.values())
    ctx.setCursor({ backfilled: true, v: 2 })
    ctx.log(`${games.length} games, ${days.size} days${main ? `, main control ${main}` : ''}${games.length >= max ? `, stopped at ${max} games (from ${from})` : ''}`)
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
  fields: [{ env: 'CHESSCOM_USERNAME', label: 'Chess.com username', placeholder: 'hikaru', hint: 'Your public username, from chess.com/member/<name>. No key or login needed.' }],
  env: ['CHESSCOM_USERNAME'],
  everyMinutes: 60,
  async check(get) {
    const u = handleOf(get('CHESSCOM_USERNAME'))
    await getJson(`https://api.chess.com/pub/player/${encodeURIComponent(u.toLowerCase())}`, notFound('Chess.com', u))
  },
  async sync(ctx) {
    const username = handleOf(env('CHESSCOM_USERNAME'))
    const { tz, from } = syncWindow(ctx, 91)
    const { archives } = await getJson<{ archives: string[] }>(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`, notFound('Chess.com', username))
    // Monthly archives that can hold days on or after `from`.
    const wanted = archives.filter((url) => {
      const [y, m] = url.split('/').slice(-2)
      return `${y}-${m}` >= from.slice(0, 7)
    })
    const games: ComGame[] = []
    for (const url of wanted) games.push(...(await getJson<{ games: ComGame[] }>(url, notFound('Chess.com', username))).games)
    const days = chesscomDays(games, username, tz, from)
    await emitDays(ctx, (d) => d.platform, days.values())
    ctx.setCursor({ backfilled: true })
    ctx.log(`${games.length} games in ${wanted.length} month(s), ${days.size} days`)
  },
}
