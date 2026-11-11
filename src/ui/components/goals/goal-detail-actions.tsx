'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck, Flag, Pause, Pencil, Play } from 'lucide-react'
import { reviewGoalNowAction, setGoalStatusAction } from '@/app/actions'
import { MAX_ACTIVE } from '@/domain/goals'
import { Button, buttonClass } from '../button'
import { useToast } from '../toast'
import { GoalFormButton, initialFromGoal, type GoalPickerData } from './goal-form'
import type { GoalViewData } from './format'

/** Edit, review, pause, resume and finish for one goal. Finished goals are read-only. */
export function GoalDetailActions({ g, picker, today, activeCount, reviewDue }: { g: GoalViewData; picker: GoalPickerData; today: string; activeCount: number; reviewDue: boolean }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const router = useRouter()
  if (g.status === 'finished') return null
  const set = (status: 'active' | 'paused' | 'finished') => start(async () => {
    const res = await setGoalStatusAction({ goalId: g.id, version: g.version, status })
    toast(res.ok ? { active: 'Goal resumed', paused: 'Goal paused', finished: 'Goal finished' }[status] : res.error, res.ok ? 'good' : 'bad')
  })
  return (
    <div className="flex flex-wrap gap-2">
      <GoalFormButton mode={{ kind: 'edit', goal: g }} initial={initialFromGoal(g)} picker={picker} today={today}><Pencil className="size-4" strokeWidth={1.5} />Edit</GoalFormButton>
      {g.status === 'active' ? (
        reviewDue
          ? <Link href="/goals/review" className={buttonClass({ variant: 'secondary' })}><CalendarCheck className="size-4" strokeWidth={1.5} />Review</Link>
          : <Button disabled={pending} onClick={() => start(async () => { await reviewGoalNowAction(g.id); router.push('/goals/review') })}><CalendarCheck className="size-4" strokeWidth={1.5} />Review now</Button>
      ) : null}
      {g.status === 'active'
        ? <Button variant="ghost" disabled={pending} onClick={() => set('paused')}><Pause className="size-4" strokeWidth={1.5} />Pause</Button>
        : <Button variant="ghost" disabled={pending || activeCount >= MAX_ACTIVE} title={activeCount >= MAX_ACTIVE ? `You have ${MAX_ACTIVE} active goals. Pause or finish one first.` : undefined} onClick={() => set('active')}><Play className="size-4" strokeWidth={1.5} />Resume</Button>}
      <Button variant="ghost" disabled={pending} onClick={() => set('finished')}><Flag className="size-4" strokeWidth={1.5} />Finish</Button>
    </div>
  )
}
