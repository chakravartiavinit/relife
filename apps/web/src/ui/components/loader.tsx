'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import brand from '@relife/brand/brand.json'
import { BRAND } from '../brand-files'
import { cn } from '../cn'
import { useDelayedShow } from '../use-delayed-show'
import './loader.css'

/**
 * The app's logo loader: the real capsule from the logo fills along its tilt like a stat bar (see loader.css).
 *   splash  the wordmark, for the cold start
 *   page    a 40px capsule, for a page that waits as a whole (loading.tsx)
 *   inline  20px (16px with `px`), for buttons and rows
 * `progress` (0-100) swaps the loop for a real fill. `done` runs the hand-off: the capsule completes, fades, and
 * whatever it was covering comes in (LoaderSwap does the pairing). `motion` forces the reduced or full look (the
 * gallery); by default it follows the system setting.
 */
export type LoaderSize = 'splash' | 'page' | 'inline'
const HEIGHT: Record<LoaderSize, number> = { splash: 48, page: 40, inline: 20 }
/** The wait before the loader appears (ms); `page` is longer because a route change is usually fast. */
export const LOADER_DELAY: Record<LoaderSize, number> = { splash: 300, page: 400, inline: 300 }
/** How long a shown loader stays at least, so it reads as one thing (ms). */
export const LOADER_MIN_VISIBLE: Record<LoaderSize, number> = { splash: 0, page: 500, inline: 300 }

const { capsuleCut: cut } = BRAND
const pct = (n: number) => `${Math.round(n * 100000) / 1000}%`
const FILL_EASE_FALLBACK = 'cubic-bezier(0.23, 1, 0.32, 1)'

export function Loader({
  size,
  label,
  progress,
  done = false,
  delay = LOADER_DELAY[size],
  px,
  showLabel = false,
  motion,
  className,
}: {
  size: LoaderSize
  /** What is loading, read out to screen readers: "Loading Health". Shown beside the capsule with `showLabel`. */
  label: string
  /** Real progress, 0-100. Without it the capsule loops. */
  progress?: number
  /** The wait is over: run the hand-off. */
  done?: boolean
  /** Ms before the loader appears (CSS only, so it works before the page has hydrated). LoaderSwap passes 0. */
  delay?: number
  /** Height of the mark in px, instead of the size's own (the 16px button loader). */
  px?: number
  showLabel?: boolean
  motion?: 'full' | 'reduce'
  className?: string
}) {
  const fill = useRef<HTMLSpanElement>(null)
  // The completion: the fill runs from wherever it is to full in 200ms (a script animation lays over the loop, so
  // the loop's current value is where it starts).
  useEffect(() => {
    const el = fill.current
    if (!done || !el) return
    const from = getComputedStyle(el).clipPath
    if (from === 'none') return
    const ease = getComputedStyle(document.documentElement).getPropertyValue('--ease-out-strong').trim() || FILL_EASE_FALLBACK
    const run = el.animate([{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }], { duration: 200, easing: ease, fill: 'forwards' })
    return () => run.cancel()
  }, [done])

  const style = {
    '--ld-h': `${px ?? HEIGHT[size]}px`,
    '--ld-delay': `${delay}ms`,
    '--ld-ratio': cut.ratio,
    '--ld-tilt': `${cut.tilt}deg`,
    '--ld-axis-w': cut.axis[0],
    '--ld-axis-h': cut.axis[1],
    '--ld-art': `url(${BRAND.capsule})`,
    ...(size === 'splash'
      ? {
          '--ld-wm-ratio': BRAND.ratio,
          '--ld-wm-light': `url(${BRAND['logo-light']})`,
          '--ld-wm-dark': `url(${BRAND['logo-dark']})`,
          '--ld-from': pct(cut.from),
          '--ld-to': pct(cut.to),
          '--ld-from-n': cut.from,
        }
      : null),
  } as CSSProperties
  const determinate = progress != null
  const fillStyle = determinate ? ({ '--ld-p': `${Math.min(100, Math.max(0, progress))}%` } as CSSProperties) : undefined

  return (
    <span role="status" aria-busy={!done} data-size={size} data-state={done ? 'done' : 'loading'} data-motion={motion} className={cn('ld', className)} style={style}>
      <span className={showLabel ? 'text-small text-ink-2' : 'sr-only'}>{label}</span>
      <span aria-hidden className="ld-mark">
        {size === 'splash' && <span className="ld-wm" />}
        <span className="ld-cap">
          <span className="ld-axis ld-ghost"><span className="ld-art" /></span>
          <span ref={fill} className="ld-axis ld-fill" data-determinate={determinate || undefined} style={fillStyle}><span className="ld-art" /></span>
        </span>
      </span>
    </span>
  )
}

/**
 * A wait and what it hands off to, in one grid cell. While `loading` the loader shows (after its delay, and for at
 * least its minimum) and the children make room; when the wait ends the capsule completes and fades while the children
 * fade up 6px. Before the loader shows, and for a wait that ends before it does, the children are simply there.
 * `aria-busy` follows `loading`.
 */
export function LoaderSwap({
  loading,
  size = 'inline',
  label,
  progress,
  px,
  showLabel,
  motion,
  delay = LOADER_DELAY[size],
  minVisible = LOADER_MIN_VISIBLE[size],
  className,
  children,
}: {
  loading: boolean
  size?: LoaderSize
  label: string
  progress?: number
  px?: number
  showLabel?: boolean
  motion?: 'full' | 'reduce'
  delay?: number
  minVisible?: number
  className?: string
  children: ReactNode
}) {
  const shown = useDelayedShow(loading, delay, minVisible)
  // Was the loader seen in this wait? Then the hand-off plays; otherwise the content is simply there.
  const [seen, setSeen] = useState(false)
  if (shown && !seen) setSeen(true)
  if (loading && !shown && seen) setSeen(false)
  const ready = !loading && !shown
  return (
    <span aria-busy={loading} data-state={ready ? 'done' : seen ? 'loading' : 'idle'} data-motion={motion} className={cn('ld-swap', className)}>
      {(shown || seen) && <Loader size={size} label={label} progress={progress} done={ready} delay={0} px={px} showLabel={showLabel} motion={motion} />}
      <span className="ld-content">{children}</span>
    </span>
  )
}

/**
 * The cold-start splash for the installed app (display-mode standalone; loader.css hides it in a browser tab), over the
 * page until the app has hydrated: plain background first, the wordmark after 300ms. A start faster than that never
 * shows the wordmark and the splash is gone at once. A CSS failsafe clears it after 2.5s if the scripts never run.
 */
export function ColdStartSplash() {
  const [state, setState] = useState<'loading' | 'done' | 'gone'>('loading')
  useEffect(() => {
    // Time since the navigation began, so a slow script load counts too.
    if (performance.now() < LOADER_DELAY.splash) return setState('gone')
    setState('done')
    const t = setTimeout(() => setState('gone'), 560)
    return () => clearTimeout(t)
  }, [])
  if (state === 'gone') return null
  return (
    <div className="ld-splash" data-state={state === 'done' ? 'done' : 'loading'}>
      <noscript><style>{'.ld-splash{display:none}'}</style></noscript>
      <Loader size="splash" label={`Loading ${brand.name}`} done={state === 'done'} />
    </div>
  )
}
