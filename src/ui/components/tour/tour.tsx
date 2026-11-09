'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { buttonClass } from '../button'
import { EASE_OUT, EASE_OUT_STRONG, SPRING_LAYOUT } from '@/ui/beui/lib/ease'
import { DigitSwap } from '@/ui/beui/motion/digit-swap'
import { ILLO_ASSETS, IlloWelcome } from './illos'
import { TOUR_STEPS } from './steps'

const LAST = TOUR_STEPS.length - 1
const ENTER = { duration: 0.25, ease: EASE_OUT_STRONG }
const LEAVE = { duration: 0.15, ease: EASE_OUT }
const INSTANT = { duration: 0 }

type Rect = { left: number; top: number; width: number; height: number }
/** Where the current step points. `rect: null` = no visible anchor (sidebar hidden): centred card, no spotlight. */
type Pos = { rect: Rect | null; cardX: number }

// Contents slide the way you're going; a 2px blur blends the old and new text while they overlap.
const slide = {
  enter: (d: number) => ({ x: 10 * d, opacity: 0, filter: 'blur(2px)' }),
  center: { x: 0, opacity: 1, filter: 'blur(0px)' },
  exit: (d: number) => ({ x: -10 * d, opacity: 0, filter: 'blur(2px)' }),
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))

function measure(anchor: string | null, scroll: boolean): Pos {
  const el = anchor ? document.querySelector(`[data-tour="${anchor}"]`) : null
  if (!el || el.getClientRects().length === 0) return { rect: null, cardX: 0 }
  if (scroll) el.scrollIntoView({ block: 'nearest' })
  const { left, top, width, height } = el.getBoundingClientRect()
  const aside = document.querySelector('aside')?.getBoundingClientRect().right ?? left + width
  return { rect: { left, top, width, height }, cardX: aside + 12 }
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

/** Guided tour: a welcome modal, then a spotlight and a step card per sidebar stop. Opens on `?tour` or `relife:tour`. */
export function Tour() {
  const [{ step, dir }, setState] = useState<{ step: number | null; dir: number }>({ step: null, dir: 1 })
  const [pos, setPos] = useState<Pos | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  const reduce = useReducedMotion()
  const inSteps = step !== null && step > 0
  const cardShown = inSteps && pos !== null
  // Body = plate + text of the current step; foot = the buttons row. Their sum places the card without a per-frame loop.
  const [bodyRef, bodyH] = useHeight(cardShown, 290)
  const [footRef, footH] = useHeight(cardShown, 68)
  const cardH = bodyH + footH

  const go = (to: number, d: number) => setState({ step: to, dir: d })
  const close = () => {
    setState((s) => ({ ...s, step: null }))
    setPos(null)
    const query = location.search.replace(/[?&]tour(=[^&]*)?/, '').replace(/^&/, '?')
    history.replaceState(null, '', location.pathname + query + location.hash)
  }

  // Open on `?tour` (read once, no useSearchParams so the layout needs no Suspense) or on `relife:tour`.
  useEffect(() => {
    if (new URLSearchParams(location.search).has('tour')) setState({ step: 0, dir: 1 })
    const open = () => setState({ step: 0, dir: 1 })
    window.addEventListener('relife:tour', open)
    return () => window.removeEventListener('relife:tour', open)
  }, [])

  // Fetch every illustration picture while the welcome is up, so no card's art pops in late.
  useEffect(() => {
    if (step === 0) for (const src of ILLO_ASSETS) new Image().src = src
  }, [step])

  // Measure the anchor before paint so the card and ring land in place; re-measure on resize and scroll.
  useLayoutEffect(() => {
    if (!inSteps) return
    const anchor = TOUR_STEPS[step].anchor
    setPos(measure(anchor, true))
    let frame = 0
    const remeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setPos(measure(anchor, false)))
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, { capture: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, { capture: true })
    }
  }, [inSteps, step])

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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const r = pos?.rect ?? null
  const y = r ? clamp(r.top + r.height / 2 - 72, 12, innerHeight - cardH - 12) : 0
  const arrowTop = r ? clamp(r.top + r.height / 2 - y - 6, 16, cardH - 28) : 0
  const cardXY = r ? { x: pos!.cardX, y } : { x: 0, y: 0 }
  const current = inSteps ? TOUR_STEPS[step] : null

  // One dimming layer for the whole tour: during the welcome it is a zero-size spotlight hidden behind the modal, so
  // its 100vmax shadow is the backdrop. "Show me around" then flies it out to the first item, so the page never
  // flickers between two scrims and the eye is led from the modal to the sidebar.
  const centre = typeof window === 'undefined' ? { x: 0, y: 0 } : { x: innerWidth / 2, y: innerHeight / 2 }
  const ring = step === 0 || !r
    ? { ...centre, width: 0, height: 0 }
    : { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 }
  // Kept while the first stop is being measured (pos still null), so the ring flies on instead of remounting.
  const showRing = step === 0 || (inSteps && (pos === null || r !== null))
  // Reduced motion: Motion already drops transforms; make size changes jump too.
  const glide = reduce ? INSTANT : SPRING_LAYOUT

  return (
    <>
      <AnimatePresence>
        {showRing ? (
          <motion.div key="ring" aria-hidden className="pointer-events-none fixed top-0 left-0 z-[70] rounded-md"
            initial={{ opacity: 0, ...ring }}
            animate={{ opacity: 1, ...ring }}
            exit={{ opacity: 0, transition: LEAVE }}
            transition={{ x: glide, y: glide, width: glide, height: glide, opacity: ENTER }}
            style={{ boxShadow: '0 0 0 1.5px var(--pill), 0 0 0 5px color-mix(in oklch, var(--pill) 22%, transparent), 0 0 0 100vmax var(--scrim)' }} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {step === 0 ? (
          <div key="welcome" className="pointer-events-none fixed inset-0 z-[71] grid place-items-center p-4">
            <motion.div role="dialog" aria-modal="true" aria-labelledby="welcome-t"
              className="pointer-events-auto w-[min(500px,100%)] origin-center rounded-lg bg-surface p-3 shadow-3"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, ease: EASE_OUT_STRONG } }}
              exit={{ opacity: 0, scale: 0.98, transition: LEAVE }}>
              <div className="relative aspect-[720/440] overflow-hidden rounded-md bg-[color-mix(in_oklch,var(--pill)_10%,var(--surface))]">
                <div aria-hidden className="halftone absolute inset-0 [mask-image:linear-gradient(transparent_55%,black)]" />
                <IlloWelcome />
              </div>
              <div className="px-3 pt-4 pb-2">
                <h2 id="welcome-t" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{TOUR_STEPS[0].title}</h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-pretty text-ink-2">{TOUR_STEPS[0].body}</p>
                <div className="mt-5 flex gap-2">
                  <button ref={startRef} type="button" onClick={() => go(1, 1)} className={buttonClass({ variant: 'primary', size: 'md' })}>Show me around</button>
                  <button type="button" onClick={close} className={buttonClass({ variant: 'ghost', size: 'md' })}>Skip</button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {cardShown && current ? (
          <motion.div key="card" ref={cardRef} role="dialog" aria-modal="false" aria-labelledby="tour-t" aria-describedby="tour-d" tabIndex={-1}
            className={r
              ? 'fixed top-0 left-0 z-[71] w-[320px] rounded-lg bg-surface shadow-3 outline-none'
              : 'fixed inset-x-0 bottom-24 z-[71] mx-auto w-[min(320px,calc(100vw-24px))] rounded-lg bg-surface shadow-3 outline-none'}
            initial={{ opacity: 0, scale: 0.96, ...cardXY }}
            animate={{ opacity: 1, scale: 1, ...cardXY }}
            exit={{ opacity: 0, scale: 0.98, transition: LEAVE }}
            transition={{ x: glide, y: glide, opacity: ENTER, scale: ENTER }}
            // Grows out of the arrow tip, i.e. from the item it points at.
            style={{ transformOrigin: r ? `0 ${arrowTop + 6}px` : '50% 100%' }}>
            {r ? (
              // Moves on transform (`y`), not `top`, so the glide never touches layout.
              // Rotation goes through Motion too: a CSS `rotate` would apply before the translate and push it diagonally.
              <motion.span aria-hidden className="absolute top-0 -left-1.5 size-3 rounded-[2px] bg-surface"
                style={{ rotate: 45, boxShadow: '-1px 1px 0 var(--divider)' }} initial={{ y: arrowTop }} animate={{ y: arrowTop }} transition={glide} />
            ) : null}
            {/* The body's height follows the new step's text on the glide's spring, instead of jumping. */}
            <motion.div className="overflow-hidden" initial={false} animate={{ height: bodyH }} transition={glide}>
              {/* flow-root: keeps the plate's top margin inside, so the measured height includes it. */}
              <div ref={bodyRef} className="flow-root">
                <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                  <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
                    transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}>
                    <div className="mx-2 mt-2 aspect-[720/460] overflow-hidden rounded-md bg-surface-2"><current.Illo /></div>
                    <div className="px-4 pt-3.5 pr-11">
                      <h3 id="tour-t" className="text-[14px] font-semibold tracking-[-0.005em] text-ink">{current.title}</h3>
                      <p id="tour-d" className="mt-1 text-[13.5px] leading-relaxed text-pretty text-ink-2">{current.body}</p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
            <div ref={footRef} className="flex items-center gap-1.5 px-4 py-3.5">
              <button type="button" onClick={close} className={buttonClass({ variant: 'ghost', size: 'md' })}>Skip tour</button>
              <button type="button" onClick={() => (step < LAST ? go(step + 1, 1) : close())} className={buttonClass({ variant: 'primary', size: 'md' })}>
                {step < LAST ? 'Next' : 'Done'}
              </button>
              {/* The count rolls the way you're going. */}
              <span aria-live="polite" className="ms-auto flex items-center gap-1 text-[12px] text-ink-3 tabular-nums">
                <DigitSwap value={step} direction={dir > 0 ? 'up' : 'down'} /> of {LAST}
              </span>
            </div>
            <button type="button" onClick={close} aria-label="Close the tour"
              className={buttonClass({ variant: 'ghost', size: 'icon', className: 'absolute right-2 size-10 text-ink-3' })}
              style={{ top: 'calc((320px - 16px) * 460 / 720 + 14px)' }}>
              <X className="size-4" strokeWidth={1.5} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
