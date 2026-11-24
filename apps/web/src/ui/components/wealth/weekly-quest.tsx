import type { Change, Link } from '@/domain/patterns'
import { Capsule } from '../capsule'
import { Connection } from '../connection'
import { PeekLink } from '../peek/peek-link'

// Where Wealth ties a number to a habit: the one connection about money that qualifies, and this week's money quest, which
// says what to do about it. Both are optional: no connection that holds, no quest picked, nothing is drawn.

export type WealthQuest = { key: string; title: string; progress: number; target: number; done: boolean }
export type WealthHabits = { change: Change | null; link: Link | null; quest: WealthQuest | null; changes?: Change[] }

/**
 * This week's money quest on one line, its progress in days and a thin bar; the title opens the quest's Peek. It sits
 * under the habit connection on Overview and Spending.
 */
export function WeeklyQuest({ quest }: { quest: WealthQuest }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-ink-2">This week’s quest</span>
        <span className="text-small text-ink-3 tabular-nums">{quest.done ? 'Done' : `${quest.progress} of ${quest.target} days`}</span>
      </div>
      <PeekLink to={{ type: 'quest', id: `weekly.${quest.key}` }} className="rounded-xs text-body font-medium text-ink hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">{quest.title}</PeekLink>
      <Capsule value={quest.progress} max={quest.target} size="sm" label={`Quest: ${quest.title}, ${quest.progress} of ${quest.target}`} />
    </div>
  )
}

/**
 * The connection in its well and the quest under it. `prefer` says which comes first when both a change this week and a
 * link exist: Overview leads with what changed, Spending with what goes with it.
 */
export function HabitBlock({ habits, today, prefer = 'change' }: { habits: WealthHabits; today?: string; prefer?: 'change' | 'link' }) {
  const first = prefer === 'link' ? (habits.link ? { link: habits.link } : habits.change ? { change: habits.change } : null) : (habits.change ? { change: habits.change } : habits.link ? { link: habits.link } : null)
  if (!first && !habits.quest) return null
  return (
    <div className="flex flex-col gap-4">
      {first ? <div className="rounded-md bg-surface-2 p-4"><Connection {...first} today={today} /></div> : null}
      {habits.quest ? <WeeklyQuest quest={habits.quest} /> : null}
    </div>
  )
}
