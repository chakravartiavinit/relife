import Link from 'next/link'
import { Flame, Snowflake } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { xpSummary } from '@/core/xp'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '../tokens'
import { Capsule } from './capsule'
import { MedalDisc } from './xp'
import { cn } from '../cn'
import { AREA_ICON, CapsuleIcon } from './capsule-icon'
import { Ticker } from './ticker'

// The character sheet at the top of Today and Progress: who you are in the game (level, title, XP),
// your streak, and your areas as stats. One component so the two pages always agree.

type Summary = Awaited<ReturnType<typeof xpSummary>>
const AREA_HREF: Record<Category, string> = { health: '/health', mind: '/mind', skills: '/skills', wealth: '/wealth', hobbies: '/hobbies', relationships: '/people' }

export function CharacterBanner({ s, name, heading, eyebrow, streak, freezes, areas, children }: {
  s: Summary
  name: string
  /** Big line: a greeting on Today, the title on Progress. */
  heading: string
  eyebrow?: React.ReactNode
  streak: { current: number; best: number; doneToday: boolean }
  freezes: number
  /** Areas the user picked; empty shows all of them. */
  areas?: Category[]
  children?: React.ReactNode
}) {
  const shown = s.areas.filter((a) => !areas?.length || areas.includes(a.area))
  const initial = (name.trim()[0] ?? 'R').toUpperCase()
  return (
    <section aria-label="Your character" className="relative isolate overflow-hidden rounded-[24px] bg-surface shadow-2">
      <div aria-hidden className="halftone inset-y-0 right-0 -z-10 w-1/2" />
      <div className="grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:p-6">
        <div className="flex items-center gap-4 sm:contents">
          <CapsuleIcon letter={initial} size="lg" className="ms-2" />
          <div className="min-w-0 sm:hidden"><Heading heading={heading} eyebrow={eyebrow} s={s} /></div>
        </div>

        <div className="min-w-0">
          <div className="max-sm:hidden"><Heading heading={heading} eyebrow={eyebrow} s={s} /></div>
          <div className="mt-3 max-w-xl">
            <Capsule value={s.progress} max={1} size="md" color="var(--pill)" label={`Level ${s.level} progress`} />
            <div className="mt-1.5 flex justify-between gap-3 text-[12px] text-ink-3 tabular-nums">
              <span><Ticker value={s.next - s.total} /> XP to level {s.level + 1}</span>
              <span className="font-medium text-pill-ink">+<Ticker value={s.today} /> XP today</span>
            </div>
          </div>
        </div>

        <Link
          href="/you#streak"
          className="flex items-center gap-3 rounded-[16px] bg-surface/70 px-4 py-3 shadow-1 backdrop-blur-sm transition-[box-shadow] duration-150 hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill sm:flex-col sm:items-center sm:gap-1 sm:px-5 sm:text-center"
        >
          <Flame className={cn('size-6', streak.current ? 'text-[var(--medal-gold)]' : 'text-ink-3')} strokeWidth={2} aria-hidden />
          <span>
            <span className="block font-display text-[26px] leading-none font-extrabold text-ink tabular-nums">{streak.current}</span>
            <span className="mt-1 block text-[11.5px] text-ink-3">
              {streak.current === 1 ? 'day streak' : 'day streak'}
              {freezes ? <> · <Snowflake className="inline size-3 -translate-y-px text-sky" strokeWidth={2} aria-hidden />{freezes}<span className="sr-only"> streak freezes</span></> : null}
            </span>
          </span>
          <span className="sr-only">{streak.doneToday ? 'Kept today.' : 'Not kept yet today.'} Best {streak.best} days.</span>
        </Link>
      </div>

      {/* Stats: one per area, each a door to its page. */}
      <ul className="grid gap-px bg-divider/60" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((a) => {
          const Icon = AREA_ICON[a.area]
          const c = CATEGORY[a.area].color
          return (
            <li key={a.area} className="bg-surface/80 backdrop-blur-sm sm:min-w-0">
              <Link
                href={AREA_HREF[a.area]}
                aria-label={`${CATEGORY[a.area].label}, level ${a.level}`}
                className="group flex flex-col items-center gap-1.5 px-2 py-3 transition-[background-color] duration-150 hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pill sm:flex-row sm:gap-3 sm:px-5"
              >
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[9px]" style={{ color: `color-mix(in oklch, ${c} 80%, var(--ink))`, background: `color-mix(in oklch, ${c} 16%, transparent)` }}>
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                {/* Name on its own line and the level kept whole, so neither truncates in a sixth of the banner. */}
                <span className="w-full min-w-0 flex-1">
                  <span className="block truncate text-[12px] leading-4 text-ink-3 max-sm:hidden">{CATEGORY[a.area].label}</span>
                  <span className="mt-0.5 flex items-center justify-center gap-1.5 sm:justify-start">
                    <span className="text-[13.5px] leading-5 font-bold whitespace-nowrap text-ink tabular-nums">Lv {a.level}</span>
                    {a.medal ? <span className="max-sm:hidden"><MedalDisc medal={a.medal.medal} size={18} label={`${a.medal.label} medal`} /></span> : null}
                  </span>
                  <Capsule value={a.progress} max={1} size="sm" color={c} label={`${CATEGORY[a.area].label} level ${a.level} progress`} className="mt-1.5" />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {children}
    </section>
  )
}

function Heading({ heading, eyebrow, s }: { heading: string; eyebrow?: React.ReactNode; s: Summary }) {
  return (
    <>
      {eyebrow ? <div className="mb-1 text-[12.5px] text-ink-3">{eyebrow}</div> : null}
      <h1 className="font-display text-[26px] leading-[1.05] font-extrabold tracking-[-0.03em] text-ink sm:text-[32px]">{heading}</h1>
      <p className="mt-1 text-[13.5px] text-ink-2">
        <span className="inline-flex h-6 items-center rounded-full bg-ink px-2 text-[12px] font-bold text-bg tabular-nums">Lv {s.level}</span>
        <span className="ms-2 font-semibold text-ink">{s.title}</span>
        <span className="text-ink-3"> · {formatNumber(s.total)} XP</span>
      </p>
    </>
  )
}
