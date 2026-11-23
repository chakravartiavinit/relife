import { addDays } from '@/core/time'
import type { PeekRef } from './peek'
import { describeChange, describeLink, formatValue, type Change, type Link, type Signal } from './patterns'
import { statusOf, type Status } from './status-of'

// What a Connection card shows, worked out from a `Link` or a `Change` of `domain/patterns.ts`. The sentence is
// `describeLink` / `describeChange` unchanged; this only marks its key figures for bold, names the pair, says when it
// holds, and gives the caption, the Peek to open and (given today) the two lines for a sparkline. Pure.

export type SentencePart = { text: string; bold: boolean }

export type ConnectionView = {
  variant: 'link' | 'change'
  /** "Routines done and sleep". */
  pair: string
  /** "next day", "same day" or "this week". */
  when: string
  /** The short name of each signal (`Routines done`, `Sleep`), for labels on the sparkline. */
  names: string[]
  /** The area of each signal (`mind`, `health`...), for the two marks. A change with no partner has one. */
  areas: string[]
  /** The describe text as parts; the key figures are bold. Joined, it is exactly the describe text. */
  parts: SentencePart[]
  /** "From 42 days of data" or "This week against the 4 before". */
  caption: string
  /** A change also says Slipping or Ahead (null for a link, or a change whose direction is neither). */
  status: Status | null
  /** "See the days": the tracker's metric Peek (the effect of a link, the changed signal of a change), if one is a tracker. */
  peek: PeekRef | null
  /** The last 28 days of both signals (b is null for a change with no partner), for the two-line sparkline; for a change `weekFrom` is where this week starts in them. */
  lines: { a: (number | null)[]; b: (number | null)[] | null; weekFrom: number | null } | null
}

const PEEK_DAYS = 28

/** Split `text` after its first colon so each of `figures`, in order, is a bold part. */
function mark(text: string, figures: string[]): SentencePart[] {
  const parts: SentencePart[] = []
  let at = 0
  let cursor = Math.max(0, text.indexOf(':')) + 1
  for (const f of figures) {
    const i = text.indexOf(f, cursor)
    if (i < 0) continue
    if (i > at) parts.push({ text: text.slice(at, i), bold: false })
    parts.push({ text: f, bold: true })
    at = cursor = i + f.length
  }
  if (at < text.length) parts.push({ text: text.slice(at), bold: false })
  return parts
}

const metricPeek = (s: Signal): PeekRef | null => (s.id.startsWith('tracker:') ? { type: 'metric', id: s.id.slice('tracker:'.length) } : null)

const column = (s: Signal, from: string, days: number) => Array.from({ length: days }, (_, i) => s.days.get(addDays(from, i)) ?? null)

export function connectionView(src: { link: Link } | { change: Change }, opts: { today?: string } = {}): ConnectionView {
  const { today } = opts
  if ('link' in src) {
    const l = src.link
    const from = today ? addDays(today, -(PEEK_DAYS - 1)) : null
    return {
      variant: 'link',
      pair: `${l.a.name} and ${l.b.name.toLowerCase()}`,
      when: l.lag ? 'next day' : 'same day',
      names: [l.a.name, l.b.name],
      areas: [l.a.area, l.b.area],
      parts: mark(describeLink(l), [formatValue(l.high, l.b.unit), formatValue(l.low, l.b.unit)]),
      caption: `From ${l.n} days of data`,
      status: null,
      // The effect is what moved; the cause is a routine or a spend that has no Peek of its own.
      peek: metricPeek(l.b) ?? metricPeek(l.a),
      lines: from ? { a: column(l.a, from, PEEK_DAYS), b: column(l.b, from, PEEK_DAYS), weekFrom: null } : null,
    }
  }
  const c = src.change
  const partner = c.with[0]?.signal
  const from = today ? addDays(today, -(PEEK_DAYS - 1)) : null
  const word = statusOf({ from: 'change', change: c }).word
  return {
    variant: 'change',
    pair: partner ? `${c.signal.name} and ${partner.name.toLowerCase()}` : c.signal.name,
    when: 'this week',
    names: partner ? [c.signal.name, partner.name] : [c.signal.name],
    areas: partner ? [c.signal.area, partner.area] : [c.signal.area],
    parts: mark(describeChange(c), [formatValue(c.recent, c.signal.unit), formatValue(c.usual, c.signal.unit)]),
    caption: 'This week against the 4 before',
    status: word === 'Steady' ? null : word,
    peek: metricPeek(c.signal),
    lines: from ? { a: column(c.signal, from, PEEK_DAYS), b: partner ? column(partner, from, PEEK_DAYS) : null, weekFrom: PEEK_DAYS - 7 } : null,
  }
}
