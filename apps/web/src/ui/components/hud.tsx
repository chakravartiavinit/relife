import Link from 'next/link'
import { Flame } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { xpSummary } from '@/core/xp'
import { addDays } from '@/core/time'
import { formatNumber } from '@/domain/money'
import { TITLES } from '@/domain/xp'
import { CATEGORY } from '../tokens'
import { LevelBar } from './capsule'
import { MedalDisc } from './xp'
import { cn } from '../cn'
import { Card } from './card'
import { CapsuleIcon } from './capsule-icon'
import { Picture } from './picture'
import { buttonLinkClass } from './button'
import { AREA_HREF } from './nav'
import { ShareButton } from './share/share-button'

// The character sheet at the head of Progress, the page's one bright element: who you are in the game (level, title,
// the segmented XP bar), the streak, your areas as stats with their pictures, and the next title. The title track goes
// in as `children`, behind the "All titles" link.

type Summary = Awaited<ReturnType<typeof xpSummary>>

const longDay = (d: string) => new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))

export function CharacterSheet({ s, name, streak, freezes, areas, today, children }: {
  s: Summary
  name: string
  /** `active` holds every day with a check-in; the last seven are drawn. */
  streak: { current: number; best: number; doneToday: boolean; active: Set<string> }
  freezes: number
  /** Areas the user picked; empty shows all of them. */
  areas?: Category[]
  today: string
  /** The title track, shown behind "All titles". */
  children?: React.ReactNode
}) {
  const shown = s.areas.filter((a) => !areas?.length || areas.includes(a.area))
  const initial = (name.trim()[0] ?? 'R').toUpperCase()
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const then = s.nextTitle ? TITLES.find((t) => t.level > s.nextTitle!.level) : null
  return (
    <Card as="section" id="streak" aria-labelledby="character-title" className="flex h-full scroll-mt-6 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-4 sm:gap-x-6">
        <CapsuleIcon letter={initial} size="lg" className="ms-1 shrink-0" />
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none sm:gap-6">
          <div>
            <p className="text-small text-ink-3">Level</p>
            <p className="flex items-center gap-1 font-display text-figure text-ink tabular-nums">
              {s.level}
              <ShareButton kind="level" label="Share your level" />
            </p>
          </div>
          <span aria-hidden className="h-12 w-px bg-divider" />
          <div className="min-w-0">
            <p className="text-small text-ink-3">Title</p>
            <h2 id="character-title" className="font-display text-title text-ink">{s.title}</h2>
          </div>
        </div>

        <Link
          href="/plan/routines"
          // A phone draws it as a strip under the head; wider, as the right-hand block.
          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5 transition-[background-color] duration-150 ease-out-quint hover-fine:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill sm:ms-auto sm:-m-2 sm:w-auto sm:flex-col sm:items-end sm:justify-start sm:gap-1 sm:rounded-lg sm:bg-transparent sm:p-2 sm:hover-fine:bg-surface-2"
        >
          <span className="flex items-center gap-1.5 text-small text-ink-3 sm:flex-col sm:items-end sm:gap-1">
            <span className="flex items-center gap-1.5">
              <Flame className={cn('size-4', streak.current ? 'text-(--medal-gold)' : 'text-ink-3')} strokeWidth={1.5} aria-hidden />
              Streak
            </span>
            <span className="text-body font-medium text-ink tabular-nums sm:text-heading">{streak.current} {streak.current === 1 ? 'day' : 'days'}</span>
          </span>
          <ol aria-label="Last 7 days" className="hidden gap-1 sm:flex">
            {week.map((d) => {
              const done = streak.active.has(d)
              const label = `${longDay(d)}${d === today ? ' (today)' : ''}: ${done ? 'showed up' : d === today ? 'not yet' : 'missed'}`
              return (
                <li
                  key={d} role="img" aria-label={label} title={label}
                  className={cn('size-2 rounded-full', done ? 'bg-ink' : 'bg-surface-3 shadow-[inset_0_0_0_1px_var(--hairline)]', d === today && !done && 'shadow-[inset_0_0_0_1.5px_var(--ink-3)]')}
                />
              )
            })}
          </ol>
          <span className="text-small text-ink-3 tabular-nums">
            {streak.doneToday ? 'Kept today' : 'Not kept yet today'} · best {streak.best}
            {freezes ? <> · {freezes} {freezes === 1 ? 'freeze' : 'freezes'}</> : null}
          </span>
        </Link>
      </div>

      <div className="mt-6">
        <LevelBar value={s.progress} max={1} size="lg" segments={20} color="var(--pill)" label={`Level ${s.level} progress`} />
        <div className="mt-2 flex justify-between gap-3 text-small text-ink-3 tabular-nums">
          <span><b className="font-medium text-ink">{Math.round(s.progress * 100)}%</b> to level {s.level + 1}</span>
          <span>{formatNumber(s.next - s.total)} XP to go · +{formatNumber(s.today)} today</span>
        </div>
      </div>

      {/* Stats: one per area with its picture, each a door to its page. */}
      <ul className="my-6 grid grid-cols-3 gap-x-4 gap-y-4 border-t border-divider pt-5 grid-md:grid-cols-6">
        {shown.map((a) => {
          const c = CATEGORY[a.area].color
          return (
            <li key={a.area} className="min-w-0">
              <Link
                href={AREA_HREF[a.area]}
                aria-label={`${CATEGORY[a.area].label}, level ${a.level}`}
                className="-m-1.5 block rounded-md p-1.5 transition-[background-color] duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill"
              >
                <span className="flex items-center gap-2 text-small text-ink-2">
                  <Picture of="area" to={a.area} size={20} />
                  <span className="truncate">{CATEGORY[a.area].label}</span>
                </span>
                <span className="mt-1 flex items-center gap-1.5">
                  <span className="text-heading font-medium text-ink whitespace-nowrap tabular-nums">Lv {a.level}</span>
                  {a.medal ? <MedalDisc medal={a.medal.medal} size={14} label={`${a.medal.label} medal`} /> : null}
                </span>
                <LevelBar value={a.progress} max={1} size="sm" color={c} label={`${CATEGORY[a.area].label} level ${a.level} progress`} className="mt-2" />
              </Link>
            </li>
          )
        })}
      </ul>

      {/* The next title, and the whole track behind a link. */}
      <details className="group/titles mt-auto border-t border-divider pt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-md text-small text-ink-2 select-none focus-visible:outline-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
          <span>
            {s.nextTitle
              ? <>Next title: <b className="font-medium text-ink">{s.nextTitle.title}</b> at level {s.nextTitle.level}{then ? <>, then {then.title} at {then.level}</> : null}.</>
              : <>You hold the highest title, <b className="font-medium text-ink">{s.title}</b>.</>}
          </span>
          <span className={buttonLinkClass('shrink-0')}>All titles</span>
        </summary>
        {children ? <div className="pt-3">{children}</div> : null}
      </details>
    </Card>
  )
}
