import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import type { ClearedItem } from '@/core/needs-you'
import type { Patterns } from '@/core/patterns'
import { countNeedsYou, filterNeedsYou, type NeedsYouFilter, type NeedsYouItem } from '@/domain/needs-you'
import { connectionForText } from '@/domain/proposal-connection'
import { Card } from '../card'
import { buttonClass } from '../button'
import { chipClass } from '../chip'
import { Connection } from '../connection'
import { EmptyState } from '../empty'
import type { GoalPickerData } from '../goals/goal-form'
import { ClearedToday } from './cleared-today'
import { NeedsYouList } from './needs-you-list'

const FILTERS: { key: NeedsYouFilter | null; label: string }[] = [{ key: null, label: 'All' }, { key: 'decisions', label: 'Decisions' }, { key: 'data', label: 'To sort' }]

/** The Connection a proposal or a nudge stands on, drawn here on the server; only a pattern the statistics found qualifies. */
function connectionsFor(items: NeedsYouItem[], patterns: Patterns) {
  const out: Record<string, React.ReactNode> = {}
  for (const i of items) {
    if (i.kind !== 'plan' && i.kind !== 'nudge') continue
    const text = [i.insight.title, i.insight.body, ...(i.insight.actions ?? []).map((a) => a.name)].join(' ')
    const c = connectionForText(text, patterns.links, patterns.changes)
    if (c) out[i.id] = <Connection {...c} />
  }
  return out
}

/**
 * The Needs you card: the All · Decisions · To sort chips (links, so `?filter=` is shareable and the old Inbox link
 * lands on To sort), the queue, and Cleared today folded under it. All caught up shows what was cleared today. Server
 * component: it draws the list's first state from the loader's items; the list itself is a client component that
 * collapses rows as you act.
 */
export function NeedsYouPanel({ items, filter, categories, timezone, today, goal, cleared, aiOn, patterns }: {
  items: NeedsYouItem[]; filter: NeedsYouFilter | null; categories: string[]; timezone: string; today: string
  goal: { picker: GoalPickerData; today: string; activeCount: number } | null; cleared: ClearedItem[]; aiOn: boolean
  patterns: Patterns
}) {
  const counts = countNeedsYou(items)
  const shown = filterNeedsYou(items, filter)
  const n = (k: NeedsYouFilter | null) => (k === 'data' ? counts.data : k === 'decisions' ? counts.decisions : counts.total)
  return (
    <Card as="section" aria-labelledby="needs-you" className="flex h-full flex-col">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 id="needs-you" className="font-display text-heading text-ink">Needs you</h2>
        {counts.total ? (
          <nav aria-label="Show" className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {FILTERS.map((f) => {
              const active = f.key === filter
              return (
                <Link key={f.key ?? 'all'} href={f.key ? `/coach?filter=${f.key}` : '/coach'} scroll={false} aria-current={active ? 'page' : undefined} className={chipClass({ selected: active })}>
                  {f.label}<span className={active ? 'font-normal opacity-70' : 'font-normal text-ink-3'}>{n(f.key)}</span>
                </Link>
              )
            })}
          </nav>
        ) : null}
      </header>
      {shown.length ? (
        // Re-keyed by filter, so a collapsed row never shows up under the wrong chip.
        <NeedsYouList key={filter ?? 'all'} items={shown} timezone={timezone} today={today} categories={categories} goal={goal} connections={connectionsFor(shown, patterns)} openSort={filter === 'data'} />
      ) : counts.total ? (
        <EmptyState
          title={`Nothing under ${filter === 'data' ? 'To sort' : 'Decisions'}`}
          description={`${counts.total} ${counts.total === 1 ? 'thing needs' : 'things need'} you in the other list.`}
          picture={{ of: 'nav', to: '/coach' }}
          action={<Link href="/coach" scroll={false} className={buttonClass({ variant: 'secondary', size: 'sm' })}>Show all</Link>}
        />
      ) : (
        <EmptyState
          title="All caught up" picture={{ of: 'nav', to: '/coach' }}
          description={`${cleared.length ? `You cleared ${cleared.length} ${cleared.length === 1 ? 'thing' : 'things'} today. ` : ''}${aiOn ? 'New ones land here: the morning nudge and the weekly review on Sunday.' : `Rule-based alerts and anything ${brand.name} can’t read land here. Connect a model for morning nudges and a Sunday review.`}`}
        />
      )}
      <ClearedToday items={cleared} timezone={timezone} />
    </Card>
  )
}
