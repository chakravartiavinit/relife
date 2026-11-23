import { connection } from 'next/server'
import { Suspense } from 'react'
import { coachOpening } from '@/domain/coach-opening'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { CoachTabs } from '@/ui/components/coach/coach-tabs'
import { InsightLine } from '@/ui/components/insight-line'
import { coachPatterns, coachQueue } from './loaders'

/** The head and its tabs stay mounted while Needs you, Patterns and History change underneath it. */
export default function CoachLayout({ children }: LayoutProps<'/coach'>) {
  return (
    <>
      <Suspense fallback={<PageHeader title="Coach" description={<Skeleton className="h-6 w-[34ch] max-w-full" />} tabs={<CoachTabs />} />}>
        <CoachHead />
      </Suspense>
      {children}
    </>
  )
}

/** The opening line (the first decision and how many follow, Why? opens its card) and the tab counts. */
async function CoachHead() {
  await connection()
  const [{ items }, { patterns }] = await Promise.all([coachQueue(), coachPatterns()])
  const o = coachOpening(items)
  return (
    <PageHeader
      title="Coach"
      eyebrow={o.eyebrow || undefined}
      description={
        <InsightLine
          peek={o.insightId ? { type: 'insight', id: o.insightId } : undefined}
          why={o.insightId ? undefined : 'Decisions come first, most urgent first: a recovery choice, alerts, the weekly review, goal drafts, proposals, then nudges. Messages it could not read and payments to sort wait under To sort.'}
        >
          {o.line}
        </InsightLine>
      }
      tabs={<CoachTabs counts={{ needs: items.length, patterns: patterns.changes.length + patterns.links.length }} />}
    />
  )
}
