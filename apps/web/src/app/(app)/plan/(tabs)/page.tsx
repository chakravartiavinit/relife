import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { loadGoalsPageOnce } from '@/core/goals'
import { loadPatterns } from '@/core/patterns'
import { getUser } from '@/core/user'
import { connectionView } from '@/domain/connection-view'
import brand from '@relife/brand/brand.json'
import { MAX_ACTIVE } from '@/domain/goals'
import { Card, Skeleton } from '@/ui/components/card'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { Rail } from '@/ui/components/rail'
import { EmptyState } from '@/ui/components/empty'
import { CapNote, CoachDraftsCard, FreeSlot, GoalDraftCard, GoalFolds, GoalsBoard, ReviewDueCard, SuggestDraftCard } from '@/ui/components/goals/goal-card'
import { NewGoalButton } from '@/ui/components/goals/goal-form'
import { actionPeeks, goalPicture, type GoalFeed } from '@/ui/components/goals/format'

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
  const data = await loadGoalsPageOnce(user)
  const atCap = data.activeCount >= MAX_ACTIVE
  const ai = await aiEnabledFor(user, 'plan')
  const nothing = !data.active.length && !data.paused.length && !data.finished.length
  const drafts = data.drafts.filter((d) => d.payload.goalDraft)
  // One New goal button at a time (the empty state, or the free-slot well under the goals); it also opens on /plan?new=1.
  const offers = drafts.map((d) => ({ insightId: d.id, draft: d.payload.goalDraft! }))
  const slots = MAX_ACTIVE - data.activeCount
  const first = data.due.map((d) => d.review.snapshot.window)
  const feeds = await feedsFor(data)
  return (
    <PageGrid>
      {/* DOM order: Active → Review due, drafts and the folds (the rail). The rail ends level with the board. */}
      <GridItem as="section" aria-label="Goals" span={{ base: 12, lg: 8 }} className="flex flex-col">
        {data.active.length ? (
          <GoalsBoard goals={data.active} picker={data.picker} today={data.today} feeds={feeds}>
            <CapNote show={atCap} />
            {!atCap ? <FreeSlot slots={slots} today={data.today} picker={data.picker} activeCount={data.activeCount} drafts={offers} /> : null}
          </GoalsBoard>
        ) : (
          <Card className="flex-1">
            <EmptyState picture={{ of: 'nav', to: '/plan' }}
              title={nothing ? 'No goals yet' : 'No active goals'}
              description={nothing ? `Pick one outcome you want to change, like sleep or savings. ${brand.name} records where you start and checks in every week.` : 'Resume a paused goal or create a new one.'}
              action={<NewGoalButton today={data.today} picker={data.picker} activeCount={data.activeCount} listenToUrl drafts={offers} />} />
          </Card>
        )}
      </GridItem>

      <Rail as="aside" aria-label="Review, drafts and more" span={{ base: 12, lg: 4 }} pairs>
        {data.due.length ? (
          <ReviewDueCard date={data.due[0].review.reviewDate} today={data.today} window={first.sort((a, b) => a.from.localeCompare(b.from))[0]}
            goals={data.due.map(({ goal, review }) => ({
              id: goal.id, title: goal.title, status: goal.snapshot?.outcome.status ?? null, sensitive: goal.sensitive, days: review.snapshot.outcome.days, note: review.aiNote,
              picture: goalPicture(goal), measure: `${goal.measureName}${goal.unit ? `, ${goal.unit}` : ''}`,
            }))} />
        ) : null}
        {drafts.length || ai ? (
          <CoachDraftsCard freeSlots={Math.max(0, slots)}>
            {drafts.map((d) => <GoalDraftCard key={d.id} insightId={d.id} draft={d.payload.goalDraft!} picker={data.picker} today={data.today} activeCount={data.activeCount} />)}
            {ai && drafts.length < 3 ? <SuggestDraftCard profileGoals={user.profile.goals?.slice(0, 160) ?? null} atCap={atCap} /> : null}
          </CoachDraftsCard>
        ) : null}
        <GoalFolds goals={[...data.paused, ...data.finished]} activeCount={data.activeCount} />
      </Rail>
    </PageGrid>
  )
}

/** Per active goal: the Peek of each linked action, and this week's change in one of its trackers when `findChanges` has one. */
async function feedsFor(data: Awaited<ReturnType<typeof loadGoalsPageOnce>>) {
  const feeds: Record<string, GoalFeed> = {}
  const tracked = data.active.some((g) => g.trackerId || g.actions.some((a) => a.kind === 'tracker'))
  const changes = tracked ? (await loadPatterns(await getUser())).changes : []
  for (const g of data.active) {
    const slugs = [g.trackerId, ...g.actions.filter((a) => a.kind === 'tracker').map((a) => a.id)].flatMap((id) => data.picker.trackers.find((t) => t.id === id)?.slug ?? [])
    const change = changes.find((c) => slugs.some((s) => c.signal.id === `tracker:${s}`))
    const v = change ? connectionView({ change }) : null
    feeds[g.id] = { peeks: actionPeeks(g, data.picker.trackers), change: v ? { parts: v.parts, caption: v.caption, peek: v.peek } : undefined }
  }
  return feeds
}

function GoalsSkeleton() {
  return (
    <PageGrid aria-busy>
      <GridItem span={{ base: 12, lg: 8 }}><Skeleton className="h-[640px] rounded-lg" /></GridItem>
      <Rail span={{ base: 12, lg: 4 }} pairs><Skeleton className="h-[420px] rounded-lg" /><Skeleton className="h-[200px] rounded-lg" /></Rail>
    </PageGrid>
  )
}
