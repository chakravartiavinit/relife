'use client'

import { celebrateAchievement, celebrateLevel } from './celebrate'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertCircle, Bell, Check, LoaderCircle, X } from 'lucide-react'
import { EASE_OUT, EASE_OUT_STRONG, SPRING_LAYOUT } from '@/ui/beui/lib/ease'
import { cn } from '../cn'

type Tone = 'good' | 'bad' | 'neutral'
type Kind = Tone | 'loading'

/**
 * `toast(text, tone)` for one-shot messages.
 * `toast.loading(text)` returns an id; `toast.update(id, text, tone)` morphs it in place
 * (spinner → check), so a long action reads as one notification, not two.
 */
export type Notify = ((text: string, tone?: Tone) => void) & {
  loading: (text: string) => string
  update: (id: string, text: string, tone?: Tone) => void
  /** A fuller toast: a second line, an icon, one action, a custom duration. */
  show: (t: { title: string; description?: string; tone?: Tone; icon?: React.ReactNode; action?: { label: string; onClick: () => void }; duration?: number }) => void
}

type Item = {
  id: string; title: string; description?: string; kind: Kind; icon?: React.ReactNode
  action?: { label: string; onClick: () => void }; duration: number; version: number
}

const noop = Object.assign(() => {}, { loading: () => '', update: () => {}, show: () => {} }) as Notify
const Ctx = createContext<Notify>(noop)
export const useToast = () => useContext(Ctx)

const DURATION = 3200
const KEEP = 5 // older ones are dropped; only the newest 3 are ever drawn
const VISIBLE = 3
const GAP = 8
const PEEK = 10 // how far each toast behind shows above the one in front
let seed = 0

/**
 * Sonner-style stack at the bottom centre: the newest toast in front, older ones tucked behind it. Hovering or
 * focusing fans them out; timers pause while you read and while the tab is hidden.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const [expanded, setExpanded] = useState(false)
  const [hidden, setHidden] = useState(false)
  const dismiss = useCallback((id: string) => setItems((xs) => xs.filter((x) => x.id !== id)), [])

  const notify = useMemo(() => {
    const push = (t: Omit<Item, 'id' | 'version'> & { id?: string }) => {
      const id = t.id ?? `t${++seed}`
      setItems((xs) => [...xs.filter((x) => x.id !== id), { ...t, id, version: 0 }].slice(-KEEP))
      return id
    }
    return Object.assign(
      (text: string, tone: Tone = 'neutral') => { push({ title: text, kind: tone, duration: DURATION }) },
      {
        loading: (text: string) => push({ title: text, kind: 'loading', duration: 0 }),
        update: (id: string, text: string, tone: Tone = 'good') =>
          setItems((xs) => xs.map((x) => x.id === id ? { ...x, title: text, kind: tone, duration: DURATION, version: x.version + 1 } : x)),
        show: ({ tone = 'neutral', duration = DURATION, ...t }: Parameters<Notify['show']>[0]) => { push({ ...t, kind: tone, duration }) },
      },
    ) as Notify
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
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[75] mx-auto w-[min(380px,calc(100vw-24px))] lg:bottom-6"
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

const TONE: Record<Kind, { icon: typeof Bell; tile: string }> = {
  good: { icon: Check, tile: 'bg-[color-mix(in_oklch,var(--good)_14%,transparent)] text-good' },
  bad: { icon: AlertCircle, tile: 'bg-[color-mix(in_oklch,var(--bad)_12%,transparent)] text-bad' },
  neutral: { icon: Bell, tile: 'bg-surface-2 text-ink-2' },
  loading: { icon: LoaderCircle, tile: 'bg-surface-2 text-pill' },
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

  const { icon: Glyph, tile } = TONE[t.kind]
  const y = expanded ? -offset : -index * PEEK
  return (
    <motion.li
      className={cn('absolute inset-x-0 bottom-0 origin-bottom', hiddenBehind ? 'pointer-events-none' : 'pointer-events-auto')}
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
        <motion.div ref={ref} className="group flex items-center gap-3 p-2.5"
          initial={false} animate={{ opacity: folded ? 0 : 1 }} transition={{ duration: 0.15, ease: EASE_OUT }}>
          {/* Concentric: 36px tile, radius 10, inside a radius-20 card with 10px padding. */}
          <span className={cn('relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] transition-[background-color,color] duration-200', tile)}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={t.kind} className="grid place-items-center"
                initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}>
                {t.icon && t.kind !== 'loading'
                  ? t.icon
                  : <Glyph className={cn('size-4', t.kind === 'loading' && 'animate-spin')} strokeWidth={2} aria-hidden />}
              </motion.span>
            </AnimatePresence>
          </span>

          <div className="min-w-0 flex-1">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p key={t.title} className="truncate text-[13.5px] leading-5 font-medium text-ink"
                initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -4, filter: 'blur(2px)' }} transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}>
                {t.title}
              </motion.p>
            </AnimatePresence>
            {t.description ? <p className="truncate text-[12.5px] leading-[18px] text-ink-3 tabular-nums">{t.description}</p> : null}
          </div>

          {t.action ? (
            <button type="button" onClick={() => { t.action!.onClick(); onDismiss(t.id) }}
              className="relative h-8 shrink-0 rounded-[8px] bg-surface-2 px-3 text-[12.5px] font-medium text-ink transition-[background-color,scale] duration-150 ease-[var(--ease-out-quint)] before:absolute before:-inset-1 hover:bg-ink/[0.08] active:scale-[0.96] dark:hover:bg-white/[0.1]">
              {t.action.label}
            </button>
          ) : null}
          {t.kind !== 'loading' ? (
            // Shown on hover or focus (always on touch screens), so a row of toasts doesn't read as a row of X's.
            <button type="button" onClick={() => onDismiss(t.id)} aria-label="Dismiss"
              className="relative grid size-8 shrink-0 place-items-center rounded-full text-ink-3 opacity-0 transition-[opacity,background-color,color] duration-150 ease-[var(--ease-out-quint)] before:absolute before:-inset-1 group-hover:opacity-100 hover:bg-ink/[0.05] hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100 dark:hover:bg-white/[0.06]">
              <X className="size-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </motion.div>
      </motion.div>
    </motion.li>
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
  if (news.chests) toast(news.chests === 1 ? 'Quest complete. A chest is waiting on Today' : `${news.chests} quests complete. Chests are waiting on Today`, 'good')
}
