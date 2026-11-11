import { RANK, type RankKey } from '../../tokens'
import { cn } from '../../cn'

/** A System rank, E (easy) to S (very hard). The letter says it; colour only tints it. */
export function RankLetter({ rank, size = 20, className }: { rank: RankKey; size?: 20 | 28; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`Rank ${rank}`}
      style={{ '--rk': RANK[rank] } as React.CSSProperties}
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-[color-mix(in_srgb,var(--rk)_12%,transparent)] font-mono font-medium text-[var(--rk)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--rk)_28%,transparent)]',
        size === 28 ? 'size-7 rounded-[7px] text-[13px]' : 'size-5 rounded-[5px] text-[11px]',
        className,
      )}
    >
      {/* S: a two-stop gradient on the letter where supported; the flat --rank-s is the fallback. */}
      {rank === 'S' ? <b className="bg-[linear-gradient(135deg,var(--rank-s)_20%,var(--rank-s-2)_85%)] bg-clip-text font-medium text-transparent">S</b> : rank}
    </span>
  )
}
