import type { PeekRef, PeekType } from '@/domain/peek'
import type { User } from '../user'
import { loadBriefPeek } from './brief'
import { loadConnectorPeek } from './connector'
import { loadGoalPeek } from './goal'
import { loadInsightPeek } from './insight'
import { loadMerchantPeek } from './merchant'
import { loadMetricPeek } from './metric'
import { loadPersonPeek } from './person'
import { loadQuestPeek } from './quest'
import { loadRoutinePeek } from './routine'
import { loadSyncPeek } from './sync'
import { loadTxnPeek } from './txn'
import type { PeekData } from './types'

export { loadMetricPeek } from './metric'
export type * from './types'

/** The address the request came in on: where a connector sign-in returns to. */
type Ctx = { origin: string }

const LOADERS: { [T in PeekType]: (user: User, id: string, ctx: Ctx) => Promise<PeekData | null> } = {
  metric: loadMetricPeek,
  routine: loadRoutinePeek,
  goal: loadGoalPeek,
  txn: loadTxnPeek,
  merchant: loadMerchantPeek,
  insight: loadInsightPeek,
  connector: (u, id, c) => loadConnectorPeek(u, id, c.origin),
  person: loadPersonPeek,
  quest: loadQuestPeek,
  sync: (u) => loadSyncPeek(u),
  brief: loadBriefPeek,
}

/** The data for one peek, or null when the item is gone (the view says "This item is gone"). */
export function loadPeek(user: User, ref: PeekRef, ctx: Ctx): Promise<PeekData | null> {
  return LOADERS[ref.type](user, ref.id, ctx)
}
