import { loadGoalDetail } from '../goals'
import type { User } from '../user'
import type { GoalPeek } from './types'

const UUID = /^[0-9a-f-]{36}$/i

/** The goal detail as plain JSON: `loadGoalDetail` minus the database rows' timestamps. */
export async function loadGoalPeek(user: User, id: string): Promise<GoalPeek | null> {
  if (!UUID.test(id)) return null
  const d = await loadGoalDetail(user, id)
  if (!d) return null
  const { pausedAt, finishedAt, ...g } = d.goal
  return {
    type: 'goal',
    id,
    today: d.today,
    goal: { ...g, pausedAt: pausedAt?.toISOString() ?? null, finishedAt: finishedAt?.toISOString() ?? null },
    history: d.history,
    checkIns: d.checkIns,
    picker: d.picker,
    activeCount: d.activeCount,
    reviewDue: !!d.due,
  }
}
