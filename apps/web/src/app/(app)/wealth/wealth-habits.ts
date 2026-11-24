import { cache } from 'react'
import { loadPatterns } from '@/core/patterns'
import { questBoard } from '@/core/quests'
import type { User } from '@/core/user'
import type { Change, Link } from '@/domain/patterns'

// What the Wealth pages tie their numbers to, read once per request: the one connection about money that qualifies
// (`findChanges` / `findLinks` through `loadPatterns`, never invented) and this week's money quest.

const isWealth = (s: { area: string }) => s.area === 'wealth'

export type WealthHabits = {
  change: Change | null
  link: Link | null
  quest: { key: string; title: string; progress: number; target: number; done: boolean } | null
  /** Each wealth signal's change this week, by signal id, so a habit row can carry the status the rule found. */
  changes: Change[]
}

export const wealthHabits = cache(async (user: User): Promise<WealthHabits> => {
  const [patterns, board] = await Promise.all([loadPatterns(user), questBoard(user)])
  const changes = patterns.changes.filter((c) => isWealth(c.signal))
  const q = board.weekly.find((w) => w.area === 'wealth')
  return {
    change: changes[0] ?? null,
    link: patterns.links.find((l) => isWealth(l.a) || isWealth(l.b)) ?? null,
    quest: q ? { key: q.key, title: q.title, progress: q.progress, target: q.target, done: q.done } : null,
    changes,
  }
})
