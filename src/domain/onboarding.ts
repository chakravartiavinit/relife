import { isInline } from './connections'

// Pure rules for setup (/welcome): which sources the Connect step offers, which routines start ticked and the
// half-hour choices for the usual hours. No DB, no React.

type Source = {
  id: string
  name: string
  section: string
  category?: string
  connected: boolean
  fields: { secret?: boolean }[]
  oauth?: unknown
  login?: boolean
}

/** Rows on the Connect step. */
export const MAX_SOURCES = 6

/** How a source connects during setup: one field here, the connect dialog, or later (sign-in and browser login leave setup). */
export type ConnectHow = 'inline' | 'dialog' | 'later'
export const connectHow = (c: Source): ConnectHow => (isInline(c) ? 'inline' : c.oauth || c.login ? 'later' : 'dialog')

const EFFORT: Record<ConnectHow, number> = { inline: 0, dialog: 1, later: 2 }
const rank = (c: Source) => EFFORT[connectHow(c)] + (c.connected ? 10 : 0)

/**
 * The sources Connect offers for the picked areas: the cheapest first (a username, then a key, then the ones that
 * need a sign-in), spread across the areas so one area does not take every row, then Telegram last for reminders.
 * Already connected ones sink, so a row is never spent on what is done.
 */
export function pickSources<T extends Source>(items: T[], areas: string[], max = MAX_SOURCES): T[] {
  const telegram = items.find((c) => c.id === 'telegram')
  const room = telegram ? max - 1 : max
  const lanes = areas.map((a) => items.filter((c) => c.section !== 'ai' && c.section !== 'messaging' && c.category === a)
    .sort((x, y) => rank(x) - rank(y) || x.name.localeCompare(y.name)))
  const out: T[] = []
  for (let k = 0; out.length < room && lanes.some((l) => k < l.length); k++) {
    for (const l of lanes) if (k < l.length && out.length < room) out.push(l[k])
  }
  return telegram ? [...out, telegram] : out
}

/** The suggested routines that start ticked: the first few, for the picked areas, that the user does not have yet. */
export const startersOn = (list: { id: string; name: string; suggested?: boolean }[], existing: string[], n = 3) =>
  list.filter((t) => t.suggested && !existing.includes(t.name.toLowerCase())).slice(0, n).map((t) => t.id)

/** Every half hour as "HH:MM", with the current value added when it is between two (an older saved quiet-hours time). */
export function halfHours(current?: string) {
  const all = Array.from({ length: 48 }, (_, k) => `${String(Math.floor(k / 2)).padStart(2, '0')}:${k % 2 ? '30' : '00'}`)
  return current && !all.includes(current) ? [...all, current].sort() : all
}
