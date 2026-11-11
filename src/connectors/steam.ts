import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { todayFromTotal, type TotalCursor } from '@/domain/running-total'
import { emitDays, fetchJson } from './daily'

// Steam: minutes you play each day. Steam only reports lifetime playtime per game, so each sync compares
// it with the last one (src/domain/running-total.ts): there's no history before you connect, and the
// first day starts counting from the moment you connect. Playtime is added when a game session ends.

export type SteamDay = { date: string; minutes: number; topGame?: string }

type Owned = { response: { games?: { appid: number; name?: string; playtime_forever: number }[] } }
type Cursor = { total?: TotalCursor; games?: Record<string, number>; today?: Record<string, number> }

async function steamId(key: string, input: string) {
  // A profile URL, a 17-digit ID, or the custom name from steamcommunity.com/id/<name>.
  const id = input.match(/(\d{17})/)?.[1]
  if (id) return id
  const vanity = input.replace(/\/+$/, '').split('/').at(-1)!
  const r = await fetchJson<{ response: { success: number; steamid?: string } }>(
    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(vanity)}`,
  )
  if (r.response.success !== 1 || !r.response.steamid) throw new Error('Steam profile not found. Paste your profile link or 17-digit Steam ID.')
  return r.response.steamid
}

export const steam: Connector = {
  id: 'steam',
  name: 'Steam',
  category: 'hobbies',
  description: 'Minutes you play on Steam each day and the game you played most. Counts from the day you connect.',
  provides: ['Gaming time', 'Top game'],
  fields: [
    { env: 'STEAM_API_KEY', label: 'Web API key', secret: true, hint: 'steamcommunity.com/dev/apikey (domain: localhost).' },
    { env: 'STEAM_ID', label: 'Steam profile', placeholder: 'steamcommunity.com/id/yourname', hint: 'Your profile link or Steam ID. Set Game details to Public in Steam privacy settings.' },
  ],
  env: ['STEAM_API_KEY', 'STEAM_ID'],
  everyMinutes: 30,
  async sync(ctx) {
    const key = env('STEAM_API_KEY')!.trim()
    const id = await steamId(key, env('STEAM_ID')!.trim())
    const r = await fetchJson<Owned>(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${id}&include_appinfo=1&include_played_free_games=1`)
    const games = r.response.games
    if (!games) throw new Error('Steam returned no games. Set Game details to Public in your Steam privacy settings.')

    const today = localDate(new Date(), ctx.user.timezone)
    const cur = (ctx.cursor ?? {}) as Cursor
    const total = games.reduce((s, g) => s + g.playtime_forever, 0)
    const { value, cursor } = todayFromTotal(cur.total, total, today)
    // Minutes per game today, to name the one played most.
    const now = Object.fromEntries(games.map((g) => [String(g.appid), g.playtime_forever]))
    const perGame = cur.total?.day === today ? { ...cur.today } : {}
    for (const [app, min] of Object.entries(now)) {
      const gained = min - (cur.games?.[app] ?? min)
      if (gained > 0) perGame[app] = (perGame[app] ?? 0) + gained
    }
    const top = Object.entries(perGame).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (value != null) {
      const day: SteamDay = { date: today, minutes: value, topGame: games.find((g) => String(g.appid) === top)?.name }
      await emitDays(ctx, 'steam', [day])
    }
    ctx.setCursor({ total: cursor, games: now, today: perGame } satisfies Cursor)
    ctx.log(value == null ? `${games.length} games; counting starts now` : `${value} min today`)
  },
}
