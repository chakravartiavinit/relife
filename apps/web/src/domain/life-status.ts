import type { Change, Link } from './patterns'
import { statusOf, type Status } from './status-of'

// What Today and Life say about the areas together, pure: each area's status word from the week's changes and its
// headline numbers, the opening sentence across areas, the balance word, the cross-area connections to show and the
// one link worth a card on Today. Nothing here is new maths: a status names what `findChanges` or an area's own
// numbers already say, and a connection is only ever a `Link` or `Change` the app computed.

/** Joins names the way a sentence does: `A`, `A and B`, `A, B and C`. */
export const joinNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/** The changes of one area (the routines signal belongs to none), the biggest first. */
export const changesOf = (changes: Change[], area: string) => changes.filter((c) => c.signal.id !== 'routines' && c.signal.area === area).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))

/**
 * One area's word. The biggest change this week names it when the signal has a better direction (Ahead or Slipping);
 * otherwise its headline numbers do: any bad one is Slipping, a good one with none bad is On track, numbers that say
 * nothing are Steady, and no numbers at all is Quiet.
 */
export function areaStatus(p: { changes: Change[]; tones: (string | undefined)[]; hasData: boolean }): Status {
  const top = p.changes[0]
  const fromChange = top ? statusOf({ from: 'change', change: top }).word : null
  if (fromChange && fromChange !== 'Steady') return fromChange
  if (!p.hasData) return 'Quiet'
  if (p.tones.includes('bad')) return 'Slipping'
  if (p.tones.includes('good')) return 'On track'
  return 'Steady'
}

/** Spending today against a usual day: nothing yet is Quiet, under it On track, over it Steady, far over Slipping. */
export function spendStatus(spent: number, usualDay: number | null): Status {
  if (spent <= 0) return 'Quiet'
  if (!usualDay) return 'Steady'
  return spent > usualDay * 1.5 ? 'Slipping' : spent <= usualDay ? 'On track' : 'Steady'
}

/** "Health and Mind slipped together this week. Skills and Hobbies are ahead." Quiet when nothing moved. */
export function lifeOpening(areas: { title: string; status: Status }[]): string {
  const names = (...s: Status[]) => areas.filter((a) => s.includes(a.status)).map((a) => a.title)
  const slipped = names('Slipping', 'Behind')
  const ahead = names('Ahead')
  const parts = [
    slipped.length === 1 ? `${slipped[0]} slipped this week.` : slipped.length ? `${joinNames(slipped)} slipped together this week.` : '',
    ahead.length ? `${joinNames(ahead)} ${ahead.length === 1 ? 'is' : 'are'} ahead.` : '',
  ].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return areas.every((a) => a.status === 'Quiet') ? 'Nothing logged in your areas yet this week.' : 'Every area is steady this week.'
}

/** The balance card's word: all six hit is Ahead, none yet Quiet, at least the share of the week gone On track, else Behind. */
export function balanceStatus(p: { hit: number; count: number; elapsed: number }): Status {
  if (p.count > 0 && p.hit >= p.count) return 'Ahead'
  if (p.hit === 0) return 'Quiet'
  return p.hit >= p.count * (p.elapsed / 7) ? 'On track' : 'Behind'
}

export type Connected = { link: Link } | { change: Change }

/**
 * Up to `max` connections that cross areas: the biggest change with a partner (whose partner is in another area), then
 * the strongest link between two areas, then whatever else qualifies. Never anything the app did not compute.
 */
export function crossAreaConnections(p: { links: Link[]; changes: Change[] }, max = 2): Connected[] {
  const changes = p.changes.filter((c) => c.with.some((w) => w.signal.area !== c.signal.area)).map((change): Connected => ({ change }))
  const links = p.links.filter((l) => l.a.area !== l.b.area).map((link): Connected => ({ link }))
  const out: Connected[] = []
  for (let i = 0; i < Math.max(changes.length, links.length) && out.length < max; i++) {
    if (changes[i]) out.push(changes[i])
    if (links[i] && out.length < max) out.push(links[i])
  }
  return out
}

/** The link Today's rail shows: routines done against the next day first (what Today is about), else the strongest one. */
export const worthKnowing = (links: Link[]): Link | undefined => links.find((l) => l.a.id === 'routines') ?? links[0]

/** The change Today's Life pulse shows: the biggest one with a partner, else the biggest one. */
export const pulseChange = (changes: Change[]): Change | undefined => changes.find((c) => c.with.length) ?? changes[0]
