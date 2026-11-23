import { cache } from 'react'
import type { AreaDef } from '@/core/areas'
import { loadPatterns } from '@/core/patterns'
import type { User } from '@/core/user'
import type { Change, Link } from '@/domain/patterns'

// What an area page says about how its numbers connect, from the same `findLinks` / `findChanges` the Coach uses. Read
// once per request (the lead card, the rail and Trends share it); nothing is made up: an area with none shows none.

export type Pattern = { link: Link } | { change: Change }

const read = cache((_userId: string, user: User) => loadPatterns(user))

const involves = (p: Pattern, signalId: string) => ('change' in p ? p.change.signal.id === signalId : p.link.a.id === signalId || p.link.b.id === signalId)

/** The patterns that belong to an area: its own changes this week, then links where either side is one of its signals. */
export async function areaPatterns(user: User, def: AreaDef): Promise<Pattern[]> {
  const p = await read(user.id, user)
  return [
    ...p.changes.filter((c) => c.signal.area === def.category).map((change) => ({ change })),
    ...p.links.filter((l) => l.a.area === def.category || l.b.area === def.category).map((link) => ({ link })),
  ]
}

/** The pattern that explains a signal: its change this week, else the strongest link with it. */
export const explaining = (all: Pattern[], signalId: string): Pattern | null => all.find((p) => 'change' in p && involves(p, signalId)) ?? all.find((p) => involves(p, signalId)) ?? null

export const patternKey = (p: Pattern) => ('change' in p ? `change:${p.change.signal.id}` : `link:${p.link.a.id}|${p.link.b.id}`)
