import Link from 'next/link'
import { Flame, Snowflake } from 'lucide-react'
import { formatNumber } from '@/domain/money'
import { cn } from '@/ui/cn'
import { Card, SystemLabel } from '../card'
import { PeekLink } from '../peek/peek-link'

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
  freezes: number
  xpToday: number
  /** Day one: a streak of 0 reads as an invitation, and the label says so. */
  firstDay?: boolean
  complete?: boolean
}

/**
 * The top of Today, open on the canvas (no card): the date line, the greeting, one line from the brief with a Why?
 * link, and the streak card (the streak with freezes held, XP today). On a phone the card sits under the brief.
 * The halftone sits in the top-right corner only.
 */
export function TodayHeader({ d }: { d: HeaderData }) {
  const suffix = d.firstDay ? ' · Day 1' : d.complete ? ' · Day complete' : ''
  // The same 12 columns as the page below: the streak card is the width of the rail (4 of 12 columns from 960px, 5 of 12 from 640px).
  return (
    <header className="@container relative isolate">
      <div aria-hidden className="halftone -top-6 -right-5 -z-10 h-44 w-3/4 sm:-right-8 sm:w-1/2" />
      <div className="grid grid-cols-1 items-end gap-x-6 gap-y-5 grid-md:grid-cols-12">
        <div className="min-w-0 grid-md:col-[1/8] grid-lg:col-[1/9]">
          <SystemLabel>{d.date}{suffix}</SystemLabel>
          <h1 className="mt-2 font-display text-hero text-ink">{d.greeting}, {d.name}.</h1>
          <p className="mt-1.5 max-w-[64ch] text-body text-ink-2 grid-md:text-heading">
            {d.line}
            {d.why ? <>{' '}<PeekLink to={{ type: 'brief', id: 'today' }} className="rounded-xs font-medium whitespace-nowrap text-pill-ink hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink></> : null}
          </p>
        </div>
        <div className="min-w-0 grid-md:col-[8/13] grid-lg:col-[9/13]"><StreakCard d={d} /></div>
      </div>
    </header>
  )
}

/** The streak card: days in a row with freezes held, and XP earned today. One link to You. */
function StreakCard({ d }: { d: HeaderData }) {
  const { current, doneToday } = d.streak
  return (
    <Card as="div" className="flex flex-col gap-1 p-4">
      <Link href="/you#streak" className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
        <span className="sr-only">{current} day streak. {doneToday ? 'Kept today.' : 'Not kept yet today.'}{d.xpToday ? ` ${formatNumber(d.xpToday)} XP today.` : ''}</span>
      </Link>
      <div className="flex items-center gap-2 text-heading text-ink">
        <Flame className={cn('size-5', current ? 'text-(--medal-gold)' : 'text-ink-3')} strokeWidth={1.5} aria-hidden />
        <span><span className="tabular-nums">{current}</span> day streak</span>
        {d.freezes ? <span className="ms-auto flex items-center gap-1 text-caption font-normal text-ink-3 tabular-nums"><Snowflake className="size-3.5 text-sky" strokeWidth={1.5} aria-hidden />{d.freezes}<span className="sr-only"> {d.freezes === 1 ? 'freeze' : 'freezes'}</span></span> : null}
      </div>
      <div className="text-small text-ink-3 tabular-nums">
        {d.firstDay ? 'Check one thing off to start' : d.xpToday ? `+${formatNumber(d.xpToday)} XP today` : 'No XP yet today'}
      </div>
    </Card>
  )
}
