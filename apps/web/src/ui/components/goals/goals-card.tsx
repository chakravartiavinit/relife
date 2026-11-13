import Link from 'next/link'
import { CalendarCheck, ChevronRight, Plus, Target } from 'lucide-react'
import type { Pace } from '@/domain/day-plan'
import { CATEGORY } from '@/ui/tokens'
import { cn } from '../../cn'
import { Badge, Card, CardHeader } from '../card'
import { buttonClass } from '../button'
import { Capsule } from '../capsule'
import { PeekLink } from '../peek/peek-link'

// Today's goals card, presentational (no server imports), so /dev/ui can draw it from fixtures.

const PACE_COLOR: Record<Pace['tone'], string | undefined> = { good: 'var(--good)', pill: 'var(--pill)', warn: 'var(--warn)', neutral: undefined }

export type PaceGoal = {
  id: string; title: string; area: keyof typeof CATEGORY; pace: Pace; share: number
  /** "₹96,000 · target ₹1,50,000": the current value against the target. */
  line: string; by: string
}

/** Up to three goals, each opening its Peek; with none, how to start one. */
export function GoalsCard({ goals, due }: { goals: PaceGoal[]; due: number }) {
  return (
    <Card>
      <CardHeader icon={<Target strokeWidth={1.5} />} color="var(--pill)" title="Goals"
        action={<Link href="/plan" className="inline-flex h-10 items-center rounded-md px-2 text-small font-medium text-pill-ink hover:underline">Plan</Link>} />
      {due ? (
        <Link href="/plan/review" className="mb-4 flex items-center gap-3 rounded-md bg-pill/7 px-3 py-2.5 transition-[background-color] duration-150 hover:bg-pill/12">
          <CalendarCheck aria-hidden className="size-4 shrink-0 text-pill-ink" strokeWidth={2} />
          <span className="min-w-0 flex-1">
            <span className="block text-small font-semibold text-ink">Weekly review is due</span>
            <span className="block text-caption text-ink-3 tabular-nums">{due} {due === 1 ? 'goal' : 'goals'} to review</span>
          </span>
          <ChevronRight aria-hidden className="size-4 text-ink-3" strokeWidth={1.5} />
        </Link>
      ) : null}
      {goals.length ? (
        <ul className="flex flex-col gap-1">
          {goals.map((g) => (
            <li key={g.id}>
              <PeekLink to={{ type: 'goal', id: g.id }} className="block rounded-md p-2 -m-1 transition-colors duration-150 ease-out-quint hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill dark:hover:bg-white/[0.05]">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-body font-medium text-ink">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: CATEGORY[g.area].color }} />
                    <span className="truncate">{g.title}</span>
                  </span>
                  <Badge color={PACE_COLOR[g.pace.tone]} className="shrink-0">{g.pace.label}</Badge>
                </span>
                {/* The tick is where the pace says you should be today: the bar past it is ahead, short of it is behind. */}
                <span className="relative mt-2 block">
                  <Capsule size="sm" value={g.share} color={CATEGORY[g.area].color} label={`Progress toward ${g.title}`} />
                  <span aria-hidden className={cn('absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-ink', g.pace.label === 'Reached' && 'hidden')} style={{ left: `${g.pace.elapsed * 100}%` }} />
                </span>
                <span className="mt-1.5 flex items-center justify-between gap-3 text-caption text-ink-3 tabular-nums">
                  <span className="min-w-0 truncate">{g.line}</span><span className="shrink-0">{g.by}</span>
                </span>
              </PeekLink>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="text-small text-ink-2">Pick up to 3 outcomes, like “Sleep 7.5 h” or “Save ₹1,50,000”. Routines link to them and Today shows the pace.</p>
          <Link href="/plan?new=1" className={buttonClass({ variant: 'secondary', size: 'lg', className: 'mt-4 w-full' })}><Plus className="size-4" strokeWidth={2} aria-hidden />New goal</Link>
        </>
      )}
    </Card>
  )
}
