import Link from 'next/link'
import { Flame, Snowflake } from 'lucide-react'
import { formatNumber } from '@/domain/money'
import { cn } from '@/ui/cn'
import { LevelBar } from '../capsule'
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
  /** The character: level, rank title, total XP, XP to the next level and the 0 to 1 progress there. */
  level: { level: number; title: string; total: number; toNext: number; progress: number }
  streak: { current: number; doneToday: boolean }
  freezes: number
  xpToday: number
  /** Day one: a streak of 0 reads as an invitation, and the label says so. */
  firstDay?: boolean
  complete?: boolean
}

/**
 * The top of Today, open on the canvas (no card): the date line, the greeting, one line from the brief with a Why?
 * link, and the level card (level, rank, XP bar, XP today, streak). On a phone the card sits under the brief.
 * The halftone sits in the top-right corner only.
 */
export function TodayHeader({ d }: { d: HeaderData }) {
  const suffix = d.firstDay ? ' · Day 1' : d.complete ? ' · Day complete' : ''
  return (
    <header className="relative isolate flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div aria-hidden className="halftone -top-6 -right-5 -z-10 h-44 w-3/4 sm:-right-8 sm:w-1/2" />
      <div className="min-w-0">
        <SystemLabel>{d.date}{suffix}</SystemLabel>
        <h1 className="mt-2 font-display text-hero text-ink">{d.greeting}, {d.name}.</h1>
        <p className="mt-1.5 max-w-[64ch] text-body text-ink-2 sm:text-heading sm:font-normal">
          {d.line}
          {d.why ? <>{' '}<PeekLink to={{ type: 'brief', id: 'today' }} className="rounded-xs font-medium whitespace-nowrap text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink></> : null}
        </p>
      </div>
      <LevelCard d={d} />
    </header>
  )
}

/** The character card: rank, a segmented XP bar to the next level, XP today, and the streak with freezes held. One link to You. */
function LevelCard({ d }: { d: HeaderData }) {
  const { current, doneToday } = d.streak
  const { level } = d
  return (
    <Card as="div" className="flex flex-col gap-2.5 p-4 sm:w-[340px] sm:shrink-0">
      <Link href="/you#streak" className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
        <span className="sr-only">Level {level.level}, {level.title}. {formatNumber(level.toNext)} XP to level {level.level + 1}. {current} day streak. {doneToday ? 'Kept today.' : 'Not kept yet today.'}</span>
      </Link>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-heading text-ink">Level {level.level} <span className="text-small font-normal text-ink-3">· {level.title}</span></span>
        <span className="text-small text-ink-3 tabular-nums">{formatNumber(level.total)} XP</span>
      </div>
      <LevelBar value={level.progress} max={1} size="lg" color="var(--pill)" label={`XP to level ${level.level + 1}`} />
      <div className="flex justify-between gap-3 text-caption text-ink-3 tabular-nums">
        <span>{formatNumber(level.toNext)} XP to Lv {level.level + 1}</span>
        {d.xpToday ? <span>+{formatNumber(d.xpToday)} XP today</span> : null}
      </div>
      <div className="flex items-center gap-2 border-t border-divider pt-2.5 text-small text-ink-2">
        <Flame className={cn('size-4', current ? 'text-(--medal-gold)' : 'text-ink-3')} strokeWidth={1.5} aria-hidden />
        <span><span className="font-medium text-ink tabular-nums">{current}</span> {d.firstDay ? 'day streak · check one thing off to start' : 'day streak'}</span>
        {d.freezes ? <span className="ms-auto flex items-center gap-1 text-caption text-ink-3 tabular-nums"><Snowflake className="size-3.5 text-sky" strokeWidth={1.5} aria-hidden />{d.freezes}<span className="sr-only"> {d.freezes === 1 ? 'freeze' : 'freezes'}</span></span> : null}
      </div>
    </Card>
  )
}
