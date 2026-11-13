import Link from 'next/link'
import { Flame, Snowflake, Sparkles } from 'lucide-react'
import { cn } from '@/ui/cn'
import { SystemLabel } from '../card'
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
 * The top of Today, open on the canvas (no card): date, greeting, one line from the brief with a Why? link, and the
 * streak chip. The halftone sits in the top-right corner only. On a phone the chip shrinks to one pill beside the date.
 */
export function TodayHeader({ d }: { d: HeaderData }) {
  const suffix = d.firstDay ? ' · Day 1' : d.complete ? ' · Day complete' : ''
  return (
    <header className="relative isolate grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
      <div aria-hidden className="halftone -top-6 -right-5 -z-10 h-44 w-3/4 sm:-right-8 sm:w-1/2" />
      <div className="col-start-1 row-start-1"><SystemLabel>{d.date}{suffix}</SystemLabel></div>
      <StreakChip d={d} />
      <h1 className="col-span-2 font-display text-title text-ink sm:col-span-1 sm:text-display">{d.greeting}, {d.name}.</h1>
      <p className="col-span-2 mt-1 flex max-w-[64ch] items-start gap-2 text-body text-ink-2 sm:col-span-1 sm:text-heading sm:font-normal">
        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-pill-ink sm:mt-1 sm:size-[18px]" strokeWidth={1.5} />
        <span>
          {d.line}
          {d.why ? <>{' '}<PeekLink to={{ type: 'brief', id: 'today' }} className="rounded-xs font-semibold whitespace-nowrap text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink></> : null}
        </span>
      </p>
    </header>
  )
}

/** Streak, freezes held and XP today, in one link to the streak on You. */
function StreakChip({ d }: { d: HeaderData }) {
  const { current, doneToday } = d.streak
  return (
    <Link
      href="/you#streak"
      className="col-start-2 row-start-1 flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 shadow-1 transition-[box-shadow] duration-150 hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill sm:row-span-3 sm:gap-3 sm:rounded-lg sm:px-4 sm:py-3"
    >
      <Flame className={cn('size-5 sm:size-6', current ? 'text-(--medal-gold)' : 'text-ink-3')} strokeWidth={2} aria-hidden />
      <span className="flex items-baseline gap-1.5 sm:block sm:text-center">
        <span className="num block text-heading leading-none sm:text-title">{current}</span>
        <span className="hidden text-caption text-ink-3 sm:mt-1 sm:block">{d.firstDay ? 'check one thing off to start' : 'day streak'}</span>
      </span>
      {d.firstDay ? null : (
        <span className="flex items-center gap-1 text-caption text-ink-3 tabular-nums sm:block sm:border-s sm:border-divider sm:ps-3">
          {d.freezes ? <span className="flex items-center gap-1"><Snowflake className="size-3.5 text-sky" strokeWidth={2} aria-hidden />{d.freezes}<span className="max-sm:sr-only"> {d.freezes === 1 ? 'freeze' : 'freezes'}</span></span> : null}
          {d.xpToday ? <span className="block max-sm:hidden">+{d.xpToday} XP today</span> : null}
        </span>
      )}
      <span className="sr-only">{doneToday ? 'Kept today.' : 'Not kept yet today.'}{d.xpToday ? ` ${d.xpToday} XP today.` : ''}</span>
    </Link>
  )
}
