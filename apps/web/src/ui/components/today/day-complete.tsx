'use client'

import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Check } from 'lucide-react'
import { streakMilestone } from '@/domain/share-card'
import { cn } from '@/ui/cn'
import { Capsule } from '../capsule'
import { Card } from '../card'
import { ShareButton } from '../share/share-button'
import { ChestArt, ChestModal, RARITY, type ChestItem } from '../quests'

const PIECES = [
  { left: '14%', color: 'var(--pill)', dx: '-14px', rot: '200deg', d: '0s' },
  { left: '30%', color: 'var(--cat-relationships)', dx: '10px', rot: '-160deg', d: '0.12s' },
  { left: '50%', color: 'var(--cat-hobbies)', dx: '-8px', rot: '240deg', d: '0.05s' },
  { left: '68%', color: 'var(--medal-gold)', dx: '16px', rot: '-210deg', d: '0.2s' },
  { left: '84%', color: 'var(--cat-mind)', dx: '-12px', rot: '180deg', d: '0.1s' },
]

/**
 * End of day: every row and goal is done. The capsule fills (once, on arrival), the day's XP, the chest it earned
 * with Open, and five capsule pieces that fall once. The pieces do not play under reduced motion.
 */
export function DayComplete({ done, total, streak, xp, chests }: { done: number; total: number; streak: number; xp: number; chests: ChestItem[] }) {
  const [opening, setOpening] = useState(false)
  const chest = chests[0]
  return (
    <Card className="overflow-hidden p-5">
      {PIECES.map((p) => <span key={p.left} aria-hidden className="confetti" style={{ left: p.left, background: p.color, '--dx': p.dx, '--rot': p.rot, '--d': p.d } as React.CSSProperties} />)}
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-12 shrink-0 -rotate-[14deg] place-items-center overflow-hidden rounded-full bg-pill text-white shadow-[0_0_0_2px_var(--ink)]">
          <Check className="size-6 rotate-[14deg]" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-heading text-ink">Day complete</h2>
          <p className="text-small text-ink-3 tabular-nums">{done} of {total}{streak ? ` · streak now ${streak} ${streak === 1 ? 'day' : 'days'}` : ''}</p>
        </div>
        {xp ? <span className="inline-flex h-8 shrink-0 items-center rounded-full px-3 text-small font-semibold text-ink tabular-nums" style={{ background: 'color-mix(in oklch, var(--medal-gold) 18%, transparent)' }}>+{xp} XP</span> : null}
      </div>
      <Capsule value={done} max={total} size="md" color="var(--pill)" label="Done today" className="mt-4" />
      {chest ? (
        <button
          type="button"
          onClick={() => setOpening(true)}
          className="mt-4 flex w-full items-center gap-3 rounded-md p-3 text-start transition-[scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
          style={{ background: `color-mix(in oklch, ${RARITY[chest.rarity].color} 12%, transparent)` }}
        >
          <ChestArt rarity={chest.rarity} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold text-ink">{chests.length === 1 ? 'Chest earned' : `${chests.length} chests earned`}</span>
            <span className="block truncate text-caption text-ink-3">{chest.reason} · {RARITY[chest.rarity].label.toLowerCase()}</span>
          </span>
          <span className={cn('shrink-0 rounded-full bg-ink px-3.5 py-2 text-caption font-semibold text-bg')}>Open</span>
        </button>
      ) : null}
      {streakMilestone(streak) ? <ShareButton kind="streak" label="Share streak" className="mt-3">Share streak</ShareButton> : null}
      <AnimatePresence>{opening ? <ChestModal key="chest" chests={chests} onClose={() => setOpening(false)} /> : null}</AnimatePresence>
    </Card>
  )
}
