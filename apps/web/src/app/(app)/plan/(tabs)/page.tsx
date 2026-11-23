import brand from '@relife/brand/brand.json'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Target } from 'lucide-react'
import { loadGoalsPage } from '@/core/goals'
import { getUser } from '@/core/user'
import { MAX_ACTIVE } from '@/domain/goals'
import { Card, Skeleton } from '@/ui/components/card'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { Rail } from '@/ui/components/rail'
import { EmptyState } from '@/ui/components/empty'
import { CapNote, CoachDraftsCard, GoalDraftCard, GoalsBoard, PausedFinishedList, ReviewDueCard, SuggestDraftCard } from '@/ui/components/goals/goal-card'
import { NewGoalButton } from '@/ui/components/goals/goal-form'

export const metadata: Metadata = { title: 'Goals' }

export default function GoalsPage() {
  return (
    <Suspense fallback={<GoalsSkeleton />}>
      <Goals />
    </Suspense>
  )
}

async function Goals() {
  await connection()
  const user = await getUser()
  const { aiEnabledFor } = await import('@/ai')
  const data = await loadGoalsPage(user)
  const atCap = data.activeCount >= MAX_ACTIVE
  const ai = await aiEnabledFor(user, 'plan')
  const nothing = !data.active.length && !data.paused.length && !data.finished.length
  const drafts = data.drafts.filter((d) => d.payload.goalDraft)
  // One New goal button at a time (the empty state, or the free-slot row under the goals); it also opens on /plan?new=1.
  const offers = drafts.map((d) => ({ insightId: d.id, draft: d.payload.goalDraft! }))
  const slots = MAX_ACTIVE - data.activeCount
  const hasRail = data.due.length > 0 || drafts.length > 0 || ai
  const first = data.due.map((d) => d.review.snapshot.window)
  return (
    <PageGrid>
      {/* DOM order: Active → Review due and drafts (the rail) → Paused and finished. The rail ends level with the board. */}
      <GridItem as="section" aria-label="Goals" span={{ base: 12, lg: hasRail ? 8 : 12 }} className="flex flex-col">
        {data.active.length ? (
          <GoalsBoard goals={data.active} picker={data.picker} today={data.today}>
            <CapNote show={atCap} />
            {!atCap ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 p-4">
                <div className="min-w-0">
                  <p className="text-body font-medium text-ink">{slots} {slots === 1 ? 'slot' : 'slots'} free</p>
                  <p className="text-small text-ink-3">Start from the coach draft or any tracker {brand.name} already fills.</p>
                </div>
                <NewGoalButton variant="secondary" today={data.today} picker={data.picker} activeCount={data.activeCount} listenToUrl drafts={offers} />
              </div>
            ) : null}
          </GoalsBoard>
        ) : (
          <Card className="flex-1">
            <EmptyState icon={Target}
              title={nothing ? 'No goals yet' : 'No active goals'}
              description={nothing ? `Pick one outcome you want to change, like sleep or savings. ${brand.name} records where you start and checks in every week.` : 'Resume a paused goal or create a new one.'}
              action={<NewGoalButton today={data.today} picker={data.picker} activeCount={data.activeCount} listenToUrl drafts={offers} />} />
          </Card>
        )}
      </GridItem>

      {hasRail ? (
        <Rail as="aside" aria-label="Review and drafts" span={{ base: 12, lg: 4 }} pairs>
          {data.due.length ? (
            <ReviewDueCard date={data.due[0].review.reviewDate} today={data.today} window={first.sort((a, b) => a.from.localeCompare(b.from))[0]}
              goals={data.due.map(({ goal, review }) => ({ id: goal.id, title: goal.title, status: goal.snapshot?.outcome.status ?? null, sensitive: goal.sensitive, days: review.snapshot.outcome.days, note: review.aiNote }))} />
          ) : null}
          {drafts.length || ai ? (
            <CoachDraftsCard freeSlots={Math.max(0, slots)}>
              {drafts.map((d) => <GoalDraftCard key={d.id} insightId={d.id} draft={d.payload.goalDraft!} picker={data.picker} today={data.today} activeCount={data.activeCount} />)}
              {ai && drafts.length < 3 ? <SuggestDraftCard profileGoals={user.profile.goals?.slice(0, 160) ?? null} atCap={atCap} /> : null}
            </CoachDraftsCard>
          ) : null}
        </Rail>
      ) : null}

      {data.paused.length || data.finished.length ? (
        <GridItem><PausedFinishedList goals={[...data.paused, ...data.finished]} activeCount={data.activeCount} /></GridItem>
      ) : null}
    </PageGrid>
  )
}

function GoalsSkeleton() {
  return (
    <PageGrid aria-busy>
      <GridItem span={{ base: 12, lg: 8 }}><Skeleton className="h-[640px] rounded-lg" /></GridItem>
      <Rail span={{ base: 12, lg: 4 }} pairs><Skeleton className="h-[420px] rounded-lg" /><Skeleton className="h-[320px] rounded-lg" /></Rail>
    </PageGrid>
  )
}
