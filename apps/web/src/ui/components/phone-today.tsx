import Link from 'next/link'
import { Flame, Snowflake } from 'lucide-react'
import type { xpSummary } from '@/core/xp'
import { formatNumber } from '@/domain/money'
import { cn } from '../cn'
import { Capsule } from './capsule'
import { CapsuleIcon } from './capsule-icon'
import { CommandIconButton } from './command-menu'
import { Ticker } from './ticker'

// Today on a phone (under 768px): a greeting with search, a compact character card, then the quick log. The page shows
// these in place of the desktop banner; everything else on Today is the same components, reordered.

type Summary = Pick<Awaited<ReturnType<typeof xpSummary>>, 'level' | 'title' | 'total' | 'progress' | 'next' | 'today'>

export function PhoneHeader({ eyebrow, heading }: { eyebrow: React.ReactNode; heading: string }) {
  return (
    <header className="flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <p className="text-[13px] text-ink-3">{eyebrow}</p>
        <h1 className="mt-0.5 font-display text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em] text-ink">{heading}</h1>
      </div>
      <CommandIconButton />
    </header>
  )
}

export function PhoneCharacter({ s, name, streak, freezes, className }: {
  s: Summary; name: string; streak: { current: number; best: number; doneToday: boolean }; freezes: number; className?: string
}) {
  return (
    <section aria-label="Your character" className={cn('relative isolate overflow-hidden rounded-lg bg-surface px-4 pt-3.5 pb-4 shadow-1', className)}>
      <div aria-hidden className="halftone inset-y-0 right-0 -z-10 w-1/2" />
      <div className="flex items-center gap-3.5">
        <CapsuleIcon letter={(name.trim()[0] ?? 'R').toUpperCase()} size="md" className="ms-1" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[16px] font-bold text-ink">
            <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-ink px-2 text-[12px] font-bold text-bg tabular-nums">Lv {s.level}</span>
            <span className="truncate">{s.title}</span>
          </p>
          <p className="mt-0.5 text-[13px] text-ink-3 tabular-nums">{formatNumber(s.total)} XP</p>
        </div>
        <Link
          href="/profile#streak"
          className="ms-auto flex shrink-0 flex-col items-center rounded-[14px] bg-surface/70 px-3 py-1.5 shadow-1 backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
        >
          <span className="flex items-center gap-1.5">
            <Flame className={cn('size-[18px]', streak.current ? 'text-[var(--medal-gold)]' : 'text-ink-3')} strokeWidth={2} aria-hidden />
            {freezes ? <span className="flex items-center text-[12px] text-ink-3 tabular-nums"><Snowflake className="size-3 text-sky" strokeWidth={2} aria-hidden />{freezes}<span className="sr-only"> streak freezes</span></span> : null}
          </span>
          <span className="mt-0.5 font-display text-[20px] leading-none font-extrabold text-ink tabular-nums">{streak.current}</span>
          <span className="mt-0.5 text-[12px] text-ink-3">day streak</span>
          <span className="sr-only">{streak.doneToday ? 'Kept today.' : 'Not kept yet today.'} Best {streak.best} days.</span>
        </Link>
      </div>
      <Capsule value={s.progress} max={1} size="md" color="var(--pill)" label={`Level ${s.level} progress`} className="mt-3.5" />
      <div className="mt-1.5 flex justify-between gap-3 text-[13px] text-ink-3 tabular-nums">
        <span><Ticker value={s.next - s.total} /> XP to level {s.level + 1}</span>
        <span className="font-medium text-pill-ink">+<Ticker value={s.today} /> XP today</span>
      </div>
    </section>
  )
}
