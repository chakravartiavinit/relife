'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CalendarCheck, Flag, Pause, Pencil, Play } from 'lucide-react'
import { CAP_MESSAGE, MAX_ACTIVE } from '@/domain/goals'
import { Button, buttonClass } from '../button'
import { useGoalActions } from './goal-card'
import { GoalFormButton, initialFromGoal, type GoalPickerData } from './goal-form'
import type { GoalViewData } from './format'

/** Edit, review, pause, resume and finish for one goal. Finished goals are read-only. */
export function GoalDetailActions({ g, picker, today, activeCount, reviewDue }: { g: GoalViewData; picker: GoalPickerData; today: string; activeCount: number; reviewDue: boolean }) {
  const { pending, set, reviewNow } = useGoalActions(g)
  const [confirmFinish, setConfirmFinish] = useState(false)
  if (g.status === 'finished') return null
  const atCap = g.status === 'paused' && activeCount >= MAX_ACTIVE
  if (confirmFinish) {
    return (
      <div role="group" aria-labelledby="goal-finish-q" onKeyDown={(e) => { if (e.key === 'Escape' && !pending) setConfirmFinish(false) }} className="flex flex-col gap-2 rounded-md bg-bad/8 px-3 py-3">
        <p id="goal-finish-q" className="text-[13.5px] text-ink">Finish this goal? Finished goals can’t be resumed or edited.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={pending} onClick={() => set('finished')}><Flag className="size-4" strokeWidth={1.5} />{pending ? 'Finishing…' : 'Finish goal'}</Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirmFinish(false)} autoFocus>Cancel</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <GoalFormButton mode={{ kind: 'edit', goal: g }} initial={initialFromGoal(g)} picker={picker} today={today}><Pencil className="size-4" strokeWidth={1.5} />Edit</GoalFormButton>
        {g.status === 'active' ? (
          reviewDue
            ? <Link href="/goals/review" className={buttonClass({ variant: 'secondary' })}><CalendarCheck className="size-4" strokeWidth={1.5} />Review</Link>
            : <Button disabled={pending} onClick={reviewNow}><CalendarCheck className="size-4" strokeWidth={1.5} />Review now</Button>
        ) : null}
        {g.status === 'active'
          ? <Button variant="ghost" disabled={pending} onClick={() => set('paused')}><Pause className="size-4" strokeWidth={1.5} />Pause</Button>
          : <Button variant="ghost" disabled={pending || atCap} aria-describedby={atCap ? 'goal-detail-cap-note' : undefined} onClick={() => set('active')}><Play className="size-4" strokeWidth={1.5} />Resume</Button>}
        <Button variant="ghost" disabled={pending} onClick={() => setConfirmFinish(true)}><Flag className="size-4" strokeWidth={1.5} />Finish…</Button>
      </div>
      {atCap ? <p id="goal-detail-cap-note" className="text-[12.5px] text-ink-3">{CAP_MESSAGE}</p> : null}
      {pending ? <p role="status" className="text-[12.5px] text-ink-3">Saving…</p> : null}
    </div>
  )
}
