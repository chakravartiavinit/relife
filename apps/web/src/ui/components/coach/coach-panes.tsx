'use client'

import { useState } from 'react'
import Link from 'next/link'
import { History } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/ui/beui/motion/tabs'
import { cn } from '../../cn'

type View = 'needs' | 'ask'

/**
 * Two panes side by side on a laptop (Needs you | Ask). On a phone one at a time, picked by a segmented control with a
 * History shortcut. The view is client state mirrored to `?view=ask` with `replaceState`, so a reload or a shared link
 * lands on the same pane without a server trip. Both panes are server-rendered children; this only hides one.
 */
export function CoachPanes({ initial, count, needs, ask }: { initial: View; count: number; needs: React.ReactNode; ask: React.ReactNode }) {
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
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,32.5rem)] lg:items-start lg:gap-6">
      <div className="flex items-center gap-2 lg:hidden">
        <Tabs variant="pill" value={view} onValueChange={pick} className="min-w-0 flex-1">
          <TabsList wrapperClassName="w-full" className="w-full gap-0 bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]">
            <TabsTrigger value="needs" indicatorClassName="bg-surface shadow-1" className="h-10 flex-1 px-4 text-body font-medium text-ink-3 transition-colors duration-150 hover:text-ink [&_[data-tabs-label]]:text-ink">
              <span className="inline-flex items-center gap-2">Needs you{count ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-pill px-1.5 text-caption font-semibold text-white tabular-nums">{count}</span> : null}</span>
            </TabsTrigger>
            <TabsTrigger value="ask" indicatorClassName="bg-surface shadow-1" className="h-10 flex-1 px-4 text-body font-medium text-ink-3 transition-colors duration-150 hover:text-ink [&_[data-tabs-label]]:text-ink">Ask</TabsTrigger>
          </TabsList>
        </Tabs>
        <Link href="/coach/history" aria-label="History" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink-2 shadow-1 transition-[scale,color] duration-150 hover:text-ink active:scale-96 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
          <History className="size-[18px]" strokeWidth={1.5} aria-hidden />
        </Link>
      </div>
      <div className={cn('min-w-0', view === 'ask' && 'max-lg:hidden')}>{needs}</div>
      <div className={cn('min-w-0', view === 'needs' && 'max-lg:hidden')}>{ask}</div>
    </div>
  )
}
