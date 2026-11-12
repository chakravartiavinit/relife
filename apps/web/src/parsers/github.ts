import type { Parser, Rec } from '@/core/types'
import { asObj } from './util'

const FIELDS = [
  ['commits', 'github.commits', 'Commits'],
  ['prs', 'github.prs', 'Pull requests'],
  ['reviews', 'github.reviews', 'Code reviews'],
  ['issues', 'github.issues', 'Issues'],
] as const

/** Daily contribution counts from the GitHub connector. Latest sync of a day wins. */
export const github: Parser = {
  id: 'github',
  match: (e) => e.source === 'github',
  parse: (e) => {
    const b = asObj(e)
    const date = String(b.date)
    return FIELDS.map(([key, tracker, name]): Rec => ({
      kind: 'entry', tracker, date, value: Number(b[key] ?? 0), source: 'github', verified: true,
      defaults: { name, category: 'skills', kind: 'number', direction: 'up' },
    }))
  },
}
