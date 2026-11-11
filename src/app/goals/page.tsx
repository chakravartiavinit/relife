import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Target } from 'lucide-react'
import { loadGoalsPage } from '@/core/goals'
import { getUser } from '@/core/user'
import { MAX_ACTIVE } from '@/domain/goals'
import { Card, PageHeader, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { CapNote, GoalDraftCard, OutcomeGoalCard, PausedFinishedList, ReviewDueCard, SuggestDraftCard } from '@/ui/components/goals/goal-card'
import { NewGoalButton } from '@/ui/components/goals/goal-form'
import { cn } from '@/ui/cn'

export const metadata: Metadata = { title: 'Goals' }

export default function GoalsPage({ searchParams }: PageProps<'/goals'>) {
  return (
    <Suspense fallback={<GoalsSkeleton />}>
      <Goals searchParams={searchParams} />
    </Suspense>
  )
}

async function Goals({ searchParams }: { searchParams: PageProps<'/goals'>['searchParams'] }) {
  await connection()
  const [user, sp] = await Promise.all([getUser(), searchParams])
  const { aiEnabled } = await import('@/ai')
  const data = await loadGoalsPage(user)
  const atCap = data.activeCount >= MAX_ACTIVE
  const ai = aiEnabled('plan')
  const nothing = !data.active.length && !data.paused.length && !data.finished.length
  const drafts = data.drafts.filter((d) => d.payload.goalDraft)
  const hasAside = data.due.length > 0 || drafts.length > 0 || ai
  return (
    <div>
      <PageHeader
        eyebrow="Plan"
        title="Goals"
        description="Up to 3 outcomes you want to change. Each one has a baseline, a target and the routines that serve it."
        actions={<NewGoalButton today={data.today} picker={data.picker} activeCount={data.activeCount} autoOpen={sp.new === '1'} />}
      />
      {/* DOM order: Review due → Active → Drafts → Paused and finished. On wide screens review and drafts sit in the right column. */}
      <div className={cn('grid gap-6', hasAside && 'lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr_auto]')}>
        {data.due.length ? (
          <div className="lg:col-start-2 lg:row-start-1">
            <ReviewDueCard count={data.due.length} date={data.today} />
          </div>
        ) : null}

        <section aria-labelledby="active-goals" className="flex flex-col gap-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="flex items-baseline justify-between px-1">
            <h2 id="active-goals" className="text-[15px] font-semibold text-ink">Active</h2>
            <span className="text-[13px] text-ink-3 tabular-nums">{data.activeCount} of {MAX_ACTIVE}</span>
          </div>
          <CapNote show={atCap} />
          {data.active.length ? data.active.map((g) => <OutcomeGoalCard key={g.id} g={g} picker={data.picker} today={data.today} />) : (
            <Card>
              <EmptyState icon={Target}
                title={nothing ? 'No goals yet' : 'No active goals'}
                description={nothing ? 'Pick one outcome you want to change, like sleep or savings. ReLife records where you start and checks in every week.' : 'Resume a paused goal or create a new one.'}
                action={<NewGoalButton today={data.today} picker={data.picker} activeCount={data.activeCount} />} />
            </Card>
          )}
        </section>

        {drafts.length || ai ? (
          <section aria-label="Drafts" className={cn('flex flex-col gap-4 lg:col-start-2', data.due.length ? 'lg:row-start-2' : 'lg:row-start-1')}>
            {drafts.map((d) => <GoalDraftCard key={d.id} insightId={d.id} draft={d.payload.goalDraft!} picker={data.picker} today={data.today} activeCount={data.activeCount} />)}
            {ai && drafts.length < 3 ? <SuggestDraftCard profileGoals={user.profile.goals?.slice(0, 160) ?? null} atCap={atCap} /> : null}
          </section>
        ) : null}

        <div className="lg:col-start-1">
          <PausedFinishedList goals={[...data.paused, ...data.finished]} activeCount={data.activeCount} />
        </div>
      </div>
    </div>
  )
}

function GoalsSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-6 h-[150px] rounded-[24px]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4"><Skeleton className="h-6 w-24" /><Skeleton className="h-[320px] rounded-lg" /><Skeleton className="h-[320px] rounded-lg" /></div>
        <div className="flex flex-col gap-6"><Skeleton className="h-[200px] rounded-lg" /><Skeleton className="h-[220px] rounded-lg" /></div>
      </div>
    </div>
  )
}
