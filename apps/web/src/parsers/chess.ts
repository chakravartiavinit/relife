import type { Parser, Rec } from '@/core/types'
import type { ChessDay } from '@/connectors/chess'
import { asObj } from './util'

const SITE = { lichess: 'Lichess', chesscom: 'Chess.com' } as const

/**
 * A day of chess from Lichess or Chess.com. Minutes go into the "chess" hobby (the same tracker as
 * "chess 30" typed by hand, summed per source); games, wins and rating get their own chess.* trackers,
 * which the Hobbies page shows on the Chess card. Latest sync of a day wins.
 */
export const chess: Parser = {
  id: 'chess',
  match: (e) => e.source === 'lichess' || e.source === 'chesscom',
  parse: (e) => {
    const d = asObj(e) as unknown as ChessDay
    const src = e.source as keyof typeof SITE
    const base = { kind: 'entry' as const, date: d.date, source: src, verified: true }
    const out: Rec[] = [
      { ...base, tracker: 'chess', value: d.minutes, defaults: { name: 'Chess', category: 'hobbies', kind: 'duration', unit: 'min', direction: 'up' } },
      { ...base, tracker: 'chess.games', value: d.games, defaults: { name: 'Chess games', category: 'hobbies', kind: 'number' } },
      { ...base, tracker: 'chess.wins', value: d.wins, defaults: { name: 'Chess wins', category: 'hobbies', kind: 'number', direction: 'up' } },
    ]
    if (d.rating) {
      out.push({
        ...base, tracker: `chess.rating-${src}`, value: d.rating, meta: { control: d.control },
        // The next hundred is the first goal, so the rating counts as "higher is better" for quests and patterns.
        defaults: { name: `${SITE[src]} rating`, category: 'hobbies', kind: 'number', aggregate: 'last', direction: 'up', target: Math.floor(d.rating / 100) * 100 + 100 },
      })
    }
    return out
  },
}
