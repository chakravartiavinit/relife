import { cache } from 'react'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { needsYou, type NeedsYou } from '@/domain/needs-you'
import { areaToday, syncTone, workerAlive, type AreaToday, type SyncTone } from '@/domain/shell'
import type { Category } from '@/db/schema'
import { loadDayPlan } from './day-plan'
import { UNREAD_FILTER, pendingInsight } from './needs-you'
import { xpLevel } from './xp'
import type { User } from './user'

export type ShellStatus = {
  needsYou: NeedsYou
  sync: { tone: SyncTone; workerAlive: boolean; failing: string[]; lastSyncAt: Date | null }
  level: { level: number; progress: number; title: string }
  areaToday: Record<Category, AreaToday>
}

/**
 * Everything the shell shows besides the page: the Coach count, the sync dot, the level ring and the area dots.
 * One SQL statement (scalar subqueries) for the first two, one `sum` for the level, plus today's plan for the area
 * dots. Wrapped in React `cache`, so the sidebar, the top bar and the tab bar, each in its own Suspense island,
 * share one result per request. `LiveRefresh`'s `router.refresh()` re-runs it.
 */
export const loadShellStatus = cache(async (user: User): Promise<ShellStatus> => {
  const [[r], level, plan] = await Promise.all([
    db.execute<{ decisions: number; unread: number; merchants: number; heartbeat: string | null; failing: string[]; last_sync: string | null }>(sql`
      select
        (select count(*)::int from insights where ${pendingInsight(user.id)})
          + (select count(*)::int from party_members where user_id = ${user.id} and status = 'invited') as decisions,
        (select count(*)::int from raw_events where user_id = ${user.id} and status = 'failed'
           and ${UNREAD_FILTER}) as unread,
        (select count(distinct coalesce(upi_id, merchant, id::text))::int from transactions
           where user_id = ${user.id} and category = 'Uncategorized' and linked_to is null) as merchants,
        (select at from heartbeats where name = 'worker') as heartbeat,
        (select coalesce(array_agg(connector_id order by connector_id), '{}') from connections
           where user_id = ${user.id} and enabled and status = 'error') as failing,
        (select max(last_sync_at) from connections where user_id = ${user.id} and enabled) as last_sync`),
    xpLevel(user),
    loadDayPlan(user),
  ])
  // Raw statements return timestamps as strings.
  const date = (v: string | null) => (v ? new Date(v) : null)
  const alive = workerAlive(date(r.heartbeat))
  return {
    needsYou: needsYou(r.decisions, r.unread, r.merchants),
    sync: { tone: syncTone(alive, r.failing.length), workerAlive: alive, failing: r.failing, lastSyncAt: date(r.last_sync) },
    level,
    areaToday: areaToday(plan.byCat),
  }
})
