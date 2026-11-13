import { latestBrief } from '../briefs'
import { isBriefScope } from '@/domain/briefs'
import type { User } from '../user'
import type { BriefPeek } from './types'

/**
 * The one-liner behind a "Why?" link or a tile with no metric of its own: its text, the numbers it was built
 * from and who wrote it. Null for a scope that does not exist; a known scope with no row yet says so in the view.
 */
export async function loadBriefPeek(user: User, scope: string): Promise<BriefPeek | null> {
  if (!isBriefScope(scope)) return null
  const b = await latestBrief(user, scope)
  return { type: 'brief', scope, line: b?.text ?? null, facts: b?.why.facts ?? [], source: b?.why.source ?? null, model: b?.why.model ?? null }
}
