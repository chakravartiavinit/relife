import type { Parser, Rec } from '@/core/types'
import type { CpDay } from '@/connectors/competitive'
import { asObj } from './util'

const SITE = { codeforces: 'Codeforces', atcoder: 'AtCoder', codechef: 'CodeChef', leetcode: 'LeetCode' } as const

/**
 * A day of competitive programming. Problems solved and submissions add up across sites (one entry
 * per site and day); each site keeps its own rating tracker. Latest sync of a day wins.
 */
export const competitive: Parser = {
  id: 'competitive',
  match: (e) => e.source in SITE,
  parse: (e) => {
    const d = asObj(e) as unknown as CpDay
    const src = e.source as keyof typeof SITE
    const base = { kind: 'entry' as const, date: d.date, source: src, verified: true }
    const out: Rec[] = [{ ...base, tracker: 'cp.submissions', value: d.submissions, defaults: { name: 'Submissions', category: 'skills', kind: 'number' } }]
    // LeetCode can't always tell how many were solved on older days; leave those days as they are.
    if (d.solved != null) out.unshift({ ...base, tracker: 'cp.solved', value: d.solved, defaults: { name: 'Problems solved', category: 'skills', kind: 'number', direction: 'up', target: 1 } })
    if (d.rating) {
      out.push({
        ...base, tracker: `cp.rating-${src}`, value: d.rating,
        // The next hundred is the first goal, so the rating counts as "higher is better" for quests and patterns.
        defaults: { name: `${SITE[src]} rating`, category: 'skills', kind: 'number', aggregate: 'last', direction: 'up', target: Math.floor(d.rating / 100) * 100 + 100 },
      })
    }
    return out
  },
}
