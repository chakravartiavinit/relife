import Link from 'next/link'
import { CapsuleIcon } from '../capsule-icon'
import { LevelBar } from '../capsule'
import { AvatarRing } from './avatar-ring'

/**
 * You, at the foot of the sidebar: the capsule with the name, level and title, and the segmented XP bar to the next level.
 * In the 72px rail it is the level ring. Both open You; the CSS `rail:` variant picks one, so a saved rail never flashes the
 * card. Without data (loading) it is the same card with an empty bar.
 */
export function SidebarProfile({ name, level }: { name?: string; level?: { level: number; title: string; progress: number } }) {
  const first = name?.trim().split(/\s+/)[0] || 'You'
  const pct = Math.round((level?.progress ?? 0) * 100)
  const label = level ? `You: ${first}, level ${level.level}, ${level.title}, ${pct}% to level ${level.level + 1}` : 'You'
  return (
    <div data-tour="/you">
      <Link
        href="/you"
        aria-label={label}
        className="block rounded-lg bg-surface p-3 shadow-1 transition-[background-color,scale] duration-150 ease-out-quint hover-fine:bg-surface-2 active:scale-96 focus-visible:outline-2 focus-visible:outline-pill rail:hidden"
      >
        {/* The link's name says it all; the card is the picture of it. */}
        <div aria-hidden>
          <div className="mb-2.5 flex items-center gap-3">
            <CapsuleIcon letter={(first[0] ?? 'R').toUpperCase()} size="nav" className="mx-1" />
            <div className="min-w-0">
              <div className="truncate text-body font-medium text-ink">{first}</div>
              <div className="h-4 truncate text-caption text-ink-3">{level ? `Level ${level.level} · ${level.title}` : null}</div>
            </div>
          </div>
          <LevelBar value={level?.progress ?? 0} max={1} size="sm" segments={20} label={level ? `XP to level ${level.level + 1}` : 'XP'} />
          <div className="mt-1.5 h-4 text-caption text-ink-3 tabular-nums">{level ? `${pct}% to Lv ${level.level + 1}` : null}</div>
        </div>
      </Link>
      <AvatarRing initial={(first[0] ?? 'R').toUpperCase()} level={level?.level} progress={level?.progress} className="hidden rail:grid rail:mx-auto" />
    </div>
  )
}
