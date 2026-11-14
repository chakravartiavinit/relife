'use client'

import { celebrateAchievement, celebrateLevel } from './celebrate'
import { createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDownLeft, Check, CircleAlert, Info, LoaderCircle, Pause, Trash2, X, type LucideIcon } from 'lucide-react'
import { EASE_OUT_STRONG } from '@/ui/beui/lib/ease'
import { AnimatedToastStack, type AnimatedToast, type ToastStatus } from '@/ui/beui/motion/animated-toast-stack'
import { cn } from '../cn'
import { AppLogo } from './app-logo'
import { Button, buttonClass } from './button'
import { DEMO_MESSAGE } from '@/core/demo'

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
 * description adds one detail. `action` is one button, such as Undo: it runs `onClick` and closes the toast.
 * `toast.loading(title)` returns an id; `toast.update(id, title, tone)` morphs it in place (spinner → check), so
 * a long action reads as one notification, not two. `toast.error()` is the one wording for "that didn't save".
 *
 * The stack itself (layout, enter and exit, swipe away) is beUI's animated-toast-stack; this file keeps the
 * API, the look of one toast (tile, tone, action button) and the timers, which pause while you hover or the
 * tab is hidden.
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
/** Turns on the read-only demo wording (see ToastProvider). The demo guard calls it once the page knows it is the demo. */
const DemoCtx = createContext<() => void>(() => {})
export const useEnterDemo = () => useContext(DemoCtx)
const DEMO_DESCRIPTION = 'This is a read-only demo with sample data.'
const DEMO_COLLAPSE_MS = 2000
/** Whether timers are paused (a toast is hovered or focused, or the tab is hidden). */
const PauseCtx = createContext<{ paused: boolean; hover: (on: boolean) => void; dismiss: (id: string) => void }>({ paused: false, hover: () => {}, dismiss: () => {} })

const DURATION = 3200
const DURATION_LONG = 5000 // two lines take longer to read
const lasts = (e?: Extra) => e?.duration ?? (e?.description ? DURATION_LONG : DURATION)
const KEEP = 5 // older ones are dropped; the stack draws the newest 4
let seed = 0

const STATUS: Record<Kind, ToastStatus> = { good: 'success', bad: 'error', neutral: 'neutral', loading: 'loading' }

/**
 * Bottom right on a laptop, in line with the page's right edge and clear of the content and the Settings save
 * bar; on a phone, centred above the tab bar.
 */
const STACK_CLASS = 'bottom-[calc(var(--tabbar-h)+16px)] w-[min(380px,calc(100vw-24px))] max-w-none lg:right-[calc(max(0px,(100vw_-_1480px)/2)_+_2.5rem)] lg:bottom-8 lg:left-auto lg:translate-x-0'

/**
 * `demo` (the read-only demo, RELIFE_DEMO=1) turns every "bad" toast into one wording, "Demo: changes are off", and
 * collapses identical ones that land within 2 s. The layout can't know it at build time, so the demo guard sets it on mount.
 */
export function ToastProvider({ children, demo = false }: { children: React.ReactNode; demo?: boolean }) {
  const [items, setItems] = useState<Item[]>([])
  const [demoOn, setDemoOn] = useState(demo)
  const demoRef = useRef(demoOn)
  demoRef.current = demoOn
  const lastDemo = useRef(0)
  const enterDemo = useCallback(() => setDemoOn(true), [])
  const [hovered, setHovered] = useState(false)
  const [hidden, setHidden] = useState(false)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const dismiss = useCallback((id: string) => setItems((xs) => xs.filter((x) => x.id !== id)), [])

  const notify = useMemo(() => {
    const push = (t: Omit<Item, 'id' | 'version'>) => {
      const id = `t${++seed}`
      setItems((xs) => [...xs, { ...t, id, version: 0 }].slice(-KEEP))
      return id
    }
    const say = (title: string, tone: Tone = 'neutral', extra?: Extra) => {
      if (tone === 'bad' && demoRef.current) {
        const now = Date.now()
        if (now - lastDemo.current < DEMO_COLLAPSE_MS) return
        lastDemo.current = now
        push({ title: DEMO_MESSAGE, kind: 'bad', description: DEMO_DESCRIPTION, duration: lasts({ description: DEMO_DESCRIPTION }) })
        return
      }
      push({ ...extra, title, kind: tone, duration: lasts(extra) })
    }
    return Object.assign(say, {
      loading: (title: string, extra?: Extra) => push({ ...extra, title, kind: 'loading', duration: 0 }),
      // Keeps the tile it had (an app's logo) unless told otherwise; the old second line goes.
      update: (id: string, title: string, tone: Tone = 'good', extra?: Extra) => {
        if (tone === 'bad' && demoRef.current) { title = DEMO_MESSAGE; extra = { description: DEMO_DESCRIPTION } }
        setItems((xs) => xs.map((x) => x.id === id ? { ...x, description: undefined, ...extra, title, kind: tone, duration: lasts(extra), version: x.version + 1 } : x))
      },
      error: (title = 'Couldn’t save', description = 'Try again in a moment') => say(title, 'bad', { description }),
    }) as Notify
  }, [])

  useEffect(() => {
    const on = () => setHidden(document.visibilityState !== 'visible')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  useEffect(() => { if (!items.length) setHovered(false) }, [items.length])

  const toasts = useMemo<AnimatedToast[]>(() => items.map((t) => ({ id: t.id, title: t.title, description: t.description, status: STATUS[t.kind] })), [items])
  const pause = useMemo(() => ({ paused: hovered || hidden, hover: setHovered, dismiss }), [hovered, hidden, dismiss])

  return (
    <Ctx.Provider value={notify}>
      <DemoCtx.Provider value={enterDemo}>{children}</DemoCtx.Provider>
      <PauseCtx.Provider value={pause}>
        <AnimatedToastStack
          fixed position="bottom-center" maxVisible={4} toasts={toasts} onDismiss={dismiss}
          className={STACK_CLASS} classNames={{ surface: 'p-2.5' }}
          renderToast={(t) => { const item = itemsRef.current.find((x) => x.id === t.id); return item ? <ToastBody item={item} /> : null }}
        />
      </PauseCtx.Provider>
    </Ctx.Provider>
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

function ToastBody({ item: t }: { item: Item }) {
  const { paused, hover, dismiss } = useContext(PauseCtx)
  // Timer with memory: pausing keeps what's left; an update (spinner → done) starts it again.
  const left = useRef(t.duration)
  useEffect(() => { left.current = t.duration }, [t.version, t.duration])
  useEffect(() => {
    if (!t.duration || paused) return
    const start = Date.now()
    const timer = setTimeout(() => dismiss(t.id), left.current)
    return () => { clearTimeout(timer); left.current = Math.max(400, left.current - (Date.now() - start)) }
  }, [paused, t.id, t.version, t.duration, dismiss])

  return (
    <div className="group flex items-center gap-3" onPointerEnter={() => hover(true)} onPointerLeave={() => hover(false)} onFocus={() => hover(true)} onBlur={() => hover(false)}>
      <Tile kind={t.kind} icon={t.icon} />

      <div className="min-w-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p key={t.title} className="truncate text-small font-medium text-ink tabular-nums"
            initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -4, filter: 'blur(2px)' }} transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}>
            {t.title}
          </motion.p>
        </AnimatePresence>
        {t.description ? <p className="line-clamp-2 text-caption text-ink-3 tabular-nums">{t.description}</p> : null}
      </div>

      {/* The one action is the app's primary button, as tall as the tile and flush with the card's padding. */}
      {t.action ? (
        <button type="button" onClick={() => { t.action!.onClick(); dismiss(t.id) }}
          className={buttonClass({ variant: 'primary', size: 'sm', className: 'h-9 rounded-sm px-3.5' })}>
          {t.action.label}
        </button>
      ) : null}

      {/* Dismiss sits on the card's corner (away from the action), so it takes no room in the row. Shown on hover
          or focus, always on touch screens. */}
      {t.kind !== 'loading' ? (
        <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss"
          className="absolute -top-1.5 -left-1.5 grid size-6 place-items-center rounded-full bg-surface text-ink-3 opacity-0 shadow-2 transition-[opacity,color,scale] duration-150 ease-out-quint before:absolute before:-inset-2 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 active:scale-96 [@media(hover:none)]:opacity-100">
          <X className="size-3" strokeWidth={2} />
        </button>
      ) : null}
    </div>
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
      <Button onClick={() => toast('Water +250 ml · 750 ml today', 'good', { description: '+5 XP', icon: '/routines/water.png', action: { label: 'Undo', onClick: () => toast('Undone', 'neutral') } })}>With Undo</Button>
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
