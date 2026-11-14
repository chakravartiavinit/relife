'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CalendarCheck, Check } from 'lucide-react'
import { reviewGoalNowAction } from '@/app/actions'
import { weekStart } from '@/domain/quests'
import { cn } from '@/ui/cn'
import { buttonClass, Button } from '../button'
import { Card } from '../card'
import { ShareButton } from '../share/share-button'
import { useToast } from '../toast'
import { GoalReviewCard, DECISION_DONE, type DecisionId, type ReviewData } from './goal-review'
import type { GoalPickerData } from './goal-form'
import { weekday, type GoalViewData } from './format'

export type ReviewItem = { goal: GoalViewData; review: ReviewData }

/**
 * The weekly review, one goal at a time. A step list (a column on a laptop, a row of chips on a phone) shows each
 * goal's state: Deciding, Up next or what was decided. Each choice saves on its own; "Decide later" leaves a goal
 * as it is and moves on. Reviews decided today stay in the list in their saved state.
 */
export function ReviewFlow({ items: fresh, picker, today }: { items: ReviewItem[]; picker: GoalPickerData; today: string }) {
  // The server lists undecided reviews first, so a saved decision moves its card. Keep the order the flow opened
  // with, and track the current goal by review id, so a refresh never skips a goal or jumps back to a decided one.
  const [order] = useState(() => fresh.map((i) => i.review.id))
  const items = [
    ...order.flatMap((id) => fresh.filter((i) => i.review.id === id)),
    ...fresh.filter((i) => !order.includes(i.review.id)),
  ]
  const [currentId, setCurrentId] = useState(() => (fresh.find((i) => !i.review.decision) ?? fresh[0]).review.id)
  const [saved, setSaved] = useState<Record<string, DecisionId>>({})
  const decisionOf = (i: ReviewItem) => saved[i.review.id] ?? i.review.decision
  const index = Math.max(0, items.findIndex((i) => i.review.id === currentId))
  const current = items[index]
  const allDone = items.every((i) => decisionOf(i))
  const setIndex = (n: number) => setCurrentId(items[n].review.id)
  // Next: the first undecided goal after this one, else the next in the list.
  const next = () => {
    const after = items.slice(index + 1).find((i) => !decisionOf(i)) ?? items[Math.min(items.length - 1, index + 1)]
    setCurrentId(after.review.id)
  }
  const stateOf = (i: ReviewItem, n: number) => {
    const d = decisionOf(i)
    return d ? DECISION_DONE[d] : n === index ? 'Deciding' : 'Up next'
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Goals to review" className="lg:sticky lg:top-6 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {items.map((i, n) => (
            <li key={i.review.id} className="shrink-0 lg:shrink">
              <button
                type="button" onClick={() => setIndex(n)} aria-current={n === index ? 'step' : undefined}
                className={cn(
                  'flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-start transition-[background-color,transform] duration-150 ease-out-quint hover:bg-surface-2 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-pill',
                  n === index && 'bg-surface shadow-1',
                )}
              >
                <span aria-hidden className={cn('grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold tabular-nums', decisionOf(i) ? 'bg-good/15 text-good' : n === index ? 'bg-ink text-surface' : 'bg-surface-2 text-ink-3')}>
                  {decisionOf(i) ? <Check className="size-3.5" strokeWidth={2.5} /> : n + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-small font-medium text-ink max-lg:max-w-[160px]">{i.goal.title}</span>
                  <span className="block text-caption text-ink-3">{stateOf(i, n)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-caption text-ink-3 max-lg:hidden">Each choice saves on its own. Goals you don’t decide stay as they are.</p>
      </nav>
      <div className="flex min-w-0 flex-col gap-4">
        <GoalReviewCard
          key={current.review.id} g={current.goal} picker={picker} today={today} review={current.review}
          onSaved={(d) => setSaved((s) => ({ ...s, [current.review.id]: d }))} onNext={next} last={index >= items.length - 1}
        />
        {allDone ? (
          <Card role="status" className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-body font-medium text-ink"><Check className="size-4 text-good" strokeWidth={2} aria-hidden />Review finished. Next review {weekday(current.goal.nextReviewOn)}.</p>
            <div className="flex flex-wrap gap-2">
              <ShareButton kind="weekly" refId={weekStart(today)} label="Share your week">Share your week</ShareButton>
              <Link href="/plan" className={buttonClass({ variant: 'secondary' })}>Back to goals</Link>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

/** With nothing due: start a review for one goal today instead of waiting for Sunday. */
export function ReviewNow({ goals }: { goals: { id: string; title: string }[] }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const toast = useToast()
  if (!goals.length) return null
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="text-small text-ink-3">Or review a goal now:</p>
      <div className="flex flex-wrap justify-center gap-2">
        {goals.map((g) => (
          <Button key={g.id} size="sm" disabled={pending} onClick={() => start(async () => {
            const res = await reviewGoalNowAction(g.id)
            if (res.ok) router.refresh()
            else toast.error()
          })}>
            <CalendarCheck className="size-3.5" strokeWidth={1.5} aria-hidden />{g.title}
          </Button>
        ))}
      </div>
    </div>
  )
}
