import Link from 'next/link'
import { Award, Lock, Trophy } from 'lucide-react'
import type { Medal } from '@/domain/xp'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '../tokens'
import { Capsule } from './capsule'
import { Card, CardHeader } from './card'
import { buttonClass } from './button'
import { cn } from '../cn'

// Level, medals and achievements. Server components; data comes from core/xp.ts.

export const MEDAL_COLOR: Record<Medal | 'bronze' | 'silver' | 'gold', string> = {
  bronze: 'var(--medal-bronze)',
  silver: 'var(--medal-silver)',
  gold: 'var(--medal-gold)',
  sakura: 'var(--medal-sakura)',
}

/** The level number on an ink tile. Concentric: 12px radius on a 44px tile. */
export function LevelMark({ level, size = 'md' }: { level: number; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'size-10 rounded-[10px]', md: 'size-12 rounded-[12px]', lg: 'size-20 rounded-[20px]' }[size]
  const num = { sm: 'text-[17px]', md: 'text-[20px]', lg: 'text-[34px]' }[size]
  return (
    <span className={cn('grid shrink-0 place-items-center bg-ink text-bg shadow-[inset_0_1px_0_oklch(1_0_0/0.15)]', box)} aria-label={`Level ${level}`}>
      <span className="flex flex-col items-center leading-none">
        <span className={cn('font-medium uppercase opacity-60', size === 'lg' ? 'text-[11px] tracking-[0.12em]' : 'text-[8px] tracking-[0.1em]')}>Lv</span>
        <span className={cn('font-display font-bold tabular-nums', num)}>{level}</span>
      </span>
    </span>
  )
}

/** A medal with ribbon tails. Without a medal it shows an empty dashed slot. */
export function MedalDisc({ medal, size = 28, label }: { medal: Medal | null; size?: number; label?: string }) {
  if (!medal) {
    return (
      <svg viewBox="0 0 32 40" width={size} height={size * 1.25} role="img" aria-label={label ?? 'No medal yet'} className="shrink-0 text-ink-3">
        <circle cx="16" cy="15" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      </svg>
    )
  }
  const c = MEDAL_COLOR[medal]
  return (
    <svg viewBox="0 0 32 40" width={size} height={size * 1.25} role="img" aria-label={label ?? `${medal} medal`} className="shrink-0 drop-shadow-[0_1px_1px_oklch(0_0_0/0.18)]">
      <path d="M10 21 6 38l4.5-2.6L14 39l2-14Z" style={{ fill: `color-mix(in oklch, ${c} 72%, black)` }} />
      <path d="M22 21 26 38l-4.5-2.6L18 39l-2-14Z" style={{ fill: `color-mix(in oklch, ${c} 82%, black)` }} />
      <circle cx="16" cy="15" r="13" style={{ fill: c }} />
      <circle cx="16" cy="15" r="9.5" fill="none" strokeWidth="1.2" style={{ stroke: `color-mix(in oklch, ${c} 45%, white)` }} />
      <path d="m16 9.2 1.7 3.5 3.8.5-2.8 2.7.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.7 3.8-.5Z" style={{ fill: `color-mix(in oklch, ${c} 35%, white)` }} />
    </svg>
  )
}

/** Circular progress around the level number. */
export function LevelRing({ level, progress, size = 148 }: { level: number; progress: number; size?: number }) {
  const r = 44, c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Level ${level}, ${Math.round(progress * 100)}% to the next level`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--hairline)" strokeWidth="7" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="var(--pill)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c}
          className="reveal-ring"
          style={{ '--len': c, '--off': c * (1 - Math.min(1, Math.max(0.02, progress))) } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-[16%] grid place-items-center rounded-full bg-ink text-bg shadow-[inset_0_1px_0_oklch(1_0_0/0.15),0_8px_20px_-8px_oklch(0.2_0.04_250/0.5)]">
        <span className="flex flex-col items-center leading-none">
          <span className="text-[10px] font-semibold tracking-[0.16em] uppercase opacity-60">Level</span>
          <span className="mt-1 font-display text-[40px] font-bold tabular-nums">{level}</span>
        </span>
      </div>
    </div>
  )
}

/** Every title as a stepped track: passed, current, ahead. */
export function TitleTrack({ level, titles }: { level: number; titles: { level: number; title: string }[] }) {
  const current = [...titles].reverse().find((t) => level >= t.level)!
  const ci = titles.indexOf(current)
  // Phones show the two titles either side of the current one; wider screens show all.
  const lo = Math.max(0, Math.min(ci - 2, titles.length - 5))
  return (
    <div className="pb-1">
      <ol aria-label="Titles" className="flex">
        {titles.map((t, i) => {
          const reached = level >= t.level
          const isCurrent = t === current
          const far = i < lo || i > lo + 4
          return (
            <li key={t.level} className={cn('relative flex flex-1 flex-col items-center text-center', far && 'max-md:hidden')} aria-current={isCurrent ? 'step' : undefined}>
              {i > 0 ? <span aria-hidden className={cn('absolute top-[15px] right-1/2 left-[-50%] h-[2px] rounded-full', i === lo && 'max-md:hidden', reached ? 'bg-ink' : 'bg-ink/10 dark:bg-white/12')} /> : null}
              <span className={cn(
                'relative z-10 grid size-8 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
                isCurrent ? 'bg-pill text-white shadow-[0_0_0_4px_color-mix(in_oklch,var(--pill)_25%,transparent)]' : reached ? 'bg-ink text-bg' : 'bg-surface text-ink-3 shadow-[inset_0_0_0_1.5px_var(--hairline)]',
              )}>
                {t.level}
              </span>
              <span className={cn('mt-2 text-[12px] leading-tight', isCurrent ? 'font-semibold text-ink' : reached ? 'text-ink-2' : 'text-ink-3')}>{t.title}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

type Summary = {
  level: number; title: string; total: number; floor: number; next: number; progress: number; today: number
  nextTitle: { level: number; title: string } | null
  areas: { area: keyof typeof CATEGORY; xp: number; level: number; progress: number; medal: { medal: Medal; label: string } | null }[]
  recent: { key: string; name: string; tier: 'bronze' | 'silver' | 'gold' }[]
}

/** Compact level card for Today's header. */
export function LevelChip({ s }: { s: Summary }) {
  return (
    <Link
      href="/profile"
      className="flex w-full items-center gap-3 rounded-lg sm:w-72 bg-surface px-3 py-3 shadow-1 transition-[box-shadow] duration-150 hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
    >
      <LevelMark level={s.level} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-ink">{s.title}</span>
          <span className="shrink-0 text-[12px] font-medium text-pill-ink tabular-nums">+{formatNumber(s.today)} XP today</span>
        </span>
        <Capsule value={s.progress} max={1} size="sm" color="var(--pill)" label={`Level ${s.level} progress`} className="mt-2" />
        <span className="mt-1 block text-[11px] text-ink-3 tabular-nums">{formatNumber(s.next - s.total)} XP to level {s.level + 1}</span>
      </span>
    </Link>
  )
}

/** Overview card: level, area levels with medals, latest achievements. */
export function LevelPanel({ s }: { s: Summary }) {
  return (
    <Card className="p-6">
      <CardHeader
        title="Level" icon={<Trophy strokeWidth={2} />} color="var(--medal-gold)"
        description="XP from keeping your plan and from measures that are the same for everyone"
        action={<Link href="/profile" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Profile</Link>}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex items-start gap-5">
          <LevelMark level={s.level} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-[24px] leading-tight font-bold tracking-[-0.02em] text-ink">{s.title}</div>
            <div className="mt-1 text-[13px] text-ink-3 tabular-nums">{formatNumber(s.total)} XP · +{formatNumber(s.today)} today</div>
            <Capsule value={s.progress} max={1} color="var(--pill)" label={`Level ${s.level} progress`} className="mt-4" />
            <div className="mt-2 flex justify-between text-[12px] text-ink-3 tabular-nums">
              <span>{formatNumber(s.next - s.total)} XP to level {s.level + 1}</span>
              {s.nextTitle ? <span>{s.nextTitle.title} at {s.nextTitle.level}</span> : null}
            </div>
            {s.recent.length ? (
              <ul aria-label="Latest achievements" className="mt-5 flex flex-wrap gap-2">
                {s.recent.map((a) => (
                  <li key={a.key} className="flex h-8 items-center gap-2 rounded-full bg-surface-2 pr-3 pl-1 text-[12.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--hairline)]">
                    <MedalDisc medal={a.tier} size={24} label={`${a.tier} achievement`} />
                    {a.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <ul aria-label="Area levels" className="flex flex-col gap-3">
          {s.areas.map((a) => (
            <li key={a.area} className="grid grid-cols-[7rem_3rem_minmax(0,1fr)_28px] items-center gap-3">
              <span className="flex items-center gap-2 text-[13px] text-ink-2"><span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY[a.area].color }} />{CATEGORY[a.area].label}</span>
              <span className="text-[13px] font-semibold text-ink tabular-nums">Lv {a.level}</span>
              <Capsule value={a.progress} max={1} size="sm" color={CATEGORY[a.area].color} label={`${CATEGORY[a.area].label} level ${a.level} progress`} />
              <MedalDisc medal={a.medal?.medal ?? null} label={a.medal ? `${a.medal.label} medal in ${CATEGORY[a.area].label}` : `No ${CATEGORY[a.area].label} medal yet`} />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

/** One achievement: coloured when unlocked, muted with progress when locked. */
export function AchievementTile({ a }: {
  a: { key: string; name: string; description: string; tier: 'bronze' | 'silver' | 'gold'; xp: number; unlockedAt: Date | null; progress: { value: number; target: number } }
}) {
  const done = !!a.unlockedAt
  return (
    <li className={cn('flex h-full gap-3 rounded-lg p-4', done ? 'bg-surface shadow-1' : 'bg-surface-2/60 shadow-[inset_0_0_0_1px_var(--hairline)]')}>
      {done ? <MedalDisc medal={a.tier} size={36} label={`${a.tier} achievement`} /> : (
        <span aria-label="Locked" className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 shadow-[inset_0_0_0_1.5px_var(--hairline)]"><Lock className="size-4" strokeWidth={1.5} aria-hidden /></span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn('text-[14px] font-semibold', done ? 'text-ink' : 'text-ink-2')}>{a.name}</span>
          {a.xp ? <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">+{a.xp} XP</span> : null}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{a.description}</p>
        {done ? (
          <p className="mt-2 text-[12px] text-ink-3">Unlocked {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(a.unlockedAt!)}</p>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <Capsule value={a.progress.value} max={a.progress.target} size="sm" color="var(--ink-3)" label={`${a.name} progress`} />
            <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">{formatNumber(a.progress.value)}/{formatNumber(a.progress.target)}</span>
          </div>
        )}
      </div>
    </li>
  )
}
