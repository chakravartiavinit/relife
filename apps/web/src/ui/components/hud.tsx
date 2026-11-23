import Link from 'next/link'
import { Flame, Snowflake } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { xpSummary } from '@/core/xp'
import { addDays } from '@/core/time'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '../tokens'
import { LevelBar } from './capsule'
import { MedalDisc } from './xp'
import { cn } from '../cn'
import { Card } from './card'
import { CapsuleIcon } from './capsule-icon'
import { Ticker } from './ticker'
import { AREA_HREF } from './nav'
import { ShareButton } from './share/share-button'

// The character sheet at the head of Progress: who you are in the game (level, title, XP), one streak with this
// week's check-ins, and your areas as stats. The title track goes in as `children`.

type Summary = Awaited<ReturnType<typeof xpSummary>>

const weekday = (d: string) => new Intl.DateTimeFormat('en', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
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
  children?: React.ReactNode
}) {
  const shown = s.areas.filter((a) => !areas?.length || areas.includes(a.area))
  const initial = (name.trim()[0] ?? 'R').toUpperCase()
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  return (
    <Card as="section" id="streak" aria-labelledby="character-title" className="flex h-full scroll-mt-6 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-5">
        <div className="flex min-w-0 items-center gap-4">
          <CapsuleIcon letter={initial} size="lg" className="ms-1" />
          <div className="min-w-0">
            <p className="text-small text-ink-3">{name}</p>
            <h2 id="character-title" className="text-title text-ink">{s.title}</h2>
            <p className="text-small text-ink-3 tabular-nums">
              Level {s.level} · {formatNumber(s.total)} XP
              <ShareButton kind="level" label="Share your level" className="ms-1 align-middle" />
            </p>
          </div>
        </div>

        <Link href="/plan/routines" className="-m-2 flex min-w-0 flex-col gap-2 rounded-lg p-2 transition-[background-color] duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill sm:items-end">
          <span className="flex items-center gap-1.5 text-body font-medium text-ink tabular-nums">
            <Flame className={cn('size-4', streak.current ? 'text-(--medal-gold)' : 'text-ink-3')} strokeWidth={1.5} aria-hidden />
            {streak.current}-day streak
            {freezes ? <span className="inline-flex items-center gap-0.5 font-normal text-ink-3"><Snowflake className="size-3 text-sky" strokeWidth={1.5} aria-hidden />{freezes}<span className="sr-only"> streak freezes</span></span> : null}
          </span>
          <ol aria-label="Last 7 days" className="flex gap-1">
            {week.map((d) => {
              const done = streak.active.has(d)
              const label = `${longDay(d)}${d === today ? ' (today)' : ''}: ${done ? 'showed up' : d === today ? 'not yet' : 'missed'}`
              return (
                <li
                  key={d} role="img" aria-label={label} title={label}
                  className={cn(
                    'grid size-6 place-items-center rounded-full text-caption font-medium',
                    done ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-3 shadow-[inset_0_0_0_1px_var(--hairline)]',
                    d === today && !done && 'shadow-[inset_0_0_0_1.5px_var(--ink-3)]',
                  )}
                >{weekday(d)}</li>
              )
            })}
          </ol>
          <span className="text-caption text-ink-3 tabular-nums">{streak.doneToday ? 'Kept today.' : 'Not kept yet today.'} Best {streak.best} days.</span>
        </Link>
      </div>

      <div className="mt-5">
        <LevelBar value={s.progress} max={1} size="lg" segments={20} color="var(--pill)" label={`Level ${s.level} progress`} />
        <div className="mt-2 flex justify-between gap-3 text-small text-ink-3 tabular-nums">
          <span><b className="font-medium text-ink"><Ticker value={s.next - s.total} /></b> XP to level {s.level + 1}</span>
          <span className="font-medium text-pill-ink">+<Ticker value={s.today} /> XP today</span>
        </div>
      </div>

      {/* Stats: one per area, each a door to its page. */}
      <ul className="mt-5 grid grid-cols-3 gap-x-4 gap-y-4 border-t border-divider pt-4 grid-md:grid-cols-6">
        {shown.map((a) => {
          const c = CATEGORY[a.area].color
          return (
            <li key={a.area} className="min-w-0">
              <Link
                href={AREA_HREF[a.area]}
                aria-label={`${CATEGORY[a.area].label}, level ${a.level}`}
                className="-m-1.5 block rounded-md p-1.5 transition-[background-color] duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill"
              >
                <span className="flex items-center gap-1.5 text-small text-ink-3"><span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: c }} /><span className="truncate">{CATEGORY[a.area].label}</span></span>
                <span className="mt-1 flex items-center gap-1.5">
                  <span className="num text-heading text-ink whitespace-nowrap">Lv {a.level}</span>
                  {a.medal ? <MedalDisc medal={a.medal.medal} size={16} label={`${a.medal.label} medal`} /> : null}
                </span>
                <LevelBar value={a.progress} max={1} size="sm" color={c} label={`${CATEGORY[a.area].label} level ${a.level} progress`} className="mt-1.5" />
              </Link>
            </li>
          )
        })}
      </ul>
      {children ? <div className="mt-5 border-t border-divider pt-4">{children}</div> : null}
    </Card>
  )
}
