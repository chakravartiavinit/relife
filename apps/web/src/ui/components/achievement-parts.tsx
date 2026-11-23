import { Lock, Trophy } from 'lucide-react'
import { ACHIEVEMENT_ICON as ICON, TIER_COLOR as TIER } from '../achievement-icons'
import type { CATEGORY } from '../tokens'

export type BoardItem = {
  key: string; name: string; description: string; tier: 'bronze' | 'silver' | 'gold'
  area: keyof typeof CATEGORY | 'general'; xp: number
  unlockedAt: string | null
  /** The day it unlocked, in the user's time zone. */
  unlockedOn: string | null; progress: { value: number; target: number }
}

export const fmt = (n: number) => new Intl.NumberFormat('en-IN').format(n)

/** Locked achievements, closest first. */
export const lockedFirst = (items: BoardItem[]) =>
  items.filter((a) => !a.unlockedAt).sort((a, b) => b.progress.value / b.progress.target - a.progress.value / a.progress.target)

/** The three closest to unlocking. At target means it unlocks on the next check: not "almost there" any more. */
export const almostThere = (items: BoardItem[]) =>
  lockedFirst(items).filter((a) => a.progress.value > 0 && a.progress.value < a.progress.target).slice(0, 3)

/**
 * The badge art. Unlocked: a lit medal in its tier colour. Locked: the same icon on a faint tier wash,
 * with a ring that fills as you get closer and a lock, so locked never relies on colour alone.
 */
export function Medallion({ a, size = 64 }: { a: BoardItem; size?: number }) {
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
          ? { inset: 0, color: 'white', background: c, boxShadow: `inset 0 0 0 1.5px color-mix(in oklch, ${c} 72%, black)` }
          : { inset: size * 0.1, color: `color-mix(in oklch, ${c} 70%, var(--ink-3))`, background: `color-mix(in oklch, ${c} 12%, var(--surface-2))`, boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
      >
        <Icon className={done ? 'size-[44%]' : 'size-[42%]'} strokeWidth={2} />
      </span>
      {!done ? (
        <span className="absolute -end-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-surface text-ink-3 shadow-1">
          <Lock className="size-2.5" strokeWidth={2.5} />
        </span>
      ) : null}
    </span>
  )
}
