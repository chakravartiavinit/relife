import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { CalendarCheck } from 'lucide-react'
import { loadGoalsPage, reviewPoint } from '@/core/goals'
import { getUser } from '@/core/user'
import { buttonClass } from '@/ui/components/button'
import { Card, PageHeader, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { GoalReviewCard } from '@/ui/components/goals/goal-review'
import { day } from '@/ui/components/goals/format'

export const metadata: Metadata = { title: 'Weekly review' }

export default function GoalReviewPage() {
  return (
    <Suspense fallback={<div aria-busy><Skeleton className="mb-6 h-[150px] rounded-[24px]" /><Skeleton className="h-[480px] rounded-lg" /></div>}>
      <Review />
    </Suspense>
  )
}

async function Review() {
  await connection()
  const user = await getUser()
  const data = await loadGoalsPage(user)
  const from = data.due.map((d) => d.review.snapshot.window.from).sort()[0]
  return (
    <div>
      <PageHeader
        eyebrow="Weekly review"
        title={from ? `${day(from)} – ${day(data.today)}` : 'Weekly review'}
        description="For each goal, compare what you did with how the outcome moved. Then choose what happens next. Goals you don’t decide stay as they are."
        actions={<Link href="/goals" className={buttonClass({ variant: 'secondary' })}>All goals</Link>}
      />
      {data.due.length ? (
        <div className="flex max-w-[760px] flex-col gap-6">
          {data.due.map(({ goal, review }) => {
            const { lines, prompt } = reviewPoint(goal, review)
            return (
              <GoalReviewCard key={review.id} g={goal} picker={data.picker} today={data.today}
                review={{ id: review.id, reviewDate: review.reviewDate, snapshot: review.snapshot, aiNote: review.aiNote, proposal: review.proposal, lines, prompt }} />
            )
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon={CalendarCheck} title="Nothing to review" description="Reviews land on Sundays. You can also start one from a goal’s menu."
            action={<Link href="/goals" className={buttonClass({ variant: 'primary' })}>Back to goals</Link>} />
        </Card>
      )}
    </div>
  )
}
