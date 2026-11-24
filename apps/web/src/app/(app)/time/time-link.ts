import { loadSignals } from '@/core/patterns'
import type { User } from '@/core/user'
import { findChanges, findLinks, type Change, type Link, type Signal } from '@/domain/patterns'

/** The laptop's own daily numbers: what the extension rolls up into trackers (`screen.work`, `screen.social`, `learning.minutes`...). */
const fromLaptop = (s: Signal) => s.id.startsWith('tracker:screen.') || s.id === 'tracker:learning.minutes'

/**
 * The one connection Time shows, or null: the strongest link that has a laptop number on one side (sleep → next-day
 * deep work), else this week's biggest change in a laptop number with its partners. Never made up: only what
 * `findLinks` / `findChanges` return.
 */
export async function timeConnection(user: User): Promise<({ link: Link } | { change: Change }) & { today: string } | null> {
  const { today, signals } = await loadSignals(user)
  const links = findLinks(signals)
  const link = links.find((l) => fromLaptop(l.a) || fromLaptop(l.b))
  if (link) return { link, today }
  const change = findChanges(signals, links, today).find((c) => fromLaptop(c.signal))
  return change ? { change, today } : null
}
