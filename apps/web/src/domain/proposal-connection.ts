import type { Change, Link, Signal } from './patterns'

// Which connection, if any, a proposal stands on. The cards are written from the same facts `findLinks` and
// `findChanges` compute, but they do not store which one, so this matches by what the card says: a link when its text
// names both signals, a change when it names the changed signal (and has a partner to show). Nothing qualifies, nothing
// is shown, and a connection is never made up. Pure.

// Words too common to say a card is about a signal.
const GENERIC = new Set(['done', 'routine', 'routines', 'total', 'daily', 'count', 'late', 'with', 'time'])

const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w)
const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/**
 * A signal is mentioned when every word of its name that says something (4+ letters, not generic) appears in the text,
 * compared by stem. "Delivery app spending" needs both "delivery" and "spending"; "work" alone never names "Deep work".
 */
function mentions(text: Set<string>, s: Signal): boolean {
  const own = words(s.name).filter((w) => w.length >= 4 && !GENERIC.has(w))
  if (!own.length) return false
  const stems = new Set([...text].map(stem))
  return own.every((w) => stems.has(stem(w)))
}

export type ProposalConnection = { link: Link } | { change: Change }

export function connectionForText(text: string, links: Link[], changes: Change[]): ProposalConnection | null {
  const bag = new Set(words(text))
  const link = links.find((l) => mentions(bag, l.a) && mentions(bag, l.b))
  if (link) return { link }
  const change = changes.find((c) => c.with.length > 0 && mentions(bag, c.signal))
  return change ? { change } : null
}
