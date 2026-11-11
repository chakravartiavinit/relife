import Link from 'next/link'
import { Flame, Snowflake } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { xpSummary } from '@/core/xp'
import { formatNumber } from '@/domain/money'
import { AREA_ICON } from '../area-art'
import { AREA_HREF } from '../nav-model'
import { CATEGORY } from '../tokens'
import { Bar } from './kit/bar'
import { Ring } from './kit/ring'
import { MedalDisc } from './xp'
import { cn } from '../cn'
import { Ticker } from './ticker'

// The character sheet at the top of Today and Character: who you are in the game (level, title, XP),
// your streak, and your areas as stats. One component so the two pages always agree. PR B replaces it with Hero.

type Summary = Awaited<ReturnType<typeof xpSummary>>

export function CharacterBanner({ s, heading, eyebrow, streak, freezes, areas, children }: {
  s: Summary
  /** Big line: a greeting on Today, the title on Character. */
  heading: string
  eyebrow?: React.ReactNode
  streak: { current: number; best: number; doneToday: boolean }
  freezes: number
  /** Areas the user picked; empty shows all of them. */
  areas?: Category[]
  children?: React.ReactNode
}) {
  const shown = s.areas.filter((a) => !areas?.length || areas.includes(a.area))
  return (
    <section aria-label="Your character" className="relative isolate overflow-hidden rounded-lg bg-raised shadow-1">
      <div className="grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:p-6">
        <div className="flex items-center gap-4 sm:contents">
          <Ring
            value={s.total - s.floor} max={s.next - s.floor} size={96} stroke={6} label={`Level ${s.level}, ${formatNumber(s.total - s.floor)} of ${formatNumber(s.next - s.floor)} XP`}
            center={<><span className="font-mono text-[11px] leading-4 tracking-[0.08em] text-ink-3">LV</span><span className="text-[28px] leading-8 font-semibold tracking-[-0.03em] tabular-nums">{s.level}</span></>}
          />
          <div className="min-w-0 sm:hidden"><Heading heading={heading} eyebrow={eyebrow} s={s} /></div>
        </div>

        <div className="min-w-0">
          <div className="max-sm:hidden"><Heading heading={heading} eyebrow={eyebrow} s={s} /></div>
          <div className="mt-3 max-w-xl">
            <Bar value={s.progress} max={1} size={6} color="var(--accent)" label={`Level ${s.level} progress`} />
            <div className="mt-1.5 flex justify-between gap-3 text-[12px] text-ink-3 tabular-nums">
              <span><Ticker value={s.next - s.total} /> XP to level {s.level + 1}</span>
              <span className="font-mono text-mint">+<Ticker value={s.today} /> XP today</span>
            </div>
          </div>
        </div>

        <Link
          href="/character#streak"
          className="stat-bg flex items-center gap-3 rounded-lg px-4 py-3 transition-[background-color] duration-150 hover:bg-raised-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-col sm:items-center sm:gap-1 sm:px-5 sm:text-center"
        >
          <Flame className={cn('size-6', streak.current ? 'text-amber' : 'text-ink-3')} strokeWidth={2} aria-hidden />
          <span>
            <span className="block text-[24px] leading-8 font-semibold tracking-[-0.02em] text-ink tabular-nums">{streak.current}</span>
            <span className="t-meta block">
              day streak
              {freezes ? <> · <Snowflake className="inline size-3 -translate-y-px text-skills" strokeWidth={2} aria-hidden />{freezes}<span className="sr-only"> streak freezes</span></> : null}
            </span>
          </span>
          <span className="sr-only">{streak.doneToday ? 'Kept today.' : 'Not kept yet today.'} Best {streak.best} days.</span>
        </Link>
      </div>

      {/* Stats: one per area, each a door to its page. */}
      <ul className="grid gap-px bg-line" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((a) => {
          const Icon = AREA_ICON[a.area]
          const c = CATEGORY[a.area].color
          return (
            <li key={a.area} className="bg-raised sm:min-w-0">
              <Link
                href={AREA_HREF[a.area]}
                aria-label={`${CATEGORY[a.area].label}, level ${a.level}`}
                className="group flex flex-col items-center gap-1.5 px-2 py-3 transition-[background-color] duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:flex-row sm:gap-3 sm:px-5"
              >
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                {/* Name on its own line and the level kept whole, so neither truncates in a sixth of the banner. */}
                <span className="w-full min-w-0 flex-1">
                  <span className="t-meta block truncate max-sm:hidden">{CATEGORY[a.area].label}</span>
                  <span className="mt-0.5 flex items-center justify-center gap-1.5 sm:justify-start">
                    <span className="text-[13px] leading-5 font-semibold whitespace-nowrap text-ink tabular-nums">Lv {a.level}</span>
                    {a.medal ? <span className="max-sm:hidden"><MedalDisc medal={a.medal.medal} size={18} label={`${a.medal.label} medal`} /></span> : null}
                  </span>
                  <Bar value={a.progress} max={1} size={4} color={c} label={`${CATEGORY[a.area].label} level ${a.level} progress`} className="mt-1.5" />
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
      {eyebrow ? <div className="mb-1 font-mono text-[12px] leading-4 text-ink-3">{eyebrow}</div> : null}
      <h1 className="t-hero">{heading}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
        <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3">LV {s.level}</span>
        <span className="font-medium text-ink">{s.title}</span>
        <span className="font-mono text-[12px] text-ink-3">· {formatNumber(s.total)} XP</span>
      </p>
    </>
  )
}
