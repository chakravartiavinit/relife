import Link from 'next/link'
import { cn } from '../../cn'
import { CapsuleIcon } from '../capsule-icon'

const R = 17.5
const CIRC = 2 * Math.PI * R

/**
 * You: the user's capsule initial inside a ring that fills as the level progresses, an ink pill with the level on
 * its corner. Opens You. Without data (loading) it is the same ring, empty.
 */
export function AvatarRing({ initial, level, progress, className }: { initial: string; level?: number; progress?: number; className?: string }) {
  const p = Math.max(0, Math.min(1, progress ?? 0))
  const label = level ? `You: level ${level}, ${Math.round(p * 100)}% to level ${level + 1}` : 'You'
  return (
    <Link
      href="/you"
      aria-label={label}
      className={cn('relative grid size-12 shrink-0 place-items-center rounded-full transition-[scale] duration-150 ease-out-quint after:absolute after:inset-0 after:rounded-full after:content-[""] active:scale-96 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pill', className)}
    >
      <span aria-hidden className="relative inline-grid size-10 place-items-center">
        <svg width="40" height="40" viewBox="0 0 40 40" className="absolute inset-0">
          <circle cx="20" cy="20" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="3" />
          <circle cx="20" cy="20" r={R} fill="none" stroke="var(--pill)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${p * CIRC} ${CIRC}`} transform="rotate(-90 20 20)" />
        </svg>
        <CapsuleIcon letter={initial} size="xs" />
        {level ? <span className="absolute -right-1 -bottom-[3px] h-4 min-w-5 rounded-full bg-ink px-1 text-center text-label leading-4 font-bold tracking-normal text-bg tabular-nums shadow-[0_0_0_2px_var(--bg)]">{level}</span> : null}
      </span>
    </Link>
  )
}
