'use client'

import { useState } from 'react'
import {
  CalendarCheck, CalendarHeart, CloudSun, Crown, Flame, Footprints, GitCommitHorizontal, GitPullRequest, GraduationCap,
  HeartHandshake, Lock, Medal, Moon, Orbit, PersonStanding, PiggyBank, Rocket, RotateCcw, Shapes, Sparkles, Trophy, Waves,
  type LucideIcon,
} from 'lucide-react'
import { CATEGORY } from '../tokens'
import { Capsule } from './capsule'
import { cn } from '../cn'

export type BoardItem = {
  key: string; name: string; description: string; tier: 'bronze' | 'silver' | 'gold'
  area: keyof typeof CATEGORY | 'general'; xp: number
  unlockedAt: string | null; progress: { value: number; target: number }
}

const ICON: Record<string, LucideIcon> = {
  'first-step': Footprints, 'second-chance': RotateCcw, 'week-one': Flame, 'month-strong': CalendarCheck, 'hundred-days': Crown,
  'clean-sweep': Sparkles, 'perfect-week': CalendarHeart, 'full-circle': Orbit, 'well-rounded': Shapes, rested: Moon,
  walker: PersonStanding, 'inner-weather': CloudSun, 'still-water': Waves, 'first-commit': GitCommitHorizontal, 'ship-it': Rocket,
  reviewer: GitPullRequest, scholar: GraduationCap, 'frugal-week': PiggyBank, keeper: HeartHandshake, 'level-10': Medal, 'level-25': Trophy,
}
const TIER = { bronze: 'var(--medal-bronze)', silver: 'var(--medal-silver)', gold: 'var(--medal-gold)' }
const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }
const fmt = (n: number) => new Intl.NumberFormat('en-IN').format(n)
const date = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

type Filter = 'all' | 'unlocked' | 'locked'

/** Achievements with filters and a spotlight on the three closest to unlocking. */
export function AchievementsBoard({ items }: { items: BoardItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const unlocked = items.filter((a) => a.unlockedAt).sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!))
  const locked = items.filter((a) => !a.unlockedAt).sort((a, b) => b.progress.value / b.progress.target - a.progress.value / a.progress.target)
  const close = locked.filter((a) => a.progress.value > 0).slice(0, 3)
  const shown = filter === 'unlocked' ? unlocked : filter === 'locked' ? locked : [...unlocked, ...locked]
  const xpEarned = unlocked.reduce((s, a) => s + a.xp, 0)

  return (
    <section aria-labelledby="ach-h" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ach-h" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Achievements</h2>
          <p className="mt-0.5 text-[13px] text-ink-3 tabular-nums">{unlocked.length} of {items.length} unlocked · {fmt(xpEarned)} XP from achievements</p>
        </div>
        <div role="group" aria-label="Show" className="inline-flex rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
          {([['all', 'All', items.length], ['unlocked', 'Unlocked', unlocked.length], ['locked', 'Locked', locked.length]] as const).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
                filter === k ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover:text-ink',
              )}
            >
              {label}<span className="tabular-nums opacity-60">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {filter !== 'unlocked' && close.length ? (
        <div>
          <h3 className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Almost there</h3>
          <ul className="grid gap-3 md:grid-cols-3">
            {close.map((a) => <Spotlight key={a.key} a={a} />)}
          </ul>
        </div>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.filter((a) => filter === 'unlocked' || !close.includes(a) || a.unlockedAt).map((a) => <Tile key={a.key} a={a} />)}
      </ul>
    </section>
  )
}

function Badge({ a, size = 44 }: { a: BoardItem; size?: number }) {
  const Icon = ICON[a.key] ?? Trophy
  const done = !!a.unlockedAt
  const c = TIER[a.tier]
  return (
    <span
      aria-hidden
      className="relative grid shrink-0 place-items-center rounded-[14px]"
      style={done
        ? { width: size, height: size, color: `color-mix(in oklch, ${c} 75%, black)`, background: `linear-gradient(160deg, color-mix(in oklch, ${c} 30%, transparent), color-mix(in oklch, ${c} 14%, transparent))`, boxShadow: `inset 0 0 0 1.5px color-mix(in oklch, ${c} 55%, transparent)` }
        : { width: size, height: size, color: 'var(--ink-3)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      <Icon className={done ? 'size-[46%] dark:brightness-150' : 'size-[46%] opacity-60'} strokeWidth={2} />
      {!done ? (
        <span className="absolute -right-1 -bottom-1 grid size-[18px] place-items-center rounded-full bg-surface text-ink-3 shadow-1">
          <Lock className="size-2.5" strokeWidth={2.5} />
        </span>
      ) : null}
    </span>
  )
}

function Meta({ a }: { a: BoardItem }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
      <span className="inline-flex h-5 items-center gap-1 rounded-full px-1.5 font-medium" style={{ color: `color-mix(in oklch, ${TIER[a.tier]} 70%, var(--ink))`, background: `color-mix(in oklch, ${TIER[a.tier]} 16%, transparent)` }}>
        {TIER_LABEL[a.tier]}
      </span>
      {a.area !== 'general' ? <span className="inline-flex items-center gap-1"><span aria-hidden className="size-1.5 rounded-full" style={{ background: CATEGORY[a.area].color }} />{CATEGORY[a.area].label}</span> : null}
      {a.xp ? <span className="tabular-nums">+{fmt(a.xp)} XP</span> : null}
    </span>
  )
}

function Tile({ a }: { a: BoardItem }) {
  const done = !!a.unlockedAt
  return (
    <li className={cn('flex h-full gap-3.5 rounded-lg p-4', done ? 'bg-surface shadow-1' : 'bg-surface/60 shadow-[inset_0_0_0_1px_var(--hairline)]')}>
      <Badge a={a} />
      <div className="min-w-0 flex-1">
        <div className={cn('text-[14px] font-semibold', done ? 'text-ink' : 'text-ink-2')}>{a.name}</div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{a.description}</p>
        <div className="mt-2"><Meta a={a} /></div>
        {done ? (
          <p className="mt-2 text-[12px] text-ink-3">Unlocked {date(a.unlockedAt!)}</p>
        ) : (
          <div className="mt-2.5 flex items-center gap-2">
            <Capsule value={a.progress.value} max={a.progress.target} size="sm" color="var(--ink-3)" label={`${a.name} progress`} />
            <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">{fmt(a.progress.value)}/{fmt(a.progress.target)}</span>
          </div>
        )}
      </div>
    </li>
  )
}

function Spotlight({ a }: { a: BoardItem }) {
  const pct = Math.round((a.progress.value / a.progress.target) * 100)
  return (
    <li className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-1">
      <div className="flex items-start gap-3.5">
        <Badge a={a} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink">{a.name}</div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{a.description}</p>
        </div>
        <span className="font-display text-[20px] font-bold text-ink tabular-nums">{pct}%</span>
      </div>
      <Capsule value={a.progress.value} max={a.progress.target} size="sm" color="var(--pill)" label={`${a.name} progress`} />
      <div className="flex items-center justify-between"><Meta a={a} /><span className="text-[11.5px] text-ink-3 tabular-nums">{fmt(a.progress.target - a.progress.value)} to go</span></div>
    </li>
  )
}
