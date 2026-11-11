'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { Button, buttonClass } from '../button'
import { cn } from '../../cn'
import { EASE_OUT, EASE_OUT_STRONG, SPRING_LAYOUT } from '@/ui/beui/lib/ease'
import { ILLO_ASSETS, IlloWelcome } from './illos'
import { TOUR_STEPS, type TourStep } from './steps'

// The guided tour, in the same language as setup (/welcome): small cards, a centred display title on the
// welcome, one full-width action, thin progress capsules. Seen once, so it can afford a staged entrance;
// between stops only what changes moves: the ring and the card glide, the picture cross-fades inside a
// frame that holds still, the words slide the way you're going.
// Setup hands over with `?tour=setup`: it has just welcomed the player, so the tour skips its own welcome
// and the ring flies straight to the first stop. The last stop is the Today checklist, so the tour ends
// on what to do next.

/** Stops that can show now: an optional one only while its anchor is on the page. */
const available = () => TOUR_STEPS.filter((s) => !s.optional || document.querySelector(`[data-tour="${s.anchor}"]`))
/** Fired when the tour closes, so anything that waited for it (the payments toast) can go ahead. */
export const TOUR_END = 'relife:tour-end'
/** True while the tour is on screen, or about to open from `?tour`. Ambient notices wait for it. */
export const touring = () => 'touring' in document.documentElement.dataset || new URLSearchParams(location.search).has('tour')
const ENTER = { duration: 0.25, ease: EASE_OUT_STRONG }
const LEAVE = { duration: 0.15, ease: EASE_OUT }
const INSTANT = { duration: 0 }
const SPRING = { type: 'spring', duration: 0.3, bounce: 0 } as const
// Icon swaps: scale 0.25→1, opacity 0→1, blur 4px→0.
const SWAP = { initial: { scale: 0.25, opacity: 0, filter: 'blur(4px)' }, animate: { scale: 1, opacity: 1, filter: 'blur(0px)' }, exit: { scale: 0.25, opacity: 0, filter: 'blur(4px)' }, transition: SPRING }
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill'
// The step card: 320px wide, with its picture inset 8px. The picture's height is fixed by its shape.
const CARD_W = 320
const PLATE_H = 8 + ((CARD_W - 16) * 460) / 720

type Rect = { left: number; top: number; width: number; height: number; radius: number }
/**
 * Where the current step points. `rect: null` = no visible anchor, or no room beside it (a phone): centred
 * card, no spotlight. `side` is where the card sits: right of sidebar items, left of anything else.
 */
type Pos = { rect: Rect | null; cardX: number; side: 'right' | 'left' }

// The welcome arrives in order: the card, then its picture, title, words and action, 60ms apart.
const welcome: Variants = {
  enter: { opacity: 0, scale: 0.96 },
  center: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: EASE_OUT_STRONG, staggerChildren: 0.06, delayChildren: 0.05 } },
  exit: { opacity: 0, scale: 0.98, transition: LEAVE },
}
const item: Variants = {
  enter: { opacity: 0, y: 8, filter: 'blur(4px)' },
  center: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE_OUT_STRONG } },
}
// Words slide the way you're going; a 2px blur blends the old and new text while they overlap.
const slide = {
  enter: (d: number) => ({ x: 10 * d, opacity: 0, filter: 'blur(2px)' }),
  center: { x: 0, opacity: 1, filter: 'blur(0px)' },
  exit: (d: number) => ({ x: -10 * d, opacity: 0, filter: 'blur(2px)' }),
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))

function measure(anchor: string | null, scroll: boolean): Pos {
  const el = anchor ? document.querySelector(`[data-tour="${anchor}"]`) : null
  if (!el || el.getClientRects().length === 0) return { rect: null, cardX: 0, side: 'right' }
  if (scroll) el.scrollIntoView({ block: 'nearest' })
  const { left, top, width, height } = el.getBoundingClientRect()
  // The ring follows the item's own corners (a group of rows has none, so it gets a small one).
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 8
  const rect = { left, top, width, height, radius }
  // Sidebar items: the card stands just past the sidebar's edge. Anything else: on its left.
  const nav = document.querySelector('aside')
  if (nav?.contains(el)) return { rect, cardX: nav.getBoundingClientRect().right + 12, side: 'right' }
  const x = left - 12 - CARD_W
  return x >= 12 ? { rect, cardX: x, side: 'left' } : { rect: null, cardX: 0, side: 'right' }
}

/** Keeps a ref'd element's height in state, so the card can animate to it instead of jumping. */
function useHeight(on: boolean, fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) return
    setH(el.offsetHeight)
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [on])
  return [ref, h] as const
}

/** Guided tour: a welcome card, then a spotlight and a step card per sidebar stop. Opens on `?tour` or `relife:tour`. */
export function Tour() {
  const [{ step, dir }, setState] = useState<{ step: number | null; dir: number }>({ step: null, dir: 1 })
  // The stops, fixed when the tour opens, so the count and the current stop never shift under the player
  // (hiding the checklist mid-tour leaves its stop as a centred card).
  const [steps, setSteps] = useState<TourStep[]>(TOUR_STEPS)
  const LAST = steps.length - 1
  const [pos, setPos] = useState<Pos | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  const reduce = useReducedMotion()
  const inSteps = step !== null && step > 0
  const cardShown = inSteps && pos !== null
  // Words = the current step's title and text; foot = the buttons row. With the picture's fixed height
  // they give the card's height, which places it without a per-frame loop.
  const [wordsRef, wordsH] = useHeight(cardShown, 112)
  const [footRef, footH] = useHeight(cardShown, 68)
  const current = step !== null && step > 0 ? steps[step] ?? null : null
  const cardH = (current?.Illo ? PLATE_H : 0) + wordsH + footH

  const go = (to: number, d: number) => setState({ step: to, dir: d })
  const close = () => {
    setState((s) => ({ ...s, step: null }))
    setPos(null)
    const query = location.search.replace(/[?&]tour(=[^&]*)?/, '').replace(/^&/, '?')
    history.replaceState(null, '', location.pathname + query + location.hash)
  }
  const next = () => { if (step !== null) { if (step < LAST) go(step + 1, 1); else close() } }

  // Open on `?tour` (read once, no useSearchParams so the layout needs no Suspense) or on `relife:tour`.
  // `?tour=setup` comes from setup, which has just said welcome: start at the first stop.
  // On Today the stops are fixed once its content has streamed in (the checklist is part of it), waiting
  // at most 3s.
  useEffect(() => {
    let frame = 0
    const start = (first: number) => {
      const t0 = performance.now()
      const ready = () => location.pathname !== '/' || document.getElementById('quest-log') || performance.now() - t0 > 3000
      const tick = () => {
        if (!ready()) { frame = requestAnimationFrame(tick); return }
        setSteps(available())
        setState({ step: first, dir: 1 })
      }
      tick()
    }
    const q = new URLSearchParams(location.search).get('tour')
    if (q !== null) start(q === 'setup' ? 1 : 0)
    const open = () => start(0)
    window.addEventListener('relife:tour', open)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('relife:tour', open) }
  }, [])

  // Mark the page while the tour is up and say when it ends.
  const open = step !== null
  useEffect(() => {
    if (!open) return
    document.documentElement.dataset.touring = ''
    // Announced a tick later: React's dev double-run of effects would otherwise say "ended" as the tour opens.
    return () => { delete document.documentElement.dataset.touring; setTimeout(() => window.dispatchEvent(new Event(TOUR_END))) }
  }, [open])

  // A stop that isn't there (never expected, as the stops are fixed on open) ends the tour rather than
  // leaving it open with nothing on screen.
  useEffect(() => { if (inSteps && !current) close() })

  // Fetch every illustration picture as the tour opens, so no card's art pops in late.
  useEffect(() => {
    if (open) for (const src of ILLO_ASSETS) new Image().src = src
  }, [open])

  // Measure the anchor before paint so the card and ring land in place; re-measure on resize and scroll.
  useLayoutEffect(() => {
    if (!inSteps) return
    const anchor = steps[step]?.anchor ?? null
    setPos(measure(anchor, true))
    let frame = 0
    const remeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setPos(measure(anchor, false)))
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, { capture: true })
    // The anchor can leave the page while its stop is showing (Hide on the checklist): re-measure then, so the
    // card centres instead of pointing at the gap.
    const anchorEl = anchor ? document.querySelector(`[data-tour="${anchor}"]`) : null
    const gone = new MutationObserver(remeasure)
    if (anchorEl?.parentElement) gone.observe(anchorEl.parentElement, { childList: true })
    return () => {
      gone.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, { capture: true })
    }
  }, [inSteps, step, steps])

  // Focus follows the step: the card on every stop, "Show me around" on the welcome.
  useEffect(() => {
    if (step === 0) startRef.current?.focus({ preventScroll: true })
    else if (step !== null) cardRef.current?.focus({ preventScroll: true })
  }, [step, cardShown])

  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' && step < LAST) go(step + 1, 1)
      else if (e.key === 'ArrowLeft' && step > 1) go(step - 1, -1)
      // Enter moves on while the card itself has focus (a focused button keeps Enter for itself).
      else if (e.key === 'Enter' && step > 0 && e.target === cardRef.current) { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const r = pos?.rect ?? null
  const left = pos?.side === 'left'
  const y = r ? clamp(r.top + r.height / 2 - 72, 12, innerHeight - cardH - 12) : 0
  const arrowTop = r ? clamp(r.top + r.height / 2 - y - 6, 16, cardH - 28) : 0
  const cardXY = r ? { x: pos!.cardX, y } : { x: 0, y: 0 }

  // One dimming layer for the whole tour: during the welcome it is a zero-size spotlight hidden behind the card, so
  // its 100vmax shadow is the backdrop. "Show me around" then flies it out to the first item, so the page never
  // flickers between two scrims and the eye is led from the card to the sidebar.
  const centre = typeof window === 'undefined' ? { x: 0, y: 0 } : { x: innerWidth / 2, y: innerHeight / 2 }
  const ring = step === 0 || !r
    ? { ...centre, width: 0, height: 0, borderRadius: 12 }
    : { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8, borderRadius: r.radius + 4 }
  // Kept while the first stop is being measured (pos still null), so the ring flies on instead of remounting.
  const showRing = step === 0 || (inSteps && (pos === null || r !== null))
  // Reduced motion: Motion already drops transforms; make size changes jump too.
  const glide = reduce ? INSTANT : SPRING_LAYOUT

  return (
    <>
      <AnimatePresence>
        {showRing ? (
          <motion.div key="ring" aria-hidden className="pointer-events-none fixed top-0 left-0 z-[70]"
            initial={{ opacity: 0, ...ring }}
            animate={{ opacity: 1, ...ring }}
            exit={{ opacity: 0, transition: LEAVE }}
            transition={{ x: glide, y: glide, width: glide, height: glide, borderRadius: glide, opacity: ENTER }}
            style={{ boxShadow: '0 0 0 1.5px var(--pill), 0 0 0 5px color-mix(in oklch, var(--pill) 22%, transparent), 0 0 0 100vmax var(--scrim)' }} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {step === 0 ? (
          <div key="welcome" className="pointer-events-none fixed inset-0 z-[71] grid place-items-center p-4">
            {/* Concentric: radius 24 card, 8px padding, radius 16 picture. */}
            <motion.div role="dialog" aria-modal="true" aria-labelledby="welcome-t" aria-describedby="welcome-d"
              className="pointer-events-auto w-[min(400px,100%)] origin-center rounded-[24px] bg-surface p-2 shadow-3"
              variants={welcome} initial="enter" animate="center" exit="exit">
              <motion.div variants={item} className="relative aspect-[720/440] overflow-hidden rounded-[16px] bg-[color-mix(in_oklch,var(--pill)_10%,var(--surface))]">
                <div aria-hidden className="halftone absolute inset-0 [mask-image:linear-gradient(transparent_55%,black)]" />
                <IlloWelcome />
              </motion.div>
              <div className="px-4 pt-6 pb-1 text-center sm:px-6">
                <motion.h2 variants={item} id="welcome-t" className="font-display text-[24px] leading-[1.2] font-extrabold tracking-[-0.02em] text-balance text-ink">{TOUR_STEPS[0].title}</motion.h2>
                <motion.p variants={item} id="welcome-d" className="mx-auto mt-2 max-w-[320px] text-[14px] leading-normal text-balance text-ink-2">{TOUR_STEPS[0].body}</motion.p>
                <motion.div variants={item} className="mt-6">
                  <button ref={startRef} type="button" onClick={() => go(1, 1)} className={buttonClass({ variant: 'primary', size: 'lg', className: 'h-10 w-full text-[14px]' })}>
                    Show me around<ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} />
                  </button>
                </motion.div>
                <motion.div variants={item} className="mt-1 flex justify-center">
                  <button type="button" onClick={close}
                    className={cn('h-10 rounded-md px-3 text-[13px] font-medium text-ink-3 transition-[color,scale] duration-150 ease-out-quint hover:text-ink active:scale-[0.96]', FOCUS)}>
                    Skip the tour
                  </button>
                </motion.div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {cardShown && current ? (
          // Concentric: radius 20 card, 8px padding, radius 12 picture.
          <motion.div key="card" ref={cardRef} role="dialog" aria-modal="false" aria-labelledby="tour-t" aria-describedby="tour-d" tabIndex={-1}
            className={cn('z-[71] rounded-[20px] bg-surface shadow-3 outline-none', r ? 'fixed top-0 left-0 w-[320px]' : 'fixed inset-x-0 bottom-24 mx-auto w-[min(320px,calc(100vw-24px))]')}
            initial={{ opacity: 0, scale: 0.96, ...cardXY }}
            animate={{ opacity: 1, scale: 1, ...cardXY }}
            exit={{ opacity: 0, scale: 0.98, transition: LEAVE }}
            transition={{ x: glide, y: glide, opacity: ENTER, scale: ENTER }}
            // Grows out of the arrow tip, i.e. from the item it points at.
            style={{ transformOrigin: r ? `${left ? '100%' : '0'} ${arrowTop + 6}px` : '50% 100%' }}>
            {r ? (
              // Moves on transform (`y`), not `top`, so the glide never touches layout.
              // Rotation goes through Motion too: a CSS `rotate` would apply before the translate and push it diagonally.
              <motion.span aria-hidden className={cn('absolute top-0 size-3 rounded-[2px] bg-surface', left ? '-right-1.5' : '-left-1.5')}
                style={{ rotate: 45, boxShadow: left ? '1px -1px 0 var(--divider)' : '-1px 1px 0 var(--divider)' }} initial={{ y: arrowTop }} animate={{ y: arrowTop }} transition={glide} />
            ) : null}

            {/* The frame holds still; only the picture inside it changes, cross-fading through a 4px blur. */}
            {current.Illo ? (
              <div className="relative mx-2 mt-2 aspect-[720/460] overflow-hidden rounded-[12px] bg-surface-2">
                <AnimatePresence initial={false}>
                  <motion.div key={step} className="absolute inset-0"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)', transition: { duration: 0.3, ease: EASE_OUT_STRONG } }}
                    exit={{ opacity: 0, filter: 'blur(4px)', transition: LEAVE }}>
                    <current.Illo />
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : null}
            {/* Close sits on the card's corner, half outside it (as the capsule sits on setup's card), so it
                never covers the picture. A 28px button with a 40px hit area. */}
            <button type="button" onClick={close} aria-label="Close the tour"
              className={cn('absolute -top-2.5 -right-2.5 z-10 grid size-7 place-items-center rounded-full bg-surface text-ink-2 shadow-2 transition-[color,scale] duration-150 ease-out-quint after:absolute after:-inset-1.5 hover:text-ink active:scale-[0.96]', FOCUS)}>
              <X className="size-3.5" strokeWidth={2} />
            </button>

            {/* The words' height follows the new step's text on the glide's spring, instead of jumping. */}
            <motion.div className="relative overflow-hidden" initial={false} animate={{ height: wordsH }} transition={glide}>
              <div ref={wordsRef}>
                <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                  <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
                    transition={{ duration: 0.2, ease: EASE_OUT_STRONG }} className="px-4 pt-4">
                    <h3 id="tour-t" className="font-display text-[17px] leading-[1.25] font-extrabold tracking-[-0.02em] text-ink">{current.title}</h3>
                    <p id="tour-d" className="mt-1.5 text-[13px] leading-normal text-pretty text-ink-2">{current.body}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>

            <div ref={footRef} className="flex items-center gap-1.5 p-4">
              {/* One capsule per stop, as in setup: finished ones ink, this one capsule blue. */}
              <ol aria-hidden className="flex items-center gap-1">
                {steps.slice(1).map((_, k) => {
                  const state = k + 1 < step ? 'done' : k + 1 === step ? 'now' : 'next'
                  return (
                    <li key={k} className="relative h-1.5 w-3 overflow-hidden rounded-full bg-ink/[0.08] dark:bg-white/[0.1]">
                      {/* Slides instead of scaling, so the round end stays round. */}
                      <span className={cn(
                        'absolute inset-0 rounded-full transition-[translate,background-color] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none',
                        state === 'next' ? '-translate-x-[101%]' : 'translate-x-0',
                        state === 'now' ? 'bg-pill' : 'bg-ink',
                      )} />
                    </li>
                  )
                })}
              </ol>
              <span aria-live="polite" className="ms-1 text-[12px] whitespace-nowrap text-ink-3 tabular-nums"><span className="sr-only">Step </span>{step} of {LAST}</span>
              <span className="ms-auto flex items-center gap-1.5">
                <AnimatePresence initial={false}>
                  {step > 1 ? (
                    <motion.span key="back" className="inline-flex" {...SWAP}>
                      <Button variant="ghost" size="icon" aria-label="Back" onClick={() => go(step - 1, -1)} className="rounded-full">
                        <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={2} />
                      </Button>
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                <Button variant="primary" size="md" onClick={next}>
                  {step < LAST ? 'Next' : 'Done'}
                  {/* The arrow turns into a tick on the last stop. */}
                  <span aria-hidden className="relative grid size-4 place-items-center">
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.span key={step < LAST ? 'arrow' : 'check'} className="absolute inset-0 grid place-items-center" {...SWAP}>
                        {step < LAST ? <ArrowRight className="size-4 rtl:-scale-x-100" strokeWidth={2} /> : <Check className="size-4" strokeWidth={2.5} />}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </Button>
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
