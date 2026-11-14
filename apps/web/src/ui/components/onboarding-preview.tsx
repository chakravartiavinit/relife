'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Check, Flag, Lock, Moon, Sun } from 'lucide-react'
import type { Pack } from '@relife/contract'
import type { LocalAiResult } from '@/app/actions'
import type { Category } from '@/db/schema'
import type { Template } from '@/core/onboarding'
import { CATEGORY } from '../tokens'
import { AppLogo } from './app-logo'
import type { ConnectorItem } from './connector-market'
import { AREA_ICON, CapsuleIcon } from './capsule-icon'
import { RoutineArt } from './routine-art'
import { cn } from '../cn'
import { EASE_OUT, EASE_OUT_STRONG } from '@/ui/beui/lib/ease'
import { AT, IMPROVE, city, firstName, litres, nfIN, toMin, type V } from './onboarding-data'

// The right half of setup: the player's save file, filling in as they answer. Each step owns one part
// of it; that part carries a capsule-blue ring while its step is open, and parts not reached yet hold a
// quiet line saying what goes there. Behind it, the game itself: a halftone skyline of XP bars that
// grows with every step, and small capsules in the picked areas' colours drifting up from it.

const SPRING = { type: 'spring', duration: 0.3, bounce: 0 } as const
const appear = {
  initial: { opacity: 0, y: 4, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.3, ease: EASE_OUT_STRONG } },
  exit: { opacity: 0, filter: 'blur(4px)', transition: { duration: 0.12, ease: EASE_OUT } },
}

/** Glides to its content's height, so a part that fills in pushes the rest down smoothly. */
export function Fluid({ children, className }: { children: React.ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setHeight(Math.round(e.borderBoxSize[0].blockSize)))
    ro.observe(inner.current!)
    return () => ro.disconnect()
  }, [])
  return (
    <div style={{ height }} className={cn('overflow-hidden transition-[height] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none', className)}>
      <div ref={inner}>{children}</div>
    </div>
  )
}

/**
 * Noon to noon, so a normal night is one block. The night block and the sun and moon glide with
 * clip-path and transform only.
 */
export function DayBar({ wake, sleep, compact }: { wake: string; sleep: string; compact?: boolean }) {
  const pos = (t: string) => ((toMin(t) - 720 + 1440) % 1440) / 1440
  const a = pos(sleep)
  const b = pos(wake)
  const segs: [number, number][] = a <= b ? [[a, b]] : [[a, 1], [0, b]]
  const len = (b - a + 1) % 1
  const moon = (a + len / 2) % 1
  const sun = (b + (1 - len) / 2) % 1
  const glide = 'transition-[transform] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none'
  return (
    <div aria-hidden>
      <div className={cn('relative overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--hairline)]', compact ? 'h-6' : 'h-8')}
        style={{ background: 'linear-gradient(90deg, color-mix(in oklch, var(--sky) 40%, var(--surface)), color-mix(in oklch, var(--sky) 22%, var(--surface)))' }}>
        {[0, 1].map((k) => {
          const seg = segs[k]
          return (
            <div key={k} className="absolute inset-0 transition-[clip-path,opacity] duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none"
              style={{ background: 'linear-gradient(90deg, var(--night), color-mix(in oklch, var(--night) 80%, var(--pill)))', opacity: seg ? 1 : 0,
                clipPath: seg ? `inset(0 ${(1 - seg[1]) * 100}% 0 ${seg[0] * 100}% round 9px)` : 'inset(0 50% 0 50% round 9px)' }} />
          )
        })}
        {/* Full-width layers, so translateX(%) moves by the bar's width. */}
        <div className={cn('absolute inset-0', glide)} style={{ transform: `translateX(${moon * 100}%)` }}>
          <Moon className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 text-white" strokeWidth={2} />
        </div>
        <div className={cn('absolute inset-0', glide)} style={{ transform: `translateX(${sun * 100}%)` }}>
          <Sun className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 text-[color-mix(in_oklch,var(--medal-gold)_80%,var(--ink))]" strokeWidth={2} />
        </div>
      </div>
      {compact ? null : <div className="mt-1.5 flex justify-between text-label text-ink-3 tabular-nums"><span>12 pm</span><span>6 pm</span><span>12 am</span><span>6 am</span><span>12 pm</span></div>}
    </div>
  )
}

/** One part of the save file. `at` is the step that fills it. */
function Part({ label, at, step, empty, children, fromPack }: {
  label: string; at: number; step: number; empty: string | null; children: React.ReactNode
  /** The starter pack filled this part in: a small "+ Pack" tag says so. */
  fromPack?: boolean
}) {
  const now = step === at
  const ahead = step < at
  return (
    // Concentric: radius 16 part, 12px padding, radius 4 inner bits.
    <section aria-label={label} data-now={now || undefined}
      className={cn('relative rounded-[16px] p-3 transition-[background-color,box-shadow,opacity] duration-300 ease-[var(--ease-out-strong)]',
        now ? 'bg-pill-wash shadow-[0_0_0_1.5px_var(--pill)]' : 'bg-transparent', ahead && 'opacity-60')}>
      <p className="mb-2 flex items-center justify-between gap-2 font-mono text-label text-ink-3 uppercase">
        {label}
        <span className="flex items-center gap-1.5">
          {fromPack && !empty ? <span className="font-mono text-label text-pill-ink">+ Pack</span> : null}
          <AnimatePresence initial={false}>
            {now ? <motion.span key="now" {...appear} className="rounded-full bg-pill px-1.5 font-sans text-label tracking-normal text-white normal-case">Editing</motion.span> : null}
          </AnimatePresence>
        </span>
      </p>
      <AnimatePresence mode="popLayout" initial={false}>
        {empty ? (
          <motion.p key="empty" {...appear} className="rounded-[8px] border border-dashed border-hairline px-3 py-2.5 text-caption text-ink-3">{empty}</motion.p>
        ) : (
          <motion.div key="full" {...appear}>{children}</motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** The player's save file as it will look, built from the answers so far. */
export function SaveFile({ v, step, picks, routines, starters, sources, pack, ai }: {
  v: V; step: number
  /** The starter pack picked on the Pack step, if any. */
  pack: Pack | null
  /** The AI step's answer: what was picked, the model already connected, and how the local server answered. */
  ai: { choice: V['aiChoice']; connected: string | null; local: LocalAiResult | null }
  /** Training picks valid for the chosen areas, in priority order. */
  picks: string[]
  /** Ids of the ticked routines in the list on screen. */
  routines: string[]
  starters: Template[]
  /** The rows on the Connect step, with their live state. */
  sources: ConnectorItem[]
}) {
  const name = firstName(v.name)
  const letter = (name[0] ?? '?').toUpperCase()
  const picked = [...starters, ...v.generated].filter((t) => routines.includes(t.id))
  const reached = (k: number) => step >= k
  const on = sources.filter((c) => c.connected)
  const later = sources.filter((c) => !c.connected)
  const target: Record<string, string> = {
    'tracker:sleep.hours': `Sleep ${v.sleepHours} h or more`,
    'tracker:steps': `Walk ${nfIN.format(v.steps)} steps`,
    'tracker:drink-water': `Drink ${litres(v.waterMl)}`,
  }

  // Keep the part being edited in view when the preview is taller than the window.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    root.current?.querySelector('[data-now]')?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
  }, [step])

  return (
    <div ref={root} className="w-[min(420px,100%)] rounded-[24px] bg-surface shadow-3">
      {/* Who: the capsule, the name, the level. */}
      <div className="relative isolate overflow-hidden rounded-t-[24px] px-5 pt-5 pb-4">
        <div aria-hidden className="halftone inset-y-0 right-0 -z-10 w-1/2" />
        <div className="flex items-center gap-4">
          <motion.span key={letter} className="ms-1 inline-flex" initial={{ scale: 0.85, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING}>
            <CapsuleIcon letter={letter} size="md" />
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-label text-pill-ink uppercase">Save file</p>
            <p className={cn('truncate font-display text-title', name ? 'text-ink' : 'text-ink-3')}>{name || 'Your name'}</p>
            <p className="mt-1 flex items-center gap-2 text-caption text-ink-3">
              <span className="inline-flex h-5 items-center rounded-full bg-ink px-1.5 text-label font-bold text-bg tabular-nums">Lv 1</span>
              <span className="font-semibold text-ink">Awakened</span>
              <span className="truncate">· {city(v.timezone)} · {v.baseCurrency.toUpperCase()}</span>
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]">
          {/* A sliver shows even at zero. */}
          <div className="h-full w-[4%] rounded-full bg-pill" />
        </div>
        <p className="mt-1.5 flex justify-between text-caption text-ink-3 tabular-nums"><span>Saves when you finish</span><span>Starts at Level 1</span></p>
      </div>

      <Fluid>
        <div className="flex flex-col gap-1 border-t border-divider p-2">
          <Part label="Starting pack" at={AT.pack} step={step} empty={reached(AT.pack) ? null : 'A starter pack fills in the next steps'}>
            <p className="text-caption font-semibold text-ink">{pack?.name ?? 'Custom'}</p>
            <p className="text-caption text-ink-3 tabular-nums">
              {pack ? `${pack.routines.length} routines · ${pack.goals.length} goal${pack.goals.length === 1 ? '' : 's'}${pack.sources?.length ? ` · ${pack.sources.length} sources` : ''}` : 'You pick the areas, routines and targets'}
            </p>
          </Part>

          <Part label="Areas" at={AT.areas} step={step} fromPack={!!pack} empty={reached(AT.areas) ? null : 'The parts of life you level up'}>
            <ul className="flex flex-wrap gap-1.5">
              {v.areas.map((c: Category) => {
                const Icon = AREA_ICON[c]
                return (
                  <motion.li key={c} layout="position" transition={SPRING} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 ps-1 pe-2.5 text-caption font-medium text-ink">
                    <span aria-hidden className="grid size-5 place-items-center rounded-full" style={{ color: `color-mix(in oklch, ${CATEGORY[c].color} 80%, var(--ink))`, background: `color-mix(in oklch, ${CATEGORY[c].color} 16%, transparent)` }}>
                      <Icon className="size-3" strokeWidth={2} />
                    </span>
                    {CATEGORY[c].label}
                  </motion.li>
                )
              })}
            </ul>
          </Part>

          <Part label="Sources" at={AT.connect} step={step} fromPack={!!pack?.sources?.length} empty={reached(AT.connect) ? (sources.length ? null : 'Nothing to connect for these areas') : 'Apps and devices that fill in your numbers'}>
            <ul className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {on.map((c) => (
                  <motion.li key={c.id} layout="position" {...appear} className="flex items-center gap-2.5 rounded-[8px] bg-good/10 p-2">
                    <AppLogo id={c.id} category={c.category} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-caption font-semibold text-ink">{c.name}</span>
                      <span className="block truncate text-caption text-ink-3">{c.category ? `${CATEGORY[c.category].label} › ` : ''}{c.provides.slice(0, 2).join(' and ')}</span>
                    </span>
                    <Check aria-hidden className="size-4 shrink-0 text-good" strokeWidth={2.5} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {later.length ? (
              <p className={cn('rounded-[8px] border border-hairline px-3 py-2 text-caption text-ink-3', on.length > 0 && 'mt-1')}>
                {later.map((c) => c.name).join(', ')}: not yet
              </p>
            ) : null}
          </Part>

          <Part label="Coach · AI model" at={AT.ai} step={step} empty={reached(AT.ai) ? null : 'Optional: a free local model, or your own key'}>
            <AiLine ai={ai} />
          </Part>

          <Part label="The System · daily quests" at={AT.areas} step={step} fromPack={!!pack}
            empty={picks.length ? null : reached(AT.connect) ? 'The System picks whatever is slipping most' : 'Up to three things to train first'}>
            <ol className="flex flex-col gap-1">
              {picks.map((id, k) => {
                const o = IMPROVE.find((x) => x.id === id)!
                return (
                  <motion.li key={id} layout="position" transition={SPRING} className="flex h-8 items-center gap-2 text-caption">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-pill text-label font-bold text-white tabular-nums">{k + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{target[id] ?? o.quest}</span>
                  </motion.li>
                )
              })}
            </ol>
          </Part>

          {pack?.goals[0] ? (
            <Part label="First goal" at={AT.pack} step={step} fromPack empty={reached(AT.pack) ? null : 'A starter pack brings one to approve'}>
              <p className="flex items-center gap-2 text-caption">
                <Flag aria-hidden className="size-4 shrink-0 text-pill-ink" strokeWidth={1.5} />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{pack.goals[0].title}</span>
              </p>
              <p className="mt-1 ps-6 text-caption text-ink-3">A draft on Plan, if you have room for one. Nothing starts until you approve it.</p>
            </Part>
          ) : null}

          <Part label="Your day" at={AT.routines} step={step} empty={reached(AT.routines) ? null : 'Your hours and what a good day looks like'}>
            <DayBar wake={v.wake} sleep={v.sleep} compact />
            <ul className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              {[
                { k: 'Sleep', val: `${v.sleepHours}h` },
                { k: 'Steps', val: nfIN.format(v.steps) },
                ...(v.areas.includes('health') ? [{ k: 'Water', val: litres(v.waterMl) }] : [{ k: 'Up at', val: v.wake }]),
              ].map((t) => (
                <li key={t.k} className="rounded-[8px] bg-surface-2 px-2 py-1.5">
                  <span className="block text-label text-ink-3">{t.k}</span>
                  <span className="block text-small font-semibold text-ink tabular-nums">{t.val}</span>
                </li>
              ))}
            </ul>
          </Part>

          <Part label="Today’s routines" at={AT.routines} step={step} fromPack={!!pack}
            empty={picked.length ? null : reached(AT.routines) ? 'No routines yet. Add them anytime in Plan.' : 'Next step: a few routines, each with a reminder and a streak'}>
            <ul className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {picked.slice(0, 4).map((t) => (
                  <motion.li key={t.id} layout="position" {...appear} className="flex h-9 items-center gap-2.5">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[8px]" style={{ background: `color-mix(in oklch, ${CATEGORY[t.area].color} 14%, transparent)` }}>
                      <RoutineArt name={t.name} kind={t.kind} area={t.area} className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-caption font-medium text-ink">{t.name}</span>
                    <span className="shrink-0 text-caption text-ink-3 tabular-nums">{t.rule.times[0]}</span>
                    <span aria-hidden className="size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--hairline)]" />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {picked.length > 4 ? <p className="mt-1 text-caption text-ink-3 tabular-nums">+{picked.length - 4} more</p> : null}
          </Part>
        </div>
      </Fluid>
    </div>
  )
}

/** The Coach · AI model part: the model, or why there is none, in the voice of the AI step. */
function AiLine({ ai }: { ai: { choice: V['aiChoice']; connected: string | null; local: LocalAiResult | null } }) {
  const down = ai.choice !== 'cloud' && ai.choice !== 'skip' && ai.local?.ok && ai.local.state !== 'ok'
  const [title, sub] = ai.connected ? [ai.connected, 'Connected. Change it in You › Connections.']
    : ai.choice === 'skip' ? ['None for now', 'Rules run nudges and quests.']
    : ai.choice === 'cloud' ? ['Your own key', 'Paste it on this step or later in You › Connections.']
    : down ? ['Local AI not running', 'Rules run until it’s back.']
    : [`Local AI${ai.local?.ok ? ` · ${ai.local.model}` : ''}`, 'On this machine. Nothing leaves it.']
  return (
    <p className="flex items-center gap-2.5 rounded-[8px] bg-surface-2 p-2">
      <AppLogo id={ai.connected && !ai.connected.startsWith('local:') ? ai.connected.split(':')[0] : 'local'} size="xs" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-semibold text-ink">{title}</span>
        <span className="block truncate text-caption text-ink-3">{sub}</span>
      </span>
      {down ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-warn" /> : <Lock aria-hidden className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.5} />}
    </p>
  )
}

/** On a phone the preview shrinks to one line: the capsule, the name and the level. */
export function SaveStrip({ v }: { v: V }) {
  const name = firstName(v.name)
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-surface px-3 py-2.5 shadow-1">
      <CapsuleIcon letter={(name[0] ?? '?').toUpperCase()} size="sm" className="ms-1" />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-body font-semibold', name ? 'text-ink' : 'text-ink-3')}>{name || 'Your name'} · Lv 1 Awakened</p>
        <p className="truncate text-caption text-ink-3">{city(v.timezone)} · {v.baseCurrency.toUpperCase()} · not saved yet</p>
      </div>
      <ul aria-label="Areas" className="flex -space-x-1">
        {v.areas.map((c) => (
          <li key={c} title={CATEGORY[c].label} className="size-3 rounded-full ring-2 ring-surface" style={{ background: CATEGORY[c].color }} />
        ))}
      </ul>
    </div>
  )
}

// Deterministic noise, so the server and the browser draw the same skyline.
const noise = (k: number) => { const x = Math.sin(k * 127.1) * 43758.5453; return x - Math.floor(x) }
/**
 * Bars sit 36px apart from the centre outward and climb from left to right, like XP over the days ahead.
 * `seed` gives a second, different row for the pale skyline behind.
 */
const bars = (seed: number, lift: number) => Array.from({ length: 41 }, (_, n) => {
  const k = n - 20
  return { k, h: Math.min(0.98, Math.max(0.1, 0.44 + lift + 0.016 * k + (noise(k + seed) - 0.5) * 0.3 + (noise((k + seed) * 3.7) > 0.86 ? 0.14 : 0))) }
})
const SKYLINES = [
  { rows: bars(57, 0.16), shift: 5, tone: 'opacity-25 dark:opacity-20' }, // behind: taller, paler, half a step across
  { rows: bars(0, 0), shift: -13, tone: 'opacity-75 dark:opacity-60' },
]
/** Capsules in flight: where each starts (% from the left and the bottom), its size, pace and drift. */
const MOTES = [
  { x: 6, b: 14, s: 0.5, t: 19, d: -4, dx: 26, o: 0.9 }, { x: 16, b: 6, s: 0.34, t: 26, d: -15, dx: -18, o: 0.55 },
  { x: 26, b: 20, s: 0.6, t: 17, d: -9, dx: 14, o: 1 }, { x: 72, b: 18, s: 0.34, t: 27, d: -7, dx: 16, o: 0.55 },
  { x: 84, b: 10, s: 0.56, t: 18, d: -12, dx: -22, o: 1 }, { x: 93, b: 24, s: 0.38, t: 24, d: -3, dx: 20, o: 0.65 },
]

/**
 * Behind the save file: the capsule-blue glow, the halftone corner and a halftone skyline of XP bars
 * along the bottom. `progress` (0 to 1) raises the skyline as setup goes on; the drifting capsules take
 * the colours of the picked areas. Decorative only.
 */
export function Backdrop({ progress, areas }: { progress: number; areas: Category[] }) {
  const colors = areas.length ? areas.map((c) => CATEGORY[c].color) : ['var(--pill)']
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(80% 60% at 50% -10%, color-mix(in oklch, var(--pill) 16%, transparent), transparent 70%)' }} />
      <div className="halftone top-0 right-0 h-1/2 w-1/2" />
      {SKYLINES.map((sky) => (
        <div key={sky.shift} className={cn('skyline absolute inset-x-0 bottom-0 h-[min(38vh,340px)]', sky.tone)}>
          {sky.rows.map((b) => (
            <span key={b.k} className="skyline-bar" style={{
              left: `calc(50% + ${b.k * 36 + sky.shift}px)`,
              '--h': `${(b.h * (0.42 + 0.58 * progress) * 100).toFixed(1)}%`,
              '--i': Math.abs(b.k),
            } as React.CSSProperties} />
          ))}
        </div>
      ))}
      {MOTES.map((m, k) => (
        <span key={k} className="mote" style={{
          left: `${m.x}%`, bottom: `${m.b}%`, filter: m.s < 0.4 ? 'blur(0.6px)' : undefined,
          '--t': `${m.t}s`, '--d': `${m.d}s`, '--dx': `${m.dx}px`, '--o': m.o, '--rise': '40vh',
        } as React.CSSProperties}>
          <span className="block" style={{ scale: m.s }}><CapsuleIcon color={colors[k % colors.length]} size="sm" /></span>
        </span>
      ))}
    </div>
  )
}
