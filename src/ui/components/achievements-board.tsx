'use client'

import { useState } from 'react'
import { ChevronDown, Lock, Trophy } from 'lucide-react'
import { ACHIEVEMENT_ICON as ICON, TIER_COLOR as TIER } from '../achievement-icons'
import { CATEGORY } from '../tokens'
import { cn } from '../cn'

export type BoardItem = {
  key: string; name: string; description: string; tier: 'bronze' | 'silver' | 'gold'
  area: keyof typeof CATEGORY | 'general'; xp: number
  unlockedAt: string | null; progress: { value: number; target: number }
}

const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }
const fmt = (n: number) => new Intl.NumberFormat('en-IN').format(n)
const date = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

type Filter = 'all' | 'unlocked' | 'locked'

/** Trophy case: filters, a spotlight on the three closest to unlocking, then every badge. */
export function AchievementsBoard({ items }: { items: BoardItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  // Two rows to start; the rest is one click away so the page stays short.
  const [all, setAll] = useState(false)
  const unlocked = items.filter((a) => a.unlockedAt).sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!))
  const locked = items.filter((a) => !a.unlockedAt).sort((a, b) => b.progress.value / b.progress.target - a.progress.value / a.progress.target)
  const close = locked.filter((a) => a.progress.value > 0).slice(0, 3)
  const shown = filter === 'unlocked' ? unlocked : filter === 'locked' ? locked : [...unlocked, ...locked]
  const xpEarned = unlocked.reduce((s, a) => s + a.xp, 0)

  return (
    <section aria-labelledby="ach-h" className="flex flex-col gap-4">
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
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
                filter === k ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover:text-ink',
              )}
            >
              {label}<span className="text-ink-3 tabular-nums">{n}</span>
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

      {(() => {
        const list = shown.filter((a) => filter === 'unlocked' || !close.includes(a) || a.unlockedAt)
        const LIMIT = 8
        const visible = all ? list : list.slice(0, LIMIT)
        return (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((a) => <Tile key={a.key} a={a} />)}
            </ul>
            {list.length > LIMIT ? (
              <button
                type="button"
                aria-expanded={all}
                onClick={() => setAll((x) => !x)}
                className="inline-flex h-10 items-center justify-center gap-1.5 self-center rounded-full bg-surface px-4 text-[13px] font-medium text-ink-2 shadow-1 transition-[color,scale] duration-150 ease-out-quint hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
              >
                {all ? 'Show fewer' : `Show all ${list.length}`}
                <ChevronDown className={cn('size-4 transition-[rotate] duration-150 ease-out-quint', all && 'rotate-180')} strokeWidth={1.5} aria-hidden />
              </button>
            ) : null}
          </>
        )
      })()}
      {!shown.length ? <p className="rounded-lg bg-surface p-5 text-[13px] text-ink-3 shadow-1">Nothing here yet. Check things off and the first badges come quickly.</p> : null}
    </section>
  )
}

/**
 * The badge art. Unlocked: a lit medal in its tier colour. Locked: the same icon on a faint tier wash,
 * with a ring that fills as you get closer and a lock, so locked never relies on colour alone.
 */
function Medallion({ a, size = 64 }: { a: BoardItem; size?: number }) {
  const Icon = ICON[a.key] ?? Trophy
  const done = !!a.unlockedAt
  const c = TIER[a.tier]
  const r = 46, len = 2 * Math.PI * r
  const pct = Math.min(1, a.progress.value / a.progress.target)
  return (
    <span aria-hidden className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {!done ? (
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--hairline)" strokeWidth="5" />
          {pct > 0 ? <circle cx="50" cy="50" r={r} fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeDasharray={len} className="reveal-ring" style={{ '--len': len, '--off': len * (1 - Math.max(0.03, pct)) } as React.CSSProperties} /> : null}
        </svg>
      ) : null}
      <span
        className="absolute grid place-items-center rounded-full"
        style={done
          ? {
            inset: 0, color: 'white',
            background: `radial-gradient(circle at 32% 26%, color-mix(in oklch, ${c} 45%, white), ${c} 58%, color-mix(in oklch, ${c} 72%, black))`,
            boxShadow: `inset 0 1px 0 oklch(1 0 0 / 0.5), inset 0 -3px 6px color-mix(in oklch, ${c} 55%, black), 0 8px 18px -8px color-mix(in oklch, ${c} 80%, transparent)`,
          }
          : { inset: size * 0.1, color: `color-mix(in oklch, ${c} 70%, var(--ink-3))`, background: `color-mix(in oklch, ${c} 12%, var(--surface-2))`, boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
      >
        <Icon className={done ? 'size-[44%] drop-shadow-[0_1px_1px_oklch(0_0_0/0.3)]' : 'size-[42%]'} strokeWidth={2} />
      </span>
      {!done ? (
        <span className="absolute -end-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full bg-surface text-ink-3 shadow-1">
          <Lock className="size-2.5" strokeWidth={2.5} />
        </span>
      ) : null}
    </span>
  )
}

function Tile({ a }: { a: BoardItem }) {
  const done = !!a.unlockedAt
  const area = a.area !== 'general' ? CATEGORY[a.area] : null
  return (
    <li className={cn('flex flex-col items-center rounded-lg px-3 pt-5 pb-4 text-center', done ? 'bg-surface shadow-1' : 'bg-surface/60 shadow-[inset_0_0_0_1px_var(--hairline)]')}>
      <Medallion a={a} />
      <h3 className={cn('mt-3 text-[13.5px] font-semibold', done ? 'text-ink' : 'text-ink-2')}>{a.name}</h3>
      <p className="mt-0.5 line-clamp-2 min-h-[2lh] text-[12px] leading-snug text-ink-3">{a.description}</p>
      <p className="mt-auto flex flex-wrap items-center justify-center gap-x-1.5 pt-2.5 text-[11.5px] text-ink-3 tabular-nums">
        <span className="font-medium" style={{ color: `color-mix(in oklch, ${TIER[a.tier]} 70%, var(--ink))` }}>{TIER_LABEL[a.tier]}</span>
        {area ? <><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><span aria-hidden className="size-1.5 rounded-full" style={{ background: area.color }} />{area.label}</span></> : null}
        <span aria-hidden>·</span>
        {done ? <span>{date(a.unlockedAt!)}</span> : <span>{fmt(a.progress.value)}/{fmt(a.progress.target)}</span>}
      </p>
      <span className="sr-only">{done ? 'Unlocked' : 'Locked'}{a.xp ? `, worth ${a.xp} XP` : ''}</span>
    </li>
  )
}

function Spotlight({ a }: { a: BoardItem }) {
  const pct = Math.round((a.progress.value / a.progress.target) * 100)
  return (
    <li className="flex items-center gap-3.5 rounded-lg bg-surface p-4 shadow-1">
      <Medallion a={a} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-semibold text-ink">{a.name}</span>
          <span className="shrink-0 font-display text-[16px] font-bold text-ink tabular-nums">{pct}%</span>
        </div>
        <p className="truncate text-[12px] text-ink-3">{a.description}</p>
        <p className="mt-1.5 text-[11.5px] text-ink-3 tabular-nums">{fmt(a.progress.target - a.progress.value)} to go{a.xp ? ` · +${fmt(a.xp)} XP` : ''}</p>
      </div>
    </li>
  )
}
