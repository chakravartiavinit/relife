import Link from 'next/link'
import { Flame } from 'lucide-react'
import { formatNumber } from '@/domain/money'
import { cn } from '@/ui/cn'
import { SystemLabel } from '../card'
import { buttonLinkClass } from '../button'
import { InsightLine } from '../insight-line'

export type HeaderData = {
  /** "Thursday · 12 November", already formatted in the user's time zone. */
  date: string
  greeting: string
  name: string
  /** One sentence: a stored brief, the rule-based plan line, or the end-of-day recap. */
  line: string
  /** Opens the brief's Peek (the facts behind the line). Hidden when the line is not a stored brief. */
  why: boolean
  streak: { current: number; doneToday: boolean }
  /** Streak freezes held and XP earned today: read out with the streak link, not drawn (Quests holds the freezes). */
  freezes: number
  xpToday: number
  /** Day one: a streak of 0 reads as an invitation, and the label says so. */
  firstDay?: boolean
  complete?: boolean
}

/**
 * The top of Today, open on the canvas (no card): the date label, the greeting in Fraunces, one line from the brief
 * with its Why?, and the streak as a link to You. On a phone the streak sits under the line; from 640px of page it
 * sits at the right, on the line's baseline.
 */
export function TodayHeader({ d }: { d: HeaderData }) {
  const suffix = d.firstDay ? ' · Day 1' : d.complete ? ' · Day complete' : ''
  const { current, doneToday } = d.streak
  return (
    <header className="@container">
      <div className="grid grid-cols-1 items-end gap-x-6 gap-y-3 grid-md:grid-cols-12">
        <div className="min-w-0 grid-md:col-[1/10]">
          <SystemLabel>{d.date}{suffix}</SystemLabel>
          <h1 className="mt-1.5 font-display text-hero text-ink">{d.greeting}, {d.name}.</h1>
          <InsightLine className="mt-2 max-w-[64ch]" peek={d.why ? { type: 'brief', id: 'today' } : undefined}>{d.line}</InsightLine>
        </div>
        <div className="min-w-0 grid-md:col-[10/13] grid-md:justify-self-end">
          <Link
            href="/you#streak"
            className={cn(buttonLinkClass('inline-flex h-10 items-center gap-1.5 text-body'), 'grid-md:h-9')}
            title={`${d.freezes ? `${d.freezes} ${d.freezes === 1 ? 'freeze' : 'freezes'} held. ` : ''}${d.xpToday ? `${formatNumber(d.xpToday)} XP today.` : ''}`.trim() || undefined}
          >
            <Flame className={cn('size-4', current ? 'text-(--medal-gold)' : 'text-ink-3')} strokeWidth={1.5} aria-hidden />
            {d.firstDay ? 'Check one thing off to start' : `${current}-day streak`}
            <span className="sr-only">. {doneToday ? 'Kept today.' : 'Not kept yet today.'}{d.xpToday ? ` ${formatNumber(d.xpToday)} XP today.` : ''}</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
