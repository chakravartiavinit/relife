'use client'

import { useState } from 'react'
import Link from 'next/link'
import { History } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/ui/beui/motion/tabs'
import { cn } from '../../cn'
import { GridItem, PageGrid } from '../page-grid'
import { Rail } from '../rail'

type View = 'needs' | 'ask'

// The phone's one-pane rule keys off the page's own width (the `grid-md` tier starts at 40rem), like the grid.
const PHONE_HIDDEN = '@max-[39.99rem]:hidden'

/**
 * Needs you (7 of 12 columns) beside a rail (5) with Ask and Patterns this week, level at the bottom. On a phone one
 * pane at a time, picked by a segmented control with a History shortcut; the rail's Patterns card stays off there (a
 * link card at the end of Needs you stands in). The view is client state mirrored to `?view=ask` with `replaceState`,
 * so a reload or a shared link lands on the same pane without a server trip. All panes are server-rendered children;
 * this only hides some of them.
 */
export function CoachPanes({ initial, count, needs, ask, patterns }: { initial: View; count: number; needs: React.ReactNode; ask: React.ReactNode; patterns: React.ReactNode }) {
  const [view, setView] = useState<View>(initial)
  const pick = (v: string) => {
    const next = v === 'ask' ? 'ask' : 'needs'
    setView(next)
    const url = new URL(window.location.href)
    if (next === 'ask') url.searchParams.set('view', 'ask'); else url.searchParams.delete('view')
    url.searchParams.delete('ask')
    window.history.replaceState(window.history.state, '', url)
  }
  return (
    <PageGrid>
      <GridItem className="flex items-center gap-2 grid-md:hidden">
        <Tabs variant="pill" value={view} onValueChange={pick} className="min-w-0 flex-1">
          <TabsList wrapperClassName="w-full" className="w-full gap-0 bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]">
            <TabsTrigger value="needs" indicatorClassName="bg-surface shadow-1" className="h-10 flex-1 px-4 text-body font-medium text-ink-3 transition-colors duration-150 hover-fine:text-ink [&_[data-tabs-label]]:text-ink">
              <span className="inline-flex items-center gap-2">Needs you{count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-caption font-medium text-surface tabular-nums">{count}</span> : null}</span>
            </TabsTrigger>
            <TabsTrigger value="ask" indicatorClassName="bg-surface shadow-1" className="h-10 flex-1 px-4 text-body font-medium text-ink-3 transition-colors duration-150 hover-fine:text-ink [&_[data-tabs-label]]:text-ink">Ask</TabsTrigger>
          </TabsList>
        </Tabs>
        <Link href="/coach/history" aria-label="History" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink-2 shadow-1 transition-[scale,color] duration-150 hover-fine:text-ink active:scale-96 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
          <History className="size-[18px]" strokeWidth={1.5} aria-hidden />
        </Link>
      </GridItem>
      <GridItem span={{ base: 12, lg: 7 }} className={cn(view === 'ask' && PHONE_HIDDEN)}>{needs}</GridItem>
      <Rail span={{ base: 12, lg: 5 }} className={cn(view === 'needs' && PHONE_HIDDEN)}>
        {ask}
        <div className={cn('flex-none! [&>*]:h-full', PHONE_HIDDEN)}>{patterns}</div>
      </Rail>
    </PageGrid>
  )
}
