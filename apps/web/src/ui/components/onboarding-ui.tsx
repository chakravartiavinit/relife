'use client'

import { AnimatePresence, motion, type Variants } from 'motion/react'
import { Check } from 'lucide-react'
import { cn } from '../cn'
import { EASE_OUT, EASE_OUT_STRONG } from '@/ui/beui/lib/ease'
import { STEPS } from './onboarding-data'

// The small parts the setup steps share: the step motion, the pick-a-thing look, the question title and a labelled group.

export const SPRING = { type: 'spring', duration: 0.3, bounce: 0 } as const
// Icon swaps: scale 0.25→1, opacity 0→1, blur 4px→0.
export const SWAP = { initial: { scale: 0.25, opacity: 0, filter: 'blur(4px)' }, animate: { scale: 1, opacity: 1, filter: 'blur(0px)' }, exit: { scale: 0.25, opacity: 0, filter: 'blur(4px)' }, transition: SPRING }

// Seen once, so it can afford a little delight: a step slides the way you're going and its heading
// and answers arrive one after another. Choices themselves respond at once (≤150ms).
export const stepMotion: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 20 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE_OUT_STRONG, staggerChildren: 0.045, delayChildren: 0.02 } },
  // Exits are softer than enters: shorter distance, quicker.
  exit: (dir: number) => ({ opacity: 0, x: dir * -10, filter: 'blur(2px)', transition: { duration: 0.15, ease: EASE_OUT } }),
}
export const item: Variants = {
  enter: { opacity: 0, y: 8, filter: 'blur(4px)' },
  center: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE_OUT_STRONG } },
  exit: {},
}

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill'
// A pickable thing looks like the app's secondary button until picked, then takes a capsule-blue wash and ring.
// Area colours stay in the icons.
export const choice = cn('transition-[background-color,box-shadow,scale,opacity] duration-150 ease-out-quint active:scale-[0.96]', FOCUS)
export const IDLE = 'bg-surface shadow-1 hover:bg-surface-2'
export const PICKED = 'bg-pill-wash shadow-[0_0_0_1.5px_var(--pill)]'
// The region pickers, at the same height and look as the name field.
export const PICKER = 'h-10 rounded-md bg-surface px-3 text-base shadow-1 focus-visible:shadow-[0_0_0_2px_var(--pill)] aria-expanded:shadow-[0_0_0_2px_var(--pill)] sm:text-body'
// A 32px pill with a 40px hit area.
export const PILL_HIT = "relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']"
export const LINK = cn('relative rounded-sm text-small font-medium text-ink underline decoration-ink/25 underline-offset-[3px] transition-[text-decoration-color] duration-150 ease-out-quint after:absolute after:-inset-x-2 after:-inset-y-3 hover:decoration-ink', FOCUS)

/** The question: a small step label, a title and one line of help, each on its own beat. */
export function Title({ step, title, body }: { step: number; title: string; body?: string }) {
  return (
    <div className="mb-6 short:mb-5">
      <motion.p variants={item} className="font-mono text-label text-pill-ink uppercase before:me-2 before:inline-block before:h-3 before:w-0.5 before:rounded-full before:bg-pill before:align-[-1px] before:content-['']">
        Step {step + 1} of {STEPS.length}
      </motion.p>
      <motion.h1 variants={item} className="mt-2 font-display text-title text-balance text-ink sm:text-display">{title}</motion.h1>
      {body ? <motion.p variants={item} className="mt-2 max-w-[420px] text-body text-pretty text-ink-2">{body}</motion.p> : null}
    </div>
  )
}

/** A labelled group inside a step. */
export function Group({ label, aside, children, className }: { label: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={cn('not-first:mt-6 short:not-first:mt-5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-small font-semibold text-ink">{label}</h2>
        {aside ? <p className="text-caption text-ink-3 tabular-nums">{aside}</p> : null}
      </div>
      <div className="mt-3">{children}</div>
    </motion.div>
  )
}

/** Check badge: a hollow ring until picked, then the tick pops in. */
export function Tick({ on }: { on: boolean }) {
  return (
    <span aria-hidden className="relative grid size-5 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--hairline)]">
      <AnimatePresence initial={false}>
        {on ? (
          <motion.span key="on" {...SWAP} className="absolute inset-0 grid place-items-center rounded-full bg-pill text-white">
            <Check className="size-3" strokeWidth={3} />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  )
}
