import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { ChevronRight, CheckCheck, Waypoints } from 'lucide-react'
import type { ClearedItem } from '@/core/needs-you'
import { countNeedsYou, filterNeedsYou, type NeedsYouFilter, type NeedsYouItem } from '@/domain/needs-you'
import { cn } from '../../cn'
import { Card } from '../card'
import { buttonClass } from '../button'
import type { GoalPickerData } from '../goals/goal-form'
import { ClearedToday } from './cleared-today'
import { NeedsYouList } from './needs-you-list'

const FILTERS: { key: NeedsYouFilter | null; label: string }[] = [{ key: null, label: 'All' }, { key: 'decisions', label: 'Decisions' }, { key: 'data', label: 'Data' }]

/**
 * The Needs you card: the count, the All · Decisions · Data chips (links, so `?filter=` is shareable and the old
 * Inbox link lands on Data), and the list. All caught up shows what was cleared today. Server component: it draws the
 * list's first state from the loader's items; the list itself is a client component that collapses rows as you act.
 */
export function NeedsYouPanel({ items, filter, categories, timezone, today, goal, cleared, aiOn, patternChanges }: {
  items: NeedsYouItem[]; filter: NeedsYouFilter | null; categories: string[]; timezone: string; today: string
  goal: { picker: GoalPickerData; today: string; activeCount: number } | null; cleared: ClearedItem[]; aiOn: boolean
  /** Phone: the link card at the end of the list says how many changes Patterns has. */
  patternChanges: number
}) {
  const counts = countNeedsYou(items)
  const shown = filterNeedsYou(items, filter)
  const n = (k: NeedsYouFilter | null) => (k === 'data' ? counts.data : k === 'decisions' ? counts.decisions : counts.total)
  return (
    <div className="flex flex-col gap-4">
      <Card as="section" className="overflow-hidden px-0 pb-0">
        <header className="px-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-title font-semibold text-ink">
              Needs you
              {counts.total ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-pill px-2 text-caption font-semibold text-white tabular-nums">{counts.total}</span> : null}
            </h2>
            <p className="text-small text-ink-3 max-sm:hidden">Most urgent first</p>
          </div>
          {counts.total ? (
            <nav aria-label="Show" className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {FILTERS.map((f) => {
                const active = f.key === filter
                return (
                  <Link
                    key={f.key ?? 'all'} href={f.key ? `/coach?filter=${f.key}` : '/coach'} scroll={false} aria-current={active ? 'page' : undefined}
                    className={buttonClass({ variant: active ? 'primary' : 'secondary', size: 'sm', className: cn('shrink-0 rounded-full', !active && 'font-normal text-ink-2') })}
                  >
                    {f.label}<span className={cn('tabular-nums', active ? 'opacity-70' : 'text-ink-3')}>{n(f.key)}</span>
                  </Link>
                )
              })}
            </nav>
          ) : null}
        </header>
        {shown.length ? (
          // Re-keyed by filter, so a collapsed row never shows up under the wrong chip.
          <NeedsYouList key={filter ?? 'all'} items={shown} timezone={timezone} today={today} categories={categories} goal={goal} />
        ) : counts.total ? (
          <div className="border-t border-divider px-5 py-10 text-center">
            <p className="text-heading font-semibold text-ink">Nothing under {filter === 'data' ? 'Data' : 'Decisions'}</p>
            <p className="mt-1 text-body text-ink-3">{counts.total} {counts.total === 1 ? 'thing needs' : 'things need'} you in the other list.</p>
            <Link href="/coach" scroll={false} className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-4' })}>Show all</Link>
          </div>
        ) : (
          <div className="border-t border-divider">
            <div className="flex flex-col items-center px-6 pt-10 pb-8 text-center">
              <span aria-hidden className="mb-4 grid size-16 place-items-center rounded-[20px] bg-good/10 text-good"><CheckCheck className="size-8" strokeWidth={1.5} /></span>
              <h3 className="text-title font-semibold text-ink">All caught up</h3>
              <p className="mt-1.5 max-w-[40ch] text-body text-ink-2 text-pretty">
                {cleared.length ? `You cleared ${cleared.length} ${cleared.length === 1 ? 'thing' : 'things'} today. ` : ''}
                {aiOn ? 'New ones land here: the morning nudge and the weekly review on Sunday.' : `Rule-based alerts and anything ${brand.name} can’t read land here. Connect a model for morning nudges and a Sunday review.`}
              </p>
            </div>
            <ClearedToday items={cleared} timezone={timezone} />
          </div>
        )}
      </Card>
      <Link
        href="/coach/patterns"
        className="flex min-h-14 items-center gap-3 rounded-lg bg-surface px-4 py-3 shadow-1 transition-[scale,background-color] duration-150 hover:bg-surface-2 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill lg:hidden"
      >
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-pill-wash text-pill-ink"><Waypoints className="size-[18px]" strokeWidth={1.5} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-ink">Patterns across your life</span>
          <span className="block text-small text-ink-3 tabular-nums">{patternChanges ? `${patternChanges} ${patternChanges === 1 ? 'change' : 'changes'} this week` : 'What moves together'}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
      </Link>
    </div>
  )
}
