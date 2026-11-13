import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { emitDays, fetchJson, rejectedAs } from './daily'
import { handleOf } from './net'

// Steam: minutes you play each day. Steam only reports lifetime playtime per game, so each sync adds up
// how much each game gained since the last one: there's no history before you connect, and the first
// day starts counting from the moment you connect. Playtime is added when a game session ends.

export type SteamDay = { date: string; minutes: number; topGame?: string }

type Owned = { response: { game_count?: number; games?: { appid: number; name?: string; playtime_forever: number }[] } }
/** Lifetime minutes per game at the last sync, and minutes per game gained today. */
type Cursor = { day?: string; games?: Record<string, number>; today?: Record<string, number>; profile?: { input: string; id: string } }

const REJECTED = 'Steam rejected the Web API key. Copy it again from steamcommunity.com/dev/apikey.'
const PRIVATE = 'Steam returned no games. Set Game details to Public in your Steam privacy settings (Steam → Profile → Edit Profile → Privacy Settings).'

async function steamId(key: string, input: string) {
  // A profile URL, a 17-digit ID (they all start 7656), or the custom name from steamcommunity.com/id/<name>.
  const id = input.match(/(7656\d{13})/)?.[1]
  if (id) return id
  const vanity = handleOf(input)
  const r = await fetchJson<{ response: { success: number; steamid?: string } }>(
    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(vanity)}`,
  ).catch(rejectedAs(REJECTED))
  if (r.response.success !== 1 || !r.response.steamid) throw new Error('Steam profile not found. Paste your profile link or 17-digit Steam ID.')
  return r.response.steamid
}

async function ownedGames(key: string, id: string) {
  const r = await fetchJson<Owned>(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${id}&include_appinfo=1&include_played_free_games=1`)
    .catch(rejectedAs(REJECTED))
  if (r.response.game_count === 0) return [] // a public profile with no games; a private one answers nothing at all
  if (!r.response.games) throw new Error(PRIVATE)
  return r.response.games
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
  async check(get) {
    const key = get('STEAM_API_KEY')!.trim()
    await ownedGames(key, await steamId(key, get('STEAM_ID')!.trim()))
  },
  async sync(ctx) {
    const key = env('STEAM_API_KEY')!.trim()
    const input = env('STEAM_ID')!.trim()
    const saved = (ctx.cursor ?? {}) as Cursor
    // Playtime counted for another profile means nothing for this one: start over when the profile changes.
    const cur: Cursor = !saved.profile || saved.profile.input === input ? saved : {}
    // Resolve a profile name once, not every sync.
    const id = cur.profile?.input === input ? cur.profile.id : await steamId(key, input)
    const games = await ownedGames(key, id)

    const today = localDate(new Date(), ctx.user.timezone)
    const now = Object.fromEntries(games.map((g) => [String(g.appid), g.playtime_forever]))
    const perGame = cur.day === today ? { ...cur.today } : {}
    for (const [app, min] of Object.entries(now)) {
      // A game new to the list (just bought) counts from now, not with its lifetime playtime.
      const gained = min - (cur.games?.[app] ?? min)
      if (gained > 0) perGame[app] = (perGame[app] ?? 0) + gained
    }
    const top = Object.entries(perGame).sort((a, b) => b[1] - a[1])[0]?.[0]
    const minutes = Object.values(perGame).reduce((s, m) => s + m, 0)
    // First sync: nothing to compare with yet, so today stays unknown rather than a false zero.
    if (cur.games) {
      const day: SteamDay = { date: today, minutes, topGame: games.find((g) => String(g.appid) === top)?.name }
      await emitDays(ctx, 'steam', [day])
    }
    ctx.setCursor({ day: today, games: now, today: perGame, profile: { input, id } } satisfies Cursor)
    ctx.log(cur.games ? `${minutes} min today` : `${games.length} games; counting starts now`)
  },
}
