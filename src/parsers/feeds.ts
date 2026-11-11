import type { Parser, Rec, TrackerDefaults } from '@/core/types'
import type { LetterboxdDay } from '@/connectors/letterboxd'
import type { BooksDay } from '@/connectors/openlibrary'
import type { AnkiDay } from '@/connectors/anki'
import { asObj } from './util'

// Days from the public-feed and local-app connectors (src/connectors/feeds.ts), shaped like src/parsers/daily.ts:
// each day becomes tracker entries and the latest sync of a day wins.

type Entry = { tracker: string; value: number | undefined; defaults: TrackerDefaults; meta?: Record<string, unknown> }

const DAYS: Record<string, (b: Record<string, unknown>) => Entry[]> = {
  // Films are time spent, not practice: no target, no unit, so no hobby XP (core/xp.ts counts only minutes).
  letterboxd: (b) => {
    const d = b as LetterboxdDay
    return [{ tracker: 'films.watched', value: d.films, meta: { titles: d.titles, rating: d.rating }, defaults: { name: 'Films watched', category: 'hobbies', kind: 'number' } }]
  },
  openlibrary: (b) => {
    const d = b as BooksDay
    return [{ tracker: 'books.read', value: d.books, meta: { titles: d.titles }, defaults: { name: 'Books read', category: 'mind', kind: 'number', direction: 'up' } }]
  },
  anki: (b) => {
    const d = b as AnkiDay
    return [
      { tracker: 'anki.cards', value: d.cards, defaults: { name: 'Anki cards', category: 'skills', kind: 'number', unit: 'cards', direction: 'up', target: 20 } },
      { tracker: 'anki.minutes', value: d.minutes, defaults: { name: 'Anki study time', category: 'skills', kind: 'duration', unit: 'min', direction: 'up' } },
    ]
  },
}

export const feeds: Parser = {
  id: 'feeds',
  match: (e) => Object.hasOwn(DAYS, e.source),
  parse: (e) => {
    const b = asObj(e)
    const date = String(b.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
    return DAYS[e.source](b).filter((x) => Number.isFinite(x.value)).map((x): Rec => ({
      kind: 'entry', tracker: x.tracker, date, value: x.value!, source: e.source, verified: true,
      ...(x.meta && Object.values(x.meta).some((v) => v != null) ? { meta: x.meta } : {}), defaults: x.defaults,
    }))
  },
}
