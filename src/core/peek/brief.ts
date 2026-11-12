import type { User } from '../user'
import type { BriefPeek } from './types'

/**
 * The one-liner behind a "Why?" link: its text, the facts it was built from and where it came from. Briefs are
 * stored by the area-briefs job, which arrives with the area template (the `briefs` table does not exist yet),
 * so every scope reads "no summary yet" for now and the view says so.
 */
export async function loadBriefPeek(_user: User, scope: string): Promise<BriefPeek> {
  return { type: 'brief', scope, line: null, facts: [], source: null, model: null }
}
