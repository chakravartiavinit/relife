'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Check, Moon, Star, Sun } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { Template } from '@/core/onboarding'
import { CATEGORY } from '../tokens'
import { CapsuleMark } from './logo'
import { AREA_ICON, CapsuleIcon } from './capsule-icon'
import { RoutineArt } from './routine-art'
import { cn } from '../cn'
import { EASE_OUT, EASE_OUT_STRONG } from '@/ui/beui/lib/ease'
import { IMPROVE, TONES, city, firstName, litres, nfIN, toMin, type Level, type V } from './onboarding-data'

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
      {compact ? null : <div className="mt-1.5 flex justify-between text-[11px] leading-4 text-ink-3 tabular-nums"><span>12 pm</span><span>6 pm</span><span>12 am</span><span>6 am</span><span>12 pm</span></div>}
    </div>
  )
}

/** One part of the save file. `at` is the step that fills it. */
function Part({ label, at, step, done, empty, children }: {
  label: string; at: number; step: number; done: boolean; empty: string | null; children: React.ReactNode
}) {
  const now = !done && step === at
  const ahead = !done && step < at
  return (
    // Concentric: radius 16 part, 12px padding, radius 4 inner bits.
    <section aria-label={label} data-now={now || undefined}
      className={cn('relative rounded-[16px] p-3 transition-[background-color,box-shadow,opacity] duration-300 ease-[var(--ease-out-strong)]',
        now ? 'bg-pill-wash shadow-[0_0_0_1.5px_var(--pill)]' : 'bg-transparent', ahead && 'opacity-60')}>
      <p className="mb-2 flex items-center justify-between gap-2 font-mono text-[10.5px] leading-4 font-semibold tracking-[0.14em] text-ink-3 uppercase">
        {label}
        <AnimatePresence initial={false}>
          {now ? <motion.span key="now" {...appear} className="rounded-full bg-pill px-1.5 font-sans text-[10px] tracking-normal text-white normal-case">Editing</motion.span> : null}
        </AnimatePresence>
      </p>
      <AnimatePresence mode="popLayout" initial={false}>
        {empty ? (
          <motion.p key="empty" {...appear} className="rounded-[8px] border border-dashed border-hairline px-3 py-2.5 text-[12.5px] leading-[18px] text-ink-3">{empty}</motion.p>
        ) : (
          <motion.div key="full" {...appear}>{children}</motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** The player's save file as it will look, built from the answers so far. */
export function SaveFile({ v, step, done, level, picks, routines, starters }: {
  v: V; step: number; done: boolean; level: Level | null
  /** Training picks valid for the chosen areas, in priority order. */
  picks: string[]
  /** Ids of the ticked routines in the list on screen. */
  routines: string[]
  starters: Template[]
}) {
  const name = firstName(v.name)
  const letter = (name[0] ?? '?').toUpperCase()
  const focus = v.focus && v.areas.includes(v.focus) ? v.focus : v.areas[0]
  const tone = TONES.find((t) => t.key === v.tone) ?? TONES[1]
  const picked = [...starters, ...v.generated].filter((t) => routines.includes(t.id))
  const reached = (k: number) => done || step >= k
  const target: Record<string, string> = {
    'tracker:sleep.hours': `Sleep ${v.sleepHours} h or more`,
    'tracker:steps': `Walk ${nfIN.format(v.steps)} steps`,
    'tracker:drink-water': `Drink ${litres(v.waterMl)}`,
  }
  const pct = level ? Math.max(0.04, level.progress) : 0.04

  // Keep the part being edited in view when the preview is taller than the window.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current?.querySelector('[data-now]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
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
            <p className="font-mono text-[10.5px] leading-4 font-semibold tracking-[0.14em] text-pill-ink uppercase">Save file</p>
            <p className={cn('truncate font-display text-[22px] leading-[1.15] font-extrabold tracking-[-0.02em]', name ? 'text-ink' : 'text-ink-3')}>{name || 'Your name'}</p>
            <p className="mt-1 flex items-center gap-2 text-[12px] leading-5 text-ink-3">
              <span className="inline-flex h-5 items-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-bg tabular-nums">Lv {level?.level ?? 1}</span>
              <span className="font-semibold text-ink">{level?.title ?? 'Awakened'}</span>
              <span className="truncate">· {city(v.timezone)} · {v.baseCurrency.toUpperCase()}</span>
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]">
          {/* Slides instead of scaling, so the round end stays round. A sliver shows even at zero. */}
          <motion.div className="h-full rounded-full bg-pill" initial={false} animate={{ x: `${(pct - 1) * 100}%` }} transition={{ duration: 0.9, ease: EASE_OUT_STRONG, delay: done ? 0.3 : 0 }} />
        </div>
        <p className="mt-1.5 flex justify-between text-[11.5px] leading-4 text-ink-3 tabular-nums">
          <span>{done ? 'Saved' : 'Not saved yet'}</span>
          <span>{level ? `${Math.round(level.progress * 100)}% to Level ${level.level + 1}` : 'Starts at Level 1'}</span>
        </p>
      </div>

      <Fluid>
        <div className="flex flex-col gap-1 border-t border-divider p-2">
          <Part label="Your day" at={1} step={step} done={done} empty={reached(1) ? null : 'Your hours and what a good day looks like'}>
            <DayBar wake={v.wake} sleep={v.sleep} compact />
            <ul className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              {[
                { k: 'Sleep', val: `${v.sleepHours}h` },
                { k: 'Steps', val: nfIN.format(v.steps) },
                ...(v.areas.includes('health') ? [{ k: 'Water', val: litres(v.waterMl) }] : [{ k: 'Up at', val: v.wake }]),
              ].map((t) => (
                <li key={t.k} className="rounded-[8px] bg-surface-2 px-2 py-1.5">
                  <span className="block text-[10.5px] leading-4 text-ink-3">{t.k}</span>
                  <span className="block text-[13px] leading-5 font-semibold text-ink tabular-nums">{t.val}</span>
                </li>
              ))}
            </ul>
          </Part>

          <Part label="Areas" at={2} step={step} done={done} empty={reached(2) || v.areas.length ? null : 'The parts of life you level up'}>
            <ul className="flex flex-wrap gap-1.5">
              {v.areas.map((c: Category) => {
                const Icon = AREA_ICON[c]
                const first = c === focus && v.areas.length > 1
                return (
                  <motion.li key={c} layout="position" transition={SPRING} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 ps-1 pe-2.5 text-[12px] font-medium text-ink">
                    <span aria-hidden className="grid size-5 place-items-center rounded-full" style={{ color: `color-mix(in oklch, ${CATEGORY[c].color} 80%, var(--ink))`, background: `color-mix(in oklch, ${CATEGORY[c].color} 16%, transparent)` }}>
                      <Icon className="size-3" strokeWidth={2} />
                    </span>
                    {CATEGORY[c].label}
                    {first ? <Star aria-label="first" className="size-3 fill-[var(--medal-gold)] text-[var(--medal-gold)]" strokeWidth={2} /> : null}
                  </motion.li>
                )
              })}
            </ul>
          </Part>

          <Part label="The System · daily quests" at={2} step={step} done={done}
            empty={picks.length ? null : reached(3) ? 'The System picks whatever is slipping most' : 'Up to three things to train first'}>
            <ol className="flex flex-col gap-1">
              {picks.map((id, k) => {
                const o = IMPROVE.find((x) => x.id === id)!
                return (
                  <motion.li key={id} layout="position" transition={SPRING} className="flex h-8 items-center gap-2 text-[12.5px]">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-pill text-[10.5px] font-bold text-white tabular-nums">{k + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{target[id] ?? o.quest}</span>
                  </motion.li>
                )
              })}
            </ol>
          </Part>

          <Part label="Voice" at={3} step={step} done={done} empty={reached(3) ? null : 'How ReLife talks to you, and what you’re working toward'}>
            <div className="flex items-start gap-2.5 rounded-[12px] bg-surface p-2 shadow-1">
              <CapsuleMark className="size-7 shrink-0 rounded-[6px]" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-3 text-[11.5px] leading-4"><span className="font-semibold text-ink">ReLife</span><span className="text-ink-3">now</span></p>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.p key={tone.key} {...appear} className="mt-0.5 text-[12.5px] leading-[17px] text-pretty text-ink-2">{tone.example}</motion.p>
                </AnimatePresence>
              </div>
            </div>
            {v.goals.trim() ? (
              <p className="mt-2 line-clamp-2 border-s-2 border-pill ps-2.5 text-[12.5px] leading-[18px] text-ink-2 italic">{v.goals.trim()}</p>
            ) : null}
          </Part>

          <Part label="Today’s quest log" at={4} step={step} done={done}
            empty={picked.length ? null : reached(4) ? 'No routines yet. Add them anytime in Habits.' : 'A few routines, each with a reminder and a streak'}>
            <ul className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {picked.slice(0, 4).map((t) => (
                  <motion.li key={t.id} layout="position" {...appear} className="flex h-9 items-center gap-2.5">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[8px]" style={{ background: `color-mix(in oklch, ${CATEGORY[t.area].color} 14%, transparent)` }}>
                      <RoutineArt name={t.name} kind={t.kind} area={t.area} className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{t.name}</span>
                    <span className="shrink-0 text-[11.5px] text-ink-3 tabular-nums">{t.rule.times[0]}</span>
                    <span aria-hidden className="size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--hairline)]" />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {picked.length > 4 ? <p className="mt-1 text-[11.5px] text-ink-3 tabular-nums">+{picked.length - 4} more</p> : null}
          </Part>
        </div>
      </Fluid>

      <AnimatePresence initial={false}>
        {done ? (
          <motion.p key="saved" {...appear} className="flex items-center justify-center gap-1.5 border-t border-divider py-3 text-[12.5px] font-medium text-good">
            <Check className="size-4" strokeWidth={2} />Save file created
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** On a phone the preview shrinks to one line: the capsule, the name and the level. */
export function SaveStrip({ v, level }: { v: V; level: Level | null }) {
  const name = firstName(v.name)
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-surface px-3 py-2.5 shadow-1">
      <CapsuleIcon letter={(name[0] ?? '?').toUpperCase()} size="sm" className="ms-1" />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[14px] leading-5 font-semibold', name ? 'text-ink' : 'text-ink-3')}>{name || 'Your name'}</p>
        <p className="text-[12px] leading-4 text-ink-3">Lv {level?.level ?? 1} · {level?.title ?? 'Awakened'}</p>
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
