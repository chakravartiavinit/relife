'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  Check, Flame, Footprints, GitCommitHorizontal, GraduationCap, HeartHandshake, ListChecks, Moon, PiggyBank, Smile, Snowflake, Swords, Waves,
  type LucideIcon,
} from 'lucide-react'
import type { QuestMeasure, Rarity } from '@/domain/quests'
import { openChestAction } from '@/app/actions'
import { CATEGORY } from '../tokens'
import { Button } from './button'
import { Capsule } from './capsule'
import { announceXp, useToast } from './toast'
import { cn } from '../cn'
import { SystemQuests, type SystemQuestItem } from './system-quests'
import { EASE_OUT_STRONG } from '@/ui/beui/lib/ease'

export type QuestItem = { key: string; title: string; area: string; measure: QuestMeasure; target: number; progress: number; done: boolean; rarity: Rarity }
export type ChestItem = { id: string; rarity: Rarity; reason: string }

const MEASURE_ICON: Record<QuestMeasure, LucideIcon> = {
  fullplan: ListChecks, active: Flame, sleep7: Moon, steps8k: Footprints, mood: Smile, meditate: Waves,
  commit: GitCommitHorizontal, learn: GraduationCap, frugal: PiggyBank, catchup: HeartHandshake,
}
export const RARITY: Record<Rarity, { label: string; color: string }> = {
  common: { label: 'Common', color: 'var(--pill)' },
  rare: { label: 'Rare', color: 'var(--medal-gold)' },
  epic: { label: 'Epic', color: 'var(--medal-sakura)' },
}
const areaColor = (a: string) => (a in CATEGORY ? CATEGORY[a as keyof typeof CATEGORY].color : 'var(--pill)')

/** Today's quests, this week's quest, chests waiting to be opened and streak freezes held. */
export function Quests({ system, weekly, chests, freezes, frozeOn, weekLeft }: {
  system: { quests: SystemQuestItem[]; difficulty: number; hasData: boolean; timezone: string }
  weekly: QuestItem[]; chests: ChestItem[]; freezes: number; frozeOn: string[]; weekLeft: number
}) {
  const [opening, setOpening] = useState(false)
  return (
    <section aria-labelledby="quests-h" className="relative rounded-lg bg-surface p-5 shadow-1">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 id="quests-h" className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
          <span aria-hidden className="grid size-7 place-items-center rounded-[8px] text-pill-ink" style={{ background: 'var(--pill-wash)' }}><Swords className="size-4" strokeWidth={2} /></span>
          Quests
        </h2>
        <span
          title="Streak freezes: one is used automatically when you miss a day, so your streak survives."
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--hairline)] tabular-nums"
        >
          <Snowflake className="size-3.5 text-sky" strokeWidth={2} aria-hidden />
          {freezes} <span className="sr-only">streak freezes</span><span aria-hidden className="text-ink-3">/ 2</span>
        </span>
      </header>

      {chests.length ? (
        <button
          type="button"
          onClick={() => setOpening(true)}
          className="group mb-4 flex w-full items-center gap-3 rounded-md p-2.5 text-start transition-[background-color,scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
          style={{ background: `color-mix(in oklch, ${RARITY[chests[0].rarity].color} 12%, transparent)` }}
        >
          <motion.span
            aria-hidden
            animate={{ rotate: [0, -6, 6, -4, 0] }}
            transition={{ duration: 0.6, repeat: 2, repeatDelay: 2.4, ease: 'easeInOut' }}
            className="shrink-0"
          >
            <ChestArt rarity={chests[0].rarity} size={40} />
          </motion.span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold text-ink">{chests.length === 1 ? 'A chest to open' : `${chests.length} chests to open`}</span>
            <span className="block truncate text-[12px] text-ink-3">{chests[0].reason}</span>
          </span>
          <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-bg">Open</span>
        </button>
      ) : null}

      <SystemQuests {...system} />
      <div className="mt-5 border-t border-divider pt-4">
        <Group label={`This week · ${weekLeft === 0 ? 'ends today' : `${weekLeft} day${weekLeft === 1 ? '' : 's'} left`}`} items={weekly} empty="" />
      </div>

      {frozeOn.length ? (
        <p className="mt-4 flex items-center gap-1.5 text-[12px] text-ink-3">
          <Snowflake className="size-3.5 text-sky" strokeWidth={2} aria-hidden />
          A freeze kept your streak on {frozeOn.map((d) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))).join(' and ')}.
        </p>
      ) : null}

      {/* Stays open after the page refreshes behind it (the opened chest leaves `chests`); it keeps its own queue. */}
      <AnimatePresence>{opening ? <ChestModal key="chest" chests={chests} onClose={() => setOpening(false)} /> : null}</AnimatePresence>
    </section>
  )
}

function Group({ label, items, empty }: { label: string; items: QuestItem[]; empty: string }) {
  if (!items.length) return empty ? <p className="text-[12.5px] text-ink-3">{empty}</p> : null
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{label}</h3>
      <ul className="flex flex-col">
        {items.map((q) => {
          const Icon = MEASURE_ICON[q.measure]
          const color = areaColor(q.area)
          return (
            <li key={q.key} className="flex min-h-12 items-center gap-3 py-1.5">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ color: `color-mix(in oklch, ${color} 78%, var(--ink))`, background: `color-mix(in oklch, ${color} 15%, transparent)` }}>
                <Icon className="size-4" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[13.5px] leading-snug', q.done ? 'text-ink-3 line-through decoration-ink-3/50' : 'text-ink')}>{q.title}</span>
                {q.target > 1 ? (
                  <span className="mt-1.5 flex items-center gap-2">
                    <Capsule value={q.progress} max={q.target} size="sm" color={color} label={`${q.title}: ${q.progress} of ${q.target}`} />
                    <span className="shrink-0 text-[11.5px] text-ink-3 tabular-nums">{q.progress}/{q.target}</span>
                  </span>
                ) : null}
              </span>
              {q.done ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-good">
                  <Check className="size-3.5" strokeWidth={2.5} aria-hidden />Done
                </span>
              ) : (
                <span title={`${RARITY[q.rarity].label} chest`} className="shrink-0"><ChestArt rarity={q.rarity} size={22} /><span className="sr-only">Reward: {RARITY[q.rarity].label} chest</span></span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A small treasure chest in its rarity colour. The lid swings open when `open`. */
export function ChestArt({ rarity, size = 48, open = false }: { rarity: Rarity; size?: number; open?: boolean }) {
  const c = RARITY[rarity].color
  const band = `color-mix(in oklch, ${c} 55%, black)`
  return (
    <svg viewBox="0 0 64 60" width={size} height={size * 60 / 64} aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={`chest-${rarity}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`color-mix(in oklch, ${c} 70%, white)`} />
          <stop offset="1" stopColor={`color-mix(in oklch, ${c} 85%, black)`} />
        </linearGradient>
      </defs>
      {/* The dark inside, only visible once the lid lifts. */}
      <rect x="9" y="21" width="46" height="9" rx="2" fill={`color-mix(in oklch, ${c} 30%, black)`} />
      <rect x="6" y="28" width="52" height="28" rx="5" fill={`url(#chest-${rarity})`} />
      <rect x="6" y="28" width="52" height="5" fill={band} opacity="0.55" />
      <rect x="28" y="28" width="8" height="28" fill={band} opacity="0.55" />
      <motion.g
        initial={false}
        animate={open ? { rotate: -22, y: -5 } : { rotate: 0, y: 0 }}
        transition={{ type: 'spring', duration: 0.5, bounce: 0 }}
        style={{ originX: '10%', originY: '100%' }}
      >
        <path d="M6 28 V20 a14 12 0 0 1 14-12 h24 a14 12 0 0 1 14 12 V28 Z" fill={`url(#chest-${rarity})`} />
        <rect x="28" y="8" width="8" height="20" fill={band} opacity="0.55" />
      </motion.g>
      <rect x="27" y="24" width="10" height="11" rx="2.5" fill={`color-mix(in oklch, var(--medal-gold) 80%, white)`} stroke={band} strokeWidth="1.2" />
    </svg>
  )
}

/** Coins and sparks bursting up out of the chest; more and higher for rarer chests. */
function Loot({ rarity }: { rarity: Rarity }) {
  const reduce = useReducedMotion()
  const n = { common: 10, rare: 18, epic: 30 }[rarity]
  const bits = useMemo(() => Array.from({ length: n }, (_, i) => ({
    x: (Math.random() - 0.5) * (rarity === 'epic' ? 300 : 220),
    up: 70 + Math.random() * (rarity === 'common' ? 70 : 120),
    fall: 60 + Math.random() * 60,
    coin: i % 3 !== 0,
    delay: Math.random() * 0.12,
    rot: (Math.random() - 0.5) * 540,
  })), [n, rarity])
  if (reduce) return null
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={b.coin
            ? { width: 10, height: 10, borderRadius: 99, background: 'radial-gradient(circle at 35% 30%, color-mix(in oklch, var(--medal-gold) 40%, white), var(--medal-gold))', boxShadow: '0 0 0 1px color-mix(in oklch, var(--medal-gold) 60%, black)' }
            : { width: 6, height: 6, rotate: 45, background: RARITY[rarity].color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: b.x, y: [0, -b.up, -b.up + b.fall], opacity: [1, 1, 0], scale: 1, rotate: b.rot }}
          transition={{ duration: 1.1, delay: 0.1 + b.delay, times: [0, 0.4, 1], ease: ['easeOut', 'easeIn'] }}
        />
      ))}
    </span>
  )
}

type Opened = Extract<Awaited<ReturnType<typeof openChestAction>>, { ok: true }>

/** Open chests one by one: tap the chest, the lid pops, the reward rises out. */
function ChestModal({ chests, onClose }: { chests: ChestItem[]; onClose: () => void }) {
  // Hold the queue locally: the page refreshes behind the modal after each open.
  const [queue] = useState(chests)
  const [k, setK] = useState(0)
  const [got, setGot] = useState<Opened | null>(null)
  const [pending, start] = useTransition()
  const toast = useToast()
  const primary = useRef<HTMLButtonElement>(null)
  const chest = queue[k]

  useEffect(() => { primary.current?.focus() }, [k, got])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const open = () => start(async () => {
    const r = await openChestAction(chest.id)
    // Already opened (another tab, a double tap): close; the refreshed page shows what's left.
    if (!r.ok) { toast(r.error, 'bad'); onClose(); return }
    setGot(r)
    if (r.rarity !== 'common' || r.levelUp) window.dispatchEvent(new Event('relife:celebrate'))
    if (r.levelUp) announceXp(toast, { levelUp: r.levelUp, unlocked: [] })
  })
  const next = () => { setGot(null); setK((x) => x + 1) }
  const more = queue.length - k - 1

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}
      className="fixed inset-0 z-[65] grid place-items-center bg-bg/55 p-5 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="chest-h"
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
        transition={{ duration: 0.35, ease: EASE_OUT_STRONG }}
        className="relative w-full max-w-[380px] overflow-hidden rounded-[28px] bg-surface p-7 text-center shadow-3"
      >
        {got && chest.rarity === 'epic' ? (
          <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-[28px] bg-white" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
        ) : null}
        <p className="text-[12px] font-semibold tracking-[0.08em] uppercase" style={{ color: `color-mix(in oklch, ${RARITY[chest.rarity].color} 70%, var(--ink))` }}>
          {RARITY[chest.rarity].label} chest{queue.length > 1 ? ` · ${k + 1} of ${queue.length}` : ''}
        </p>
        <h2 id="chest-h" className="mt-1 text-[14px] text-ink-2">{chest.reason}</h2>

        <div className="relative mx-auto mt-10 grid h-[150px] place-items-center">
          {/* Glow behind the chest grows when it opens. */}
          <motion.span
            aria-hidden
            className="absolute size-[150px] rounded-full"
            style={{ background: `radial-gradient(circle, color-mix(in oklch, ${RARITY[chest.rarity].color} 45%, transparent), transparent 70%)` }}
            animate={{ scale: got ? 1.25 : 0.8, opacity: got ? 1 : 0.5 }}
            transition={{ duration: 0.5, ease: EASE_OUT_STRONG }}
          />
          {/* Opened: rays fan out behind the chest in its rarity colour. */}
          <AnimatePresence>
            {got ? (
              <motion.span
                key="rays"
                aria-hidden
                className="absolute size-[320px] rounded-full [mask-image:radial-gradient(circle,black_15%,transparent_65%)]"
                style={{ background: `repeating-conic-gradient(from 0deg, color-mix(in oklch, ${RARITY[chest.rarity].color} 40%, transparent) 0deg 8deg, transparent 8deg 24deg)` }}
                initial={{ scale: 0.3, opacity: 0, rotate: 0 }} animate={{ scale: 1, opacity: 1, rotate: 30 }}
                transition={{ scale: { duration: 0.6, ease: EASE_OUT_STRONG }, opacity: { duration: 0.3 }, rotate: { duration: 6, ease: 'linear' } }}
              />
            ) : null}
          </AnimatePresence>
          {got ? <Loot rarity={chest.rarity} /> : null}
          {/* Idle: a wobble every so often. Opening: a fast rattle (anticipation). Open: still. */}
          <motion.span
            className="relative"
            animate={got ? { rotate: 0, scale: [1, 1.08, 1] } : pending ? { rotate: [0, -6, 6, -6, 6, 0], x: [0, -2, 2, -2, 2, 0] } : { rotate: [0, -4, 4, -3, 0] }}
            transition={got ? { duration: 0.35 } : pending ? { duration: 0.35, repeat: Infinity } : { duration: 0.6, repeat: Infinity, repeatDelay: 1.2 }}
          >
            <ChestArt rarity={chest.rarity} size={120} open={!!got} />
          </motion.span>
          <AnimatePresence>
            {got ? (
              <motion.div
                key="loot"
                initial={{ opacity: 0, y: 10, scale: 0.6 }} animate={{ opacity: 1, y: -92, scale: 1 }}
                transition={{ duration: 0.55, ease: [0.34, 1.4, 0.64, 1], delay: 0.18 }}
                className="absolute top-1/2 flex flex-col items-center gap-1.5"
              >
                <span className="rounded-full bg-ink px-3.5 py-1.5 font-display text-[18px] font-bold text-bg tabular-nums shadow-2">+{got.xp} XP</span>
                {got.freeze ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12.5px] font-semibold text-ink shadow-2">
                    <Snowflake className="size-3.5 text-sky" strokeWidth={2} aria-hidden />Streak freeze
                  </span>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <p aria-live="polite" className="mt-3 min-h-[2lh] text-[13px] leading-relaxed text-ink-3">
          {got
            ? got.converted ? `You already hold 2 freezes, so this one became +50 XP.` : got.freeze ? 'The freeze saves your streak the next time you miss a day.' : 'Added to your XP.'
            : 'Tap to open. XP is added straight away.'}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {!got ? (
            <Button ref={primary} variant="primary" size="lg" className="w-full" onClick={open} disabled={pending}>{pending ? 'Opening…' : 'Open chest'}</Button>
          ) : more ? (
            <Button ref={primary} variant="primary" size="lg" className="w-full" onClick={next}>Open next ({more} left)</Button>
          ) : (
            <Button ref={primary} variant="primary" size="lg" className="w-full" onClick={onClose}>Collect</Button>
          )}
          {!got ? <Button variant="ghost" size="lg" className="w-full" onClick={onClose}>Later</Button> : null}
        </div>
      </motion.div>
    </motion.div>
  )
}
