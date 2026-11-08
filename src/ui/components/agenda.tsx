'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useOptimistic, useState, useTransition } from 'react'
import { Check, RotateCcw, SkipForward } from 'lucide-react'
import { RoutineArt } from './routine-art'
import { addToGoal, toggleCheck } from '@/app/actions'
import { cn } from '../cn'
import { Button } from './button'
import { Capsule } from './capsule'
import { announceXp, useToast } from './toast'
import { EASE_OUT, EASE_OUT_STRONG } from '@/ui/beui/lib/ease'

export type AgendaRow = {
  key: string
  scheduleId: string
  occurrence: string // ISO
  time: string
  name: string
  kind: 'routine' | 'medicine' | 'subscription' | 'bill' | 'renewal'
  color: string
  /** Life area, for the routine's icon fallback. */
  area: string
  detail?: string
  status: 'done' | 'skipped' | 'pending' | 'missed'
  /** This routine's share of today's plan XP, shown as the quest reward. */
  xp?: number
}

const PERIODS = [
  { key: 'morning', label: 'Morning', until: 12 },
  { key: 'afternoon', label: 'Afternoon', until: 17 },
  { key: 'evening', label: 'Evening', until: 21 },
  { key: 'night', label: 'Night', until: 24 },
] as const
const periodOf = (time: string) => PERIODS.find((p) => Number(time.slice(0, 2)) < p.until)!.key

/** Check off today's routines and medicines. Optimistic: the tap lands instantly. */
export function Agenda({ rows }: { rows: AgendaRow[] }) {
  const [optimistic, setOptimistic] = useOptimistic(
    rows,
    (state, { key, status }: { key: string; status: AgendaRow['status'] }) => state.map((r) => (r.key === key ? { ...r, status } : r)),
  )
  const [, start] = useTransition()
  const toast = useToast()

  const act = (r: AgendaRow, status: 'done' | 'skipped' | null) =>
    start(async () => {
      setOptimistic({ key: r.key, status: status ?? 'pending' })
      try {
        announceXp(toast, await toggleCheck(r.scheduleId, r.occurrence, status))
      } catch {
        toast('Could not save. Try again.', 'bad')
      }
    })

  const overdue = optimistic.filter((r) => r.status === 'missed')
  const upcoming = optimistic.filter((r) => r.status === 'pending')
  const closed = optimistic.filter((r) => r.status === 'done' || r.status === 'skipped')
  const groups = [
    ...(overdue.length ? [{ key: 'overdue', label: 'Overdue', rows: overdue, alert: true }] : []),
    ...PERIODS.map((p) => ({ key: p.key, label: p.label, rows: upcoming.filter((r) => periodOf(r.time) === p.key), alert: false })),
  ].filter((g) => g.rows.length)

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h3 className={cn('mb-1 flex items-center gap-2 px-1 text-[11.5px] font-semibold tracking-[0.08em] uppercase', g.alert ? 'text-bad' : 'text-ink-3')}>
            {g.label}
            <span className="font-medium tabular-nums opacity-70">{g.rows.length}</span>
            <span aria-hidden className="h-px flex-1 bg-divider" />
          </h3>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {g.rows.map((r) => (
                <motion.li
                  key={r.key}
                  layout="position"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                >
                  <Row r={r} onToggle={() => act(r, 'done')} onSkip={() => act(r, 'skipped')} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}

      {groups.length === 0 && rows.length > 0 ? (
        <p className="rise flex items-center gap-2 px-1 text-[13.5px] text-ink-2">
          <Check className="size-4 text-good" strokeWidth={2} aria-hidden />
          Everything for today is checked off.
        </p>
      ) : null}

      {closed.length ? (
        <details className="group" open={groups.length === 0}>
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md px-1 text-[13px] font-medium text-ink-3 select-none hover:text-ink-2 [&::-webkit-details-marker]:hidden">
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 transition-[rotate] duration-150 group-open:rotate-90">
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Done
            <span className="tabular-nums opacity-70">{closed.length}</span>
          </summary>
          <ul className="mt-1 flex flex-col">
            {closed.map((r) => <li key={r.key}><DoneRow r={r} onUndo={() => act(r, null)} /></li>)}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/** The circle you tap. Outline in the area colour; fills with a soft tint and a check when done. */
function CheckButton({ r, onToggle, size = 'md', forceDone }: { r: AgendaRow; onToggle: () => void; size?: 'lg' | 'md' | 'sm'; forceDone?: boolean }) {
  const done = r.status === 'done' || !!forceDone
  const skipped = r.status === 'skipped'
  const box = size === 'lg' ? 'size-7' : size === 'md' ? 'size-[22px]' : 'size-[18px]'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={done || skipped ? `Undo ${r.name}` : `Mark ${r.name} done`}
      className={cn('group/check relative grid shrink-0 place-items-center rounded-full transition-[scale] duration-150 ease-out-quint active:scale-[0.96] after:absolute after:inset-[-9px] after:content-[""] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill', box)}
      style={{ '--c': r.status === 'missed' ? 'var(--bad)' : r.color } as React.CSSProperties}
    >
      {/* Both states stay mounted; cross-fade with scale + blur. */}
      <span
        className={cn(
          'absolute inset-0 rounded-full shadow-[inset_0_0_0_1.5px_color-mix(in_oklch,var(--c)_70%,transparent)] transition-[opacity,scale,filter,background-color] duration-200 ease-out-quint group-hover/check:bg-[color-mix(in_oklch,var(--c)_14%,transparent)]',
          done || skipped ? 'scale-25 opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0',
        )}
      />
      <span
        className={cn('absolute inset-0 grid place-items-center rounded-full transition-[opacity,scale,filter] duration-200 ease-out-quint', done ? 'scale-100 opacity-100 blur-0' : 'scale-25 opacity-0 blur-[4px]')}
        style={{ background: 'color-mix(in oklch, var(--c) 22%, transparent)', color: 'var(--c)' }}
      >
        <Check className={size === 'md' ? 'size-3.5' : 'size-3'} strokeWidth={3} />
      </span>
      <span className={cn('absolute inset-0 grid place-items-center rounded-full bg-surface-2 text-ink-3 transition-[opacity,scale,filter] duration-200 ease-out-quint', skipped ? 'scale-100 opacity-100 blur-0' : 'scale-25 opacity-0 blur-[4px]')}>
        <SkipForward className={size === 'md' ? 'size-3' : 'size-2.5'} strokeWidth={2} />
      </span>
    </button>
  )
}

/** One quest card: the routine's picture, what and when, its XP, and the check on the trailing edge. */
function Row({ r, onToggle, onSkip }: { r: AgendaRow; onToggle: () => void; onSkip: () => void }) {
  const missed = r.status === 'missed'
  const reduce = useReducedMotion()
  const [won, setWon] = useState(false)
  // Completing plays a short win in place (ring, sparks, +XP rising, a flash) before the card moves to Done.
  // Kept under 300ms: this is the most repeated tap in the app.
  const complete = () => {
    if (won) return
    if (reduce) return onToggle()
    setWon(true)
    setTimeout(onToggle, 280)
  }
  return (
    <motion.div
      animate={won ? { backgroundColor: [`color-mix(in oklch, ${r.color} 18%, transparent)`, 'color-mix(in oklch, var(--ink) 2.5%, transparent)'] } : undefined}
      transition={{ duration: 0.3, ease: EASE_OUT_STRONG }}
      className="group/row relative flex min-h-[64px] items-center gap-3.5 rounded-[14px] bg-ink/[0.025] px-3 py-2 transition-[background-color] duration-150 hover:bg-ink/[0.045] dark:bg-white/[0.035] dark:hover:bg-white/[0.06]"
    >
      <motion.span
        aria-hidden
        animate={won ? { scale: [1, 1.12, 1], rotate: [0, -8, 0] } : undefined}
        transition={{ duration: 0.4, ease: EASE_OUT_STRONG }}
        className="grid size-10 shrink-0 place-items-center rounded-[11px]"
        style={{ color: `color-mix(in oklch, ${r.color} 80%, var(--ink))`, background: `color-mix(in oklch, ${r.color} 16%, transparent)` }}
      >
        <RoutineArt name={r.name} kind={r.kind} area={r.area} />
      </motion.span>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[15px] font-medium transition-[color] duration-200', won ? 'text-ink-3' : 'text-ink')}>{r.name}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-ink-3 tabular-nums">
          <span className={missed ? 'font-medium text-bad' : undefined}>{missed ? `Overdue · ${r.time}` : r.time}</span>
          {r.detail ? <> · {r.detail}</> : null}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onSkip} className="text-ink-3 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 max-lg:hidden">Skip</Button>
      {r.xp ? (
        <span className="relative shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: 'color-mix(in oklch, var(--medal-gold) 80%, var(--ink))' }}>
          +{r.xp} XP
          <AnimatePresence>
            {won ? (
              <motion.span
                aria-hidden
                className="absolute inset-x-0 top-0 text-center font-bold"
                initial={{ y: 0, opacity: 1, scale: 1 }} animate={{ y: -26, opacity: 0, scale: 1.25 }}
                transition={{ duration: 0.4, ease: EASE_OUT_STRONG }}
              >
                +{r.xp}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      ) : null}
      <span className="relative grid place-items-center">
        {won ? <CheckBurst color={r.color} /> : null}
        <CheckButton r={r} onToggle={complete} size="lg" forceDone={won} />
      </span>
    </motion.div>
  )
}

/** A ring that expands and eight sparks that fly out from the check. Decorative, under 0.5s. */
function CheckBurst({ color }: { color: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      <motion.span
        className="absolute size-7 rounded-full"
        style={{ boxShadow: `0 0 0 2px ${color}` }}
        initial={{ scale: 1, opacity: 0.9 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.45, ease: EASE_OUT_STRONG }}
      />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return (
          <motion.span
            key={i}
            className="absolute size-1.5 rounded-full"
            style={{ background: i % 2 ? color : 'var(--medal-gold)' }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * 26, y: Math.sin(a) * 26, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.45, ease: EASE_OUT_STRONG }}
          />
        )
      })}
    </span>
  )
}

function DoneRow({ r, onUndo }: { r: AgendaRow; onUndo: () => void }) {
  const skipped = r.status === 'skipped'
  return (
    <div className="group/row flex h-11 items-center gap-3.5 rounded-[12px] px-3 transition-[background-color] duration-150 hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]">
      {/* Done: the same picture, faded and greyed, beside struck-through text. */}
      <RoutineArt name={r.name} kind={r.kind} area={r.area} className="size-5 shrink-0 opacity-70 grayscale-[0.5]" />
      <span className="min-w-0 flex-1 truncate text-[14px] text-ink-3 line-through decoration-ink-3/40">{r.name}</span>
      {skipped ? <span className="text-[12px] text-ink-3">Skipped</span> : null}
      <Button variant="ghost" size="icon-sm" onClick={onUndo} aria-label={`Undo ${r.name}`} className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100">
        <RotateCcw className="size-3.5" strokeWidth={1.5} />
      </Button>
      <span className="w-12 shrink-0 text-end text-[12.5px] text-ink-3 tabular-nums">{r.time}</span>
      <CheckButton r={r} onToggle={onUndo} size="sm" />
    </div>
  )
}

export type GoalRow = {
  scheduleId: string
  name: string
  value: number
  target: number
  unit: string
  step: number
  color: string
}

/** Quantity routines (water): one capsule per goal with a quick-add button. */
export function Goals({ rows }: { rows: GoalRow[] }) {
  const [optimistic, add] = useOptimistic(rows, (state, { id, step }: { id: string; step: number }) =>
    state.map((g) => (g.scheduleId === id ? { ...g, value: g.value + step } : g)))
  const [, start] = useTransition()
  const toast = useToast()
  return (
    <ul className="flex flex-col gap-4">
      {optimistic.map((g) => (
        <li key={g.scheduleId} className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="truncate text-[15px] text-ink">{g.name}</span>
              <span className="text-[13px] text-ink-3 tabular-nums">
                <span className="font-medium text-ink">{fmt(g.value)}</span> / {fmt(g.target)} {g.unit}
              </span>
            </div>
            <Capsule value={g.value} max={g.target} color={g.color} label={`${g.name} progress`} />
          </div>
          <Button
            size="sm"
            onClick={() => start(async () => {
              add({ id: g.scheduleId, step: g.step })
              try { announceXp(toast, await addToGoal(g.scheduleId, g.step)) }
              catch { toast('Could not save. Try again.', 'bad') }
            })}
            className="tabular-nums"
          >
            +{fmt(g.step)} {g.unit}
          </Button>
        </li>
      ))}
    </ul>
  )
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(n)
}
