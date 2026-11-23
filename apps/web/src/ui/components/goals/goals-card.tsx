import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Pace } from '@/domain/day-plan'
import { statusOf } from '@/domain/status-of'
import type { PictureRef } from '@/ui/picture'
import { CATEGORY } from '@/ui/tokens'
import { cn } from '../../cn'
import { Card } from '../card'
import { buttonClass, buttonLinkClass } from '../button'
import { LevelBar } from '../capsule'
import { StatusRow } from '../status-row'

// Today's goals card, presentational (no server imports), so /dev/ui can draw it from fixtures.

export type PaceGoal = {
  id: string; title: string; area: keyof typeof CATEGORY; pace: Pace; share: number
  /** "₹96,000 · target ₹1,50,000": the current value against the target. */
  line: string; by: string
  /** The goal's tracker picture; without one the area's. */
  picture?: PictureRef
}

/**
 * Up to three goals as status rows: the tracker's picture, the title, the pace as a status word, and the segmented bar
 * with a tick where the pace says you should be today (past it is ahead, short of it behind); each opens its Peek. A
 * due weekly review leads. With no goals, how to start one.
 */
export function GoalsCard({ goals, due, className }: { goals: PaceGoal[]; due: number; className?: string }) {
  return (
    <Card aria-labelledby="goals-h" className={cn('flex flex-col', className)}>
      <header className="mb-3 flex items-start justify-between gap-4">
        <h2 id="goals-h" className="font-display text-heading text-ink">Goals</h2>
        <Link href="/plan" className={buttonLinkClass('inline-flex h-8 items-center text-small')}>Plan</Link>
      </header>
      {due ? <StatusRow picture={{ of: 'nav', to: '/plan' }} name="Weekly review is due" line={`${due} ${due === 1 ? 'goal' : 'goals'} to review`} href="/plan/review" /> : null}
      {goals.length ? (
        <div>
          {goals.map((g) => (
            <StatusRow
              key={g.id} picture={g.picture ?? { of: 'area', to: g.area }} name={g.title} status={statusOf({ from: 'goal', pace: g.pace }).word} peek={{ type: 'goal', id: g.id }}
              trailing={<span aria-hidden />}
              under={(
                <>
                  <span className="relative block">
                    <LevelBar size="md" segments={20} value={g.share} color={CATEGORY[g.area].color} label={`Progress toward ${g.title}`} />
                    <span aria-hidden className={cn('absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-ink', g.pace.label === 'Reached' && 'hidden')} style={{ left: `${g.pace.elapsed * 100}%` }} />
                  </span>
                  <span className="mt-1.5 flex items-center justify-between gap-3 text-small text-ink-3 tabular-nums">
                    <span className="min-w-0 truncate">{g.line}</span><span className="shrink-0">{g.by}</span>
                  </span>
                </>
              )}
            />
          ))}
        </div>
      ) : (
        <>
          <p className="text-small text-ink-2">Pick up to 3 outcomes, like “Sleep 7.5 h” or “Save ₹1,50,000”. Routines link to them and Today shows the pace.</p>
          <Link href="/plan?new=1" className={buttonClass({ variant: 'secondary', size: 'lg', className: 'mt-4 w-full' })}><Plus className="size-4" strokeWidth={2} aria-hidden />New goal</Link>
        </>
      )}
    </Card>
  )
}
