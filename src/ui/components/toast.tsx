'use client'

import { celebrateAchievement, celebrateLevel } from './celebrate'
import { createContext, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowDownLeft, Check, CircleAlert, Info, LoaderCircle, Pause, Trash2, X, type LucideIcon } from 'lucide-react'
import { EASE_OUT, EASE_OUT_STRONG, SPRING_LAYOUT } from '@/ui/beui/lib/ease'
import { cn } from '../cn'
import { AppLogo } from './app-logo'
import { Button, buttonClass } from './button'

type Tone = 'good' | 'bad' | 'neutral'
type Kind = Tone | 'loading'

/**
 * What sits in the tile: a line icon (drawn in the tone's colour), the path of a picture (3D art from public/),
 * or a ready-made tile such as `<AppLogo size="xs" />`. Pictures and tiles show the tone as a badge on their corner.
 */
type Glyph = LucideIcon | string | React.ReactElement
type Extra = { description?: string; icon?: Glyph; action?: { label: string; onClick: () => void }; duration?: number }

/**
 * `toast(title, tone, { description, icon, action })`: the title says what happened to what ("Gym paused"), the
 * description adds one detail. `toast.loading(title)` returns an id; `toast.update(id, title, tone)` morphs it in
 * place (spinner → check), so a long action reads as one notification, not two. `toast.error()` is the one wording
 * for "that didn't save".
 */
export type Notify = ((title: string, tone?: Tone, extra?: Extra) => void) & {
  loading: (title: string, extra?: Extra) => string
  update: (id: string, title: string, tone?: Tone, extra?: Extra) => void
  error: (title?: string, description?: string) => void
}

type Item = Extra & { id: string; title: string; kind: Kind; duration: number; version: number }

const noop = Object.assign(() => {}, { loading: () => '', update: () => {}, error: () => {} }) as Notify
const Ctx = createContext<Notify>(noop)
export const useToast = () => useContext(Ctx)

const DURATION = 3200
const DURATION_LONG = 5000 // two lines take longer to read
const lasts = (e?: Extra) => e?.duration ?? (e?.description ? DURATION_LONG : DURATION)
const KEEP = 5 // older ones are dropped; only the newest 3 are ever drawn
const VISIBLE = 3
const GAP = 8
const PEEK = 10 // how far each toast behind shows above the one in front
let seed = 0

/**
 * Sonner-style stack: the newest toast in front, older ones tucked behind it. On a laptop it sits bottom right, in
 * line with the page's right edge, clear of the content and the Settings save bar; on a phone, above the tab bar.
 * Hovering or focusing fans them out; timers pause while you read and while the tab is hidden.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const [expanded, setExpanded] = useState(false)
  const [hidden, setHidden] = useState(false)
  const dismiss = useCallback((id: string) => setItems((xs) => xs.filter((x) => x.id !== id)), [])

  const notify = useMemo(() => {
    const push = (t: Omit<Item, 'id' | 'version'>) => {
      const id = `t${++seed}`
      setItems((xs) => [...xs, { ...t, id, version: 0 }].slice(-KEEP))
      return id
    }
    const say = (title: string, tone: Tone = 'neutral', extra?: Extra) => { push({ ...extra, title, kind: tone, duration: lasts(extra) }) }
    return Object.assign(say, {
      loading: (title: string, extra?: Extra) => push({ ...extra, title, kind: 'loading', duration: 0 }),
      // Keeps the tile it had (an app's logo) unless told otherwise; the old second line goes.
      update: (id: string, title: string, tone: Tone = 'good', extra?: Extra) =>
        setItems((xs) => xs.map((x) => x.id === id ? { ...x, description: undefined, ...extra, title, kind: tone, duration: lasts(extra), version: x.version + 1 } : x)),
      error: (title = 'Couldn’t save', description = 'Try again in a moment') => say(title, 'bad', { description }),
    }) as Notify
  }, [])

  useEffect(() => {
    const on = () => setHidden(document.visibilityState !== 'visible')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  // Nothing left to hover: fold back so the next toast arrives as a stack.
  useEffect(() => { if (!items.length) setExpanded(false) }, [items.length])

  return (
    <Ctx.Provider value={notify}>
      {children}
      <Stack items={items} expanded={expanded} paused={expanded || hidden} setExpanded={setExpanded} dismiss={dismiss} />
    </Ctx.Provider>
  )
}

function Stack({ items, expanded, paused, setExpanded, dismiss }: {
  items: Item[]; expanded: boolean; paused: boolean; setExpanded: (v: boolean) => void; dismiss: (id: string) => void
}) {
  const [heights, setHeights] = useState<Record<string, number>>({})
  const measure = useCallback((id: string, h: number) => setHeights((m) => (m[id] === h ? m : { ...m, [id]: h })), [])
  const front = [...items].reverse() // index 0 = newest, in front
  const frontH = heights[front[0]?.id] ?? 56
  const offsets = front.map((_, i) => front.slice(0, i).reduce((sum, x) => sum + (heights[x.id] ?? 56) + GAP, 0))
  const fanned = offsets[Math.min(front.length, VISIBLE) - 1] + (heights[front[Math.min(front.length, VISIBLE) - 1]?.id] ?? 56)

  return (
    <ol aria-live="polite" aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[75] mx-auto w-[min(380px,calc(100vw-24px))] lg:inset-x-auto lg:right-[calc(max(0px,(100vw_-_1480px)/2)_+_2.5rem)] lg:bottom-8 lg:mx-0"
      onPointerLeave={() => setExpanded(false)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setExpanded(false) }}>
      {/* While fanned out, an invisible pad bridges the gaps so the stack doesn't fold under the pointer. */}
      {expanded && front.length > 1 ? <li aria-hidden className="pointer-events-auto absolute inset-x-0 bottom-0" style={{ height: fanned }} /> : null}
      <AnimatePresence initial={false}>
        {front.map((t, i) => (
          <Toast key={t.id} t={t} index={i} expanded={expanded} paused={paused} frontH={frontH} offset={offsets[i]}
            onMeasure={measure} onDismiss={dismiss} onExpand={() => setExpanded(true)} />
        ))}
      </AnimatePresence>
    </ol>
  )
}

const TONE: Record<Kind, { icon: LucideIcon; tile: string; badge?: string }> = {
  good: { icon: Check, tile: 'bg-[color-mix(in_oklch,var(--good)_14%,transparent)] text-good', badge: 'bg-good' },
  bad: { icon: CircleAlert, tile: 'bg-[color-mix(in_oklch,var(--bad)_12%,transparent)] text-bad', badge: 'bg-bad' },
  neutral: { icon: Info, tile: 'bg-surface-2 text-ink-2' },
  loading: { icon: LoaderCircle, tile: 'bg-surface-2 text-pill', badge: 'bg-pill' },
}
// Icon swap: scale 0.25 → 1, opacity 0 → 1, blur 4px → 0.
const SWAP = {
  initial: { opacity: 0, scale: 0.25, filter: 'blur(4px)' }, animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.25, filter: 'blur(4px)' }, transition: { type: 'spring', duration: 0.3, bounce: 0 },
} as const

/**
 * The 36px tile (radius 10, inside a radius-20 card with 10px padding). A picture or an app's logo says what the
 * toast is about and carries the tone as a corner badge (spinner, tick, cross); without one, the tone fills the tile.
 */
function Tile({ kind, icon }: { kind: Kind; icon?: Glyph }) {
  const tone = TONE[kind]
  if (typeof icon === 'string' || isValidElement(icon)) {
    const Mark = kind === 'bad' ? X : tone.icon
    return (
      <span className="relative size-9 shrink-0">
        {typeof icon === 'string' ? (
          <span className="grid size-9 place-items-center rounded-[10px] bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local files, nothing to optimise */}
            <img src={icon} alt="" width={24} height={24} className="size-6 outline-none" />
          </span>
        ) : icon}
        <AnimatePresence initial={false}>
          {tone.badge ? (
            <motion.span key={kind} {...SWAP} className={cn('absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full text-white shadow-[0_0_0_2px_var(--surface)]', tone.badge)}>
              <Mark className={cn('size-2.5', kind === 'loading' && 'animate-spin')} strokeWidth={3} aria-hidden />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
    )
  }
  const Mark = kind === 'loading' ? LoaderCircle : icon ?? tone.icon
  return (
    <span className={cn('relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] transition-[background-color,color] duration-200', tone.tile)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={kind} className="grid place-items-center" {...SWAP}>
          <Mark className={cn('size-4', kind === 'loading' && 'animate-spin')} strokeWidth={2} aria-hidden />
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function Toast({ t, index, expanded, paused, frontH, offset, onMeasure, onDismiss, onExpand }: {
  t: Item; index: number; expanded: boolean; paused: boolean; frontH: number; offset: number
  onMeasure: (id: string, h: number) => void; onDismiss: (id: string) => void; onExpand: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [swipe, setSwipe] = useState(0) // -1 / 1 once flung away, so it leaves the way it was thrown
  const behind = index > 0
  const hiddenBehind = index >= VISIBLE
  const folded = behind && !expanded

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => onMeasure(t.id, el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [t.id, onMeasure])

  // Timer with memory: pausing keeps what's left; an update (spinner → done) starts it again.
  const left = useRef(t.duration)
  useEffect(() => { left.current = t.duration }, [t.version, t.duration])
  useEffect(() => {
    if (!t.duration || paused) return
    const start = Date.now()
    const timer = setTimeout(() => onDismiss(t.id), left.current)
    return () => { clearTimeout(timer); left.current = Math.max(400, left.current - (Date.now() - start)) }
  }, [paused, t.id, t.version, t.duration, onDismiss])

  const y = expanded ? -offset : -index * PEEK
  return (
    <motion.li
      className={cn('group absolute inset-x-0 bottom-0 origin-bottom', hiddenBehind ? 'pointer-events-none' : 'pointer-events-auto')}
      style={{ zIndex: 10 - index }}
      // Enters from just below its spot; tucked-behind toasts shrink 5% per step and fade out past the third.
      initial={{ opacity: 0, y: 16, scale: 1 }}
      animate={{ opacity: hiddenBehind ? 0 : 1, y, scale: expanded ? 1 : 1 - index * 0.05, x: 0 }}
      exit={swipe
        ? { opacity: 0, x: `${swipe * 110}%`, transition: { duration: 0.2, ease: EASE_OUT } }
        : { opacity: 0, y: y + 12, scale: 0.97, transition: { duration: 0.18, ease: EASE_OUT } }}
      transition={{ y: SPRING_LAYOUT, scale: SPRING_LAYOUT, x: SPRING_LAYOUT, opacity: { duration: 0.25, ease: EASE_OUT_STRONG } }}
      drag={reduce || behind ? false : 'x'}
      dragSnapToOrigin
      dragElastic={0.6}
      // A flick is enough: distance or speed (Sonner's ~0.11 px/ms ≈ 110 px/s, rounded up for mice).
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 64 || Math.abs(info.velocity.x) > 400) {
          setSwipe(Math.sign(info.offset.x || info.velocity.x))
          requestAnimationFrame(() => onDismiss(t.id))
        }
      }}
      onPointerEnter={onExpand}
      onFocus={onExpand}
    >
      {/* Folded behind the front one, every toast takes the front's height, so the peeks line up. */}
      <motion.div className="overflow-hidden rounded-lg bg-surface shadow-3"
        initial={false} animate={{ height: folded ? frontH : 'auto' }} transition={SPRING_LAYOUT}>
        <motion.div ref={ref} className="flex items-center gap-3 p-2.5"
          initial={false} animate={{ opacity: folded ? 0 : 1 }} transition={{ duration: 0.15, ease: EASE_OUT }}>
          <Tile kind={t.kind} icon={t.icon} />

          <div className="min-w-0 flex-1">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p key={t.title} className="truncate text-[13.5px] leading-5 font-medium text-ink tabular-nums"
                initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -4, filter: 'blur(2px)' }} transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}>
                {t.title}
              </motion.p>
            </AnimatePresence>
            {t.description ? <p className="line-clamp-2 text-[12.5px] leading-[18px] text-ink-3 tabular-nums">{t.description}</p> : null}
          </div>

          {/* The one action is the app's primary button, as tall as the tile and flush with the card's padding. */}
          {t.action ? (
            <button type="button" onClick={() => { t.action!.onClick(); onDismiss(t.id) }}
              className={buttonClass({ variant: 'primary', size: 'sm', className: 'h-9 rounded-[10px] px-3.5' })}>
              {t.action.label}
            </button>
          ) : null}
        </motion.div>
      </motion.div>
      {/* Dismiss sits on the card's corner (away from the action), so it takes no room in the row. Shown on hover
          or focus, always on touch screens. */}
      {t.kind !== 'loading' && !folded ? (
        <button type="button" onClick={() => onDismiss(t.id)} aria-label="Dismiss"
          className="absolute -top-1.5 -left-1.5 grid size-6 place-items-center rounded-full bg-surface text-ink-3 opacity-0 shadow-2 transition-[opacity,color,scale] duration-150 ease-out-quint before:absolute before:-inset-2 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 active:scale-96 [@media(hover:none)]:opacity-100">
          <X className="size-3" strokeWidth={2} />
        </button>
      ) : null}
    </motion.li>
  )
}

/** One of each kind of toast, for /dev/ui. */
export function ToastGallery() {
  const toast = useToast()
  const github = <AppLogo id="github" size="xs" />
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => toast('Settings saved', 'good')}>Done</Button>
      <Button onClick={() => toast('Water +250 ml', 'good', { description: '750 ml today', icon: '/routines/water.png' })}>With a picture</Button>
      <Button onClick={() => toast('Gym paused', 'neutral', { icon: Pause })}>Paused</Button>
      <Button onClick={() => toast('Gym deleted', 'neutral', { icon: Trash2 })}>Deleted</Button>
      <Button onClick={() => toast.error()}>Error</Button>
      <Button onClick={() => { const id = toast.loading('Syncing GitHub…', { icon: github }); setTimeout(() => toast.update(id, 'GitHub synced', 'good', { description: '12 new' }), 1600) }}>Sync, then done</Button>
      <Button onClick={() => { const id = toast.loading('Syncing GitHub…', { icon: github }); setTimeout(() => toast.update(id, 'Couldn’t sync GitHub', 'bad', { description: 'Already syncing. It finishes on its own; check back in a minute.' }), 1600) }}>Sync, then failed</Button>
      <Button onClick={() => toast('₹48,000 received from Acme Corp', 'good', { description: 'HDFC Salary ••7710 · 10:02', icon: ArrowDownLeft, duration: 8000, action: { label: 'View', onClick: () => {} } })}>Payment in</Button>
      <Button onClick={() => toast('12 new payments', 'neutral', { description: 'Latest: ₹1,165 to Corner Pharmacy', icon: '/routines/money.png', duration: 8000, action: { label: 'View', onClick: () => {} } })}>Payments</Button>
      <Button onClick={() => announceXp(toast, { unlocked: [], chests: 1 })}>Quest complete</Button>
    </div>
  )
}

type XpNews = import('@/core/xp').XpNews | undefined | void

/**
 * Level-ups and achievements play their own animations (celebrate.tsx); quest chests get a toast.
 * Quiet when nothing changed.
 */
export function announceXp(toast: Notify, news: XpNews) {
  if (!news) return
  for (const a of news.unlocked) celebrateAchievement(a)
  // The level-up screen goes last so it sits over the banners.
  if (news.levelUp) setTimeout(() => celebrateLevel(news.levelUp!), news.unlocked.length ? 900 : 0)
  if (news.chests) {
    const one = news.chests === 1
    toast(one ? 'Quest complete' : `${news.chests} quests complete`, 'good', {
      description: one ? 'A chest is waiting on Today' : `${news.chests} chests are waiting on Today`, icon: '/routines/target.png',
    })
  }
}
