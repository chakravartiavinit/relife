import type { Medal } from '@/domain/xp'
import { cn } from '../cn'

// Level, medals and achievements. Server components; data comes from core/xp.ts.

export const MEDAL_COLOR: Record<Medal | 'bronze' | 'silver' | 'gold', string> = {
  bronze: 'var(--medal-bronze)',
  silver: 'var(--medal-silver)',
  gold: 'var(--medal-gold)',
  sakura: 'var(--medal-sakura)',
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

/** Every title as a stepped track: passed, current, ahead. */
export function TitleTrack({ level, titles }: { level: number; titles: { level: number; title: string }[] }) {
  const current = [...titles].reverse().find((t) => level >= t.level)!
  const ci = titles.indexOf(current)
  // Phones show four titles around the current one (one before, two after) so labels never touch; wider screens show all.
  const lo = Math.max(0, Math.min(ci - 1, titles.length - 4))
  return (
    <div className="pb-1">
      <ol aria-label="Titles" className="flex">
        {titles.map((t, i) => {
          const reached = level >= t.level
          const isCurrent = t === current
          const far = i < lo || i > lo + 3
          return (
            <li key={t.level} className={cn('relative flex flex-1 flex-col items-center text-center', far && 'max-md:hidden')} aria-current={isCurrent ? 'step' : undefined}>
              {i > 0 ? <span aria-hidden className={cn('absolute top-[15px] right-1/2 left-[-50%] h-[2px] rounded-full', i === lo && 'max-md:hidden', reached ? 'bg-ink' : 'bg-ink/10 dark:bg-white/12')} /> : null}
              <span className={cn(
                'relative z-10 grid size-8 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
                isCurrent ? 'bg-pill text-white shadow-[0_0_0_4px_color-mix(in_oklch,var(--pill)_25%,transparent)]' : reached ? 'bg-ink text-bg' : 'bg-surface text-ink-3 shadow-[inset_0_0_0_1.5px_var(--hairline)]',
              )}>
                {t.level}
              </span>
              <span className={cn('mt-2 text-[12px] leading-tight max-md:text-[11px]', isCurrent ? 'font-semibold text-ink' : reached ? 'text-ink-2' : 'text-ink-3')}>{t.title}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

