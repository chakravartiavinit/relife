import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { CalendarCheck } from 'lucide-react'
import { loadGoalsPage, reviewPoint } from '@/core/goals'
import { getUser } from '@/core/user'
import { buttonClass } from '@/ui/components/button'
import { Card, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { ReviewFlow, ReviewNow } from '@/ui/components/goals/review-flow'
import { day } from '@/ui/components/goals/format'

export const metadata: Metadata = { title: 'Weekly review' }

export default function GoalReviewPage() {
  return (
    <Suspense fallback={<PageGrid aria-busy><GridItem><Skeleton className="h-[72px] rounded-lg" /></GridItem><GridItem><Skeleton className="h-[480px] rounded-lg" /></GridItem></PageGrid>}>
      <Review />
    </Suspense>
  )
}

async function Review() {
  await connection()
  const user = await getUser()
  const data = await loadGoalsPage(user)
  // Reviews decided today stay on the page in their saved state, so a decision never makes its card vanish.
  const cards = [...data.due, ...data.decidedToday]
  const from = cards.map((d) => d.review.snapshot.window.from).sort()[0]
  // The same period the cards show, not up to today: a review covers the window it closed.
  const to = cards.map((d) => d.review.snapshot.window.to).sort().at(-1) ?? data.today
  return (
    <PageGrid>
      <GridItem className="max-w-[60ch]">
        <h2 className="text-heading text-ink">{from ? `Weekly review · ${day(from)} – ${day(to)}` : 'Weekly review'}</h2>
        <p className="mt-1 text-body text-ink-2">For each goal, compare what you did with how the outcome moved. Then choose what happens next. Goals you don’t decide stay as they are.</p>
      </GridItem>
      <GridItem>{cards.length ? (
        <ReviewFlow
          picker={data.picker} today={data.today}
          items={cards.map(({ goal, review }) => {
            const { lines, prompt } = reviewPoint(goal, review)
            return { goal, review: { id: review.id, reviewDate: review.reviewDate, snapshot: review.snapshot, aiNote: review.aiNote, proposal: review.proposal, lines, prompt, decision: review.decision } }
          })}
        />
      ) : (
        <Card>
          <EmptyState icon={CalendarCheck} title="Nothing to review" description="Reviews land on Sundays. You can also review a goal today."
            action={<Link href="/plan" className={buttonClass({ variant: 'primary' })}>Back to goals</Link>} />
          <ReviewNow goals={data.active.map((g) => ({ id: g.id, title: g.title }))} />
        </Card>
      )}</GridItem>
    </PageGrid>
  )
}
