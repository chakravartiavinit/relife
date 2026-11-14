'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Share2, Trophy } from 'lucide-react'
import type { Unlocked } from '@/core/xp'
import { ACHIEVEMENT_ICON, TIER_COLOR } from '../achievement-icons'
import { EASE_OUT_STRONG } from '@/ui/beui/lib/ease'
import { Button } from './button'
import { openShareCard } from './share/share-event'

// Big moments get big animations, everyday ones stay small. Mounted once in the layout and driven by
// window events, so anything that earns XP (a check, a log, a chest) can trigger them:
//   relife:level-up     full-screen: rays, a ring that fills, the new level counting up, confetti
//   relife:achievement  a medal that flips in on a banner from the top, with a shine sweep
// Task check-offs animate in place (agenda.tsx); chests animate in their own pop-up (quests.tsx).

export type LevelUp = { level: number; title: string; from: number; newTitle: boolean }
export const celebrateLevel = (d: LevelUp) => window.dispatchEvent(new CustomEvent('relife:level-up', { detail: d }))
export const celebrateAchievement = (d: Unlocked) => window.dispatchEvent(new CustomEvent('relife:achievement', { detail: d }))

const CONFETTI = ['var(--pill)', 'var(--sky)', 'var(--sakura)', 'var(--medal-gold)', 'var(--cat-mind)', 'var(--cat-relationships)']

export function Celebrations() {
  const [level, setLevel] = useState<LevelUp | null>(null)
  const [medals, setMedals] = useState<(Unlocked & { id: number })[]>([])
  const seq = useRef(0)

  useEffect(() => {
    const onLevel = (e: Event) => setLevel((e as CustomEvent<LevelUp>).detail)
    const onMedal = (e: Event) => {
      const d = (e as CustomEvent<Unlocked>).detail
      const id = ++seq.current
      setMedals((m) => [...m.slice(-2), { ...d, id }])
      setTimeout(() => setMedals((m) => m.filter((x) => x.id !== id)), 5200)
    }
    window.addEventListener('relife:level-up', onLevel)
    window.addEventListener('relife:achievement', onMedal)
    return () => { window.removeEventListener('relife:level-up', onLevel); window.removeEventListener('relife:achievement', onMedal) }
  }, [])

  return (
    <>
      <AnimatePresence>{level ? <LevelUpScreen key={level.level} d={level} onDone={() => setLevel(null)} /> : null}</AnimatePresence>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 z-[78] flex flex-col items-center gap-2 px-4">
        <AnimatePresence initial={false}>
          {medals.map((m) => <MedalBanner key={m.id} d={m} onClose={() => setMedals((x) => x.filter((y) => y.id !== m.id))} />)}
        </AnimatePresence>
      </div>
    </>
  )
}

/* ─── Level up ─────────────────────────────────────────────────────────── */

function LevelUpScreen({ d, onDone }: { d: LevelUp; onDone: () => void }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(d.from)
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    close.current?.focus()
    // The number counts up from the old level once the ring has filled.
    const steps = Math.max(1, d.level - d.from)
    const timers = Array.from({ length: steps }, (_, i) => setTimeout(() => setShown(d.from + i + 1), (reduce ? 0 : 650) + i * 120))
    const auto = setTimeout(onDone, 4200)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', esc)
    return () => { timers.forEach(clearTimeout); clearTimeout(auto); window.removeEventListener('keydown', esc) }
  }, [d, onDone, reduce])

  const r = 70, len = 2 * Math.PI * r
  return (
    <motion.div
      role="dialog" aria-modal="true" aria-label={`Level ${d.level} reached`}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }} transition={{ duration: 0.25 }}
      onClick={onDone}
      className="fixed inset-0 z-[80] grid cursor-pointer place-items-center overflow-hidden bg-bg/70 backdrop-blur-md"
    >
      {/* Rays turning slowly behind everything. */}
      {!reduce ? (
        <motion.div
          aria-hidden
          className="absolute size-[900px] rounded-full [mask-image:radial-gradient(circle,black_10%,transparent_62%)]"
          style={{ background: 'repeating-conic-gradient(from 0deg, color-mix(in oklch, var(--pill) 32%, transparent) 0deg 7deg, transparent 7deg 22deg)' }}
          initial={{ scale: 0.4, opacity: 0, rotate: 0 }}
          animate={{ scale: 1, opacity: 1, rotate: 40 }}
          transition={{ scale: { duration: 0.7, ease: EASE_OUT_STRONG }, opacity: { duration: 0.4 }, rotate: { duration: 4.2, ease: 'linear' } }}
        />
      ) : null}
      {!reduce ? <Burst count={36} spread={340} /> : null}

      <div className="relative flex flex-col items-center text-center">
        <motion.p
          className="text-[13px] font-bold tracking-[0.4em] text-pill-ink uppercase"
          initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: EASE_OUT_STRONG, delay: 0.1 }}
        >
          Level up
        </motion.p>

        <motion.div
          className="relative mt-5 grid size-[180px] place-items-center"
          initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE_OUT_STRONG }}
        >
          <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90">
            <circle cx="80" cy="80" r={r} fill="none" stroke="var(--hairline)" strokeWidth="10" />
            <motion.circle
              cx="80" cy="80" r={r} fill="none" stroke="var(--pill)" strokeWidth="10" strokeLinecap="round" strokeDasharray={len}
              initial={{ strokeDashoffset: len }} animate={{ strokeDashoffset: 0 }} transition={{ duration: reduce ? 0 : 0.6, ease: EASE_OUT_STRONG, delay: 0.1 }}
            />
          </svg>
          <div className="grid size-[128px] place-items-center rounded-full bg-ink text-bg shadow-[0_18px_40px_-14px_oklch(0.3_0.1_250/0.7)]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={shown}
                className="font-display text-[56px] leading-none font-extrabold tabular-nums"
                initial={{ y: 24, opacity: 0, filter: 'blur(4px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ y: -24, opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.28, ease: EASE_OUT_STRONG }}
              >
                {shown}
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT_STRONG, delay: 0.75 }}>
          <h2 className="mt-6 font-display text-[34px] leading-tight font-extrabold tracking-[-0.03em] text-ink">Level {d.level}</h2>
          <p className="mt-1 text-[15px] text-ink-2">
            {d.newTitle ? <>New title: <span className="font-semibold text-ink">{d.title}</span></> : <>Still <span className="font-semibold text-ink">{d.title}</span>, and stronger.</>}
          </p>
          <p className="mt-1 text-[13px] text-ink-3">An epic chest is waiting on Today.</p>
        </motion.div>

        <div className="mt-7 flex items-center gap-2">
          {/* Share opens the card dialog and closes this screen; a click here must not also count as "tap anywhere". */}
          <Button size="md" onClick={(e) => { e.stopPropagation(); openShareCard('level', String(d.level)); onDone() }}><Share2 className="size-4" strokeWidth={1.5} aria-hidden />Share</Button>
          <button ref={close} type="button" onClick={onDone} className="h-10 rounded-full px-5 text-[13px] font-medium text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
            Tap anywhere to continue
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/** Confetti flying out from the centre and falling. Decorative. */
function Burst({ count, spread }: { count: number; spread: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3
    const d = spread * (0.55 + Math.random() * 0.45)
    return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8, fall: 120 + Math.random() * 160, rot: (Math.random() - 0.5) * 720, c: CONFETTI[i % CONFETTI.length], round: i % 3 === 0, delay: Math.random() * 0.12 }
  }), [count, spread])
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{ width: b.round ? 8 : 7, height: b.round ? 8 : 13, borderRadius: b.round ? 99 : 2, background: b.c }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{ x: b.x, y: [0, b.y, b.y + b.fall], opacity: [1, 1, 0], rotate: b.rot, scale: 1 }}
          transition={{ duration: 1.8, delay: 0.15 + b.delay, times: [0, 0.35, 1], ease: ['easeOut', 'easeIn'] }}
        />
      ))}
    </div>
  )
}

/* ─── Achievement ──────────────────────────────────────────────────────── */

function MedalBanner({ d, onClose }: { d: Unlocked & { id: number }; onClose: () => void }) {
  const Icon = ACHIEVEMENT_ICON[d.key] ?? Trophy
  const c = TIER_COLOR[d.tier]
  return (
    <motion.div
      layout
      role="status"
      initial={{ opacity: 0, y: -28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', duration: 0.5, bounce: 0 }}
      className="pointer-events-auto relative flex w-full max-w-[380px] items-center gap-3.5 overflow-hidden rounded-[20px] bg-surface py-3 ps-3 pe-4 shadow-3"
      onClick={onClose}
    >
      {/* Shine sweeping across once the medal lands. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12"
        style={{ background: `linear-gradient(90deg, transparent, color-mix(in oklch, ${c} 35%, transparent), transparent)` }}
        initial={{ x: '-120%' }} animate={{ x: '360%' }} transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.55 }}
      />
      <motion.span
        aria-hidden
        className="relative grid size-12 shrink-0 place-items-center rounded-full text-white"
        style={{
          background: `radial-gradient(circle at 32% 26%, color-mix(in oklch, ${c} 45%, white), ${c} 58%, color-mix(in oklch, ${c} 72%, black))`,
          boxShadow: `inset 0 1px 0 oklch(1 0 0 / 0.5), 0 8px 18px -8px color-mix(in oklch, ${c} 80%, transparent)`,
        }}
        initial={{ rotateY: 180, scale: 0.6 }} animate={{ rotateY: 0, scale: 1 }} transition={{ duration: 0.7, ease: EASE_OUT_STRONG, delay: 0.12 }}
      >
        <Icon className="size-[22px] drop-shadow-[0_1px_1px_oklch(0_0_0/0.3)]" strokeWidth={2} />
      </motion.span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: `color-mix(in oklch, ${c} 70%, var(--ink))` }}>Achievement unlocked</span>
        <span className="block truncate text-[15px] font-semibold text-ink">{d.name}</span>
      </span>
      {d.xp ? <span className="relative shrink-0 text-[13px] font-bold tabular-nums" style={{ color: 'color-mix(in oklch, var(--medal-gold) 80%, var(--ink))' }}>+{d.xp} XP</span> : null}
    </motion.div>
  )
}
