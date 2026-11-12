import { connection } from 'next/server'
import { goalsSummary } from '@/core/goals'
import { localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { goalPace } from '@/domain/day-plan'
import { GoalsCard, type PaceGoal } from './goals-card'
import { day, fill, target, value } from './format'

// Today: active outcome goals in one card, with their pace against the date. Hidden when there are none unless the
// page asks for the one-line empty state (the first day). The card itself is `goals-card.tsx`.

export async function TodayGoals({ showEmpty }: { showEmpty?: boolean }) {
  await connection()
  const user = await getUser()
  const goals = await goalsSummary(user)
  if (!goals.length) return showEmpty ? <GoalsCard goals={[]} due={0} /> : null
  const today = localDate(new Date(), user.timezone)
  const due = goals.filter((g) => g.reviewDue).length
  return (
    <GoalsCard due={due} goals={goals.map((g): PaceGoal => {
      const o = g.snapshot.outcome
      return {
        id: g.id, title: g.title, area: g.area, share: fill(g.snapshot),
        pace: goalPace({ share: o.progressShare, met: o.status === 'met', startedOn: localDate(g.createdAt, user.timezone), targetDate: g.targetDate }, today),
        line: `${o.current != null ? value(o.current, g.unit) : '—'} · target ${target(g)}`, by: `by ${day(g.targetDate)}`,
      }
    })} />
  )
}
