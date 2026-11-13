'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useOptimistic, useState, useTransition } from 'react'
import { Check, Minus, Moon, RotateCcw, SkipForward, Sun, Sunrise, type LucideIcon } from 'lucide-react'
import { routineArt } from '../routine-icons'
import { RoutineArt } from './routine-art'
import { addToGoal, setGoalTarget, toggleCheck, undoGoalStep, undoQuickLog } from '@/app/actions'
import { cn } from '../cn'
import { Button } from './button'
import { Capsule } from './capsule'
import { announceXp, useToast } from './toast'
import { EASE_OUT, EASE_OUT_STRONG } from '@/ui/beui/lib/ease'
import { Collapsible, CollapsibleContent, CollapsibleIndicator, CollapsibleTrigger } from '@/ui/beui/motion/collapsible'
import { planPeriods, type Period, type PeriodGroup } from '@/domain/day-plan'
import { PeekLink } from './peek/peek-link'

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
  /** Short facts by kind: a medicine's dose and doses left, a walk's step target. 'warn' tints it (running low). */
  chips?: { text: string; warn?: boolean }[]
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
export function Agenda({ rows, timeline }: { rows: AgendaRow[]; /** Today's layout: Morning, Afternoon, Evening with a Now line at this `HH:MM`, done rows folded. */ timeline?: { now: string } }) {
  const [optimistic, setOptimistic] = useOptimistic(
    rows,
    (state, { key, status }: { key: string; status: AgendaRow['status'] }) => state.map((r) => (r.key === key ? { ...r, status } : r)),
  )
  const [, start] = useTransition()
  const toast = useToast()

  // Every check-off toasts what happened with Undo (the same words Capture uses); Undo is `toggleCheck(…, null)`.
  const act = (r: AgendaRow, status: 'done' | 'skipped' | null) =>
    start(async () => {
      setOptimistic({ key: r.key, status: status ?? 'pending' })
      try {
        announceXp(toast, await toggleCheck(r.scheduleId, r.occurrence, status))
        if (status) {
          toast(`${r.name} ${status === 'done' ? 'done' : 'skipped'}`, 'good', {
            description: status === 'done' && r.xp ? `+${r.xp} XP` : undefined, icon: routineArt(r.name, r.kind, r.area),
            action: { label: 'Undo', onClick: () => act(r, null) },
          })
        }
      } catch {
        toast.error()
      }
    })

  if (timeline) return <Timeline rows={optimistic} now={timeline.now} act={act} />

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

const PERIOD_ICON: Record<Period, LucideIcon> = { morning: Sunrise, afternoon: Sun, evening: Moon }

/**
 * Today's plan as a day: Morning, Afternoon, Evening, each with its overdue and pending rows, a Now line where the
 * clock is, and everything already done folded into one line ("6 done ●●●●●● names") that opens in place.
 */
function Timeline({ rows, now, act }: { rows: AgendaRow[]; now: string; act: (r: AgendaRow, status: 'done' | 'skipped' | null) => void }) {
  return (
    <div className="flex flex-col gap-6">
      {planPeriods(rows, now).map((p) => <PeriodSection key={p.key} p={p} now={now} act={act} />)}
    </div>
  )
}

function PeriodSection({ p, now, act }: { p: PeriodGroup<AgendaRow>; now: string; act: (r: AgendaRow, status: 'done' | 'skipped' | null) => void }) {
  const Icon = PERIOD_ICON[p.key]
  return (
    <section aria-label={p.label}>
      <h3 className="mb-2 flex items-center gap-2 px-1 font-mono text-label text-ink-3 uppercase">
        <Icon aria-hidden className="size-3.5" strokeWidth={1.5} />
        {p.label}
        <span className="font-sans tracking-normal normal-case">{p.summary}</span>
        <span aria-hidden className="h-px flex-1 bg-divider" />
      </h3>
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {p.open.flatMap((r, i) => [
            ...(p.nowAt === i ? [<NowLine key="now" now={now} />] : []),
            <motion.li key={r.key} layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
              <Row r={r} onToggle={() => act(r, 'done')} onSkip={() => act(r, 'skipped')} />
            </motion.li>,
          ])}
          {p.nowAt === p.open.length ? <NowLine key="now" now={now} /> : null}
        </AnimatePresence>
      </ul>
      {p.closed.length ? <DoneLine rows={p.closed} act={act} /> : null}
    </section>
  )
}

/** The current time, drawn between the rows that are before it and after it. */
function NowLine({ now }: { now: string }) {
  return (
    <li aria-label={`Now, ${now}`} className="flex items-center gap-2 px-3 text-caption font-semibold text-pill-ink tabular-nums">
      <span aria-hidden className="size-1.5 rounded-full bg-pill" />
      {now}
      <span aria-hidden className="h-px flex-1 bg-pill/40" />
    </li>
  )
}

/** "6 done ●●●●●● Wake up, Morning walk, …": one line per period; opens to the done rows, each with Undo. */
function DoneLine({ rows, act }: { rows: AgendaRow[]; act: (r: AgendaRow, status: 'done' | 'skipped' | null) => void }) {
  return (
    <Collapsible className="mt-1">
      <CollapsibleTrigger className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-small text-ink-3 hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-pill">
        <CollapsibleIndicator className="ml-0 -rotate-90 text-ink-3" />
        <span className="font-medium text-ink-2 tabular-nums">{rows.length} done</span>
        <span aria-hidden className="flex shrink-0 gap-1">{rows.slice(0, 8).map((r) => <span key={r.key} className="size-2 rounded-full" style={{ background: r.color }} />)}</span>
        <span className="min-w-0 flex-1 truncate text-start max-sm:hidden">{rows.map((r) => r.name).join(', ')}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col pb-1">{rows.map((r) => <li key={r.key}><DoneRow r={r} onUndo={() => act(r, null)} /></li>)}</ul>
      </CollapsibleContent>
    </Collapsible>
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

/** One quest: when (a time column, red when overdue), the routine's picture, what with its facts, XP, and the check. */
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
      <span className={cn('w-11 shrink-0 text-[13px] font-semibold tabular-nums', missed ? 'text-bad' : 'text-ink-2')}>{r.time}</span>
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
        <PeekLink to={{ type: 'routine', id: r.scheduleId }} className={cn('block truncate rounded-xs text-body font-medium transition-[color] duration-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill', won ? 'text-ink-3' : 'text-ink')}>{r.name}</PeekLink>
        {r.chips?.length || r.detail || missed ? (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3 tabular-nums">
            {missed ? <span className="inline-flex h-5 items-center rounded-full bg-bad/10 px-2 text-[11.5px] font-semibold text-bad">Overdue</span> : null}
            {r.chips?.map((c) => (
              <span key={c.text} className={cn('inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-medium', c.warn ? 'bg-warn/12 text-warn' : 'bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]')}>{c.text}</span>
            ))}
            {r.detail ? <span className="min-w-0 truncate">{r.detail}</span> : null}
          </div>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" onClick={onSkip} className="text-ink-3 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 max-lg:hidden">Skip</Button>
      {r.xp ? (
        <span className="relative inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11.5px] font-semibold tabular-nums max-sm:hidden" style={{ color: 'color-mix(in oklch, var(--medal-gold) 80%, var(--ink))', background: 'color-mix(in oklch, var(--medal-gold) 12%, transparent)' }}>
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
  area?: string
  /** The tracker the goal counts into (water → `water`), so Capture can tell it from a plain log. */
  slug?: string
  /** The next reminder time today, if any. */
  next?: string
}

/** Daily targets offered for water, in ml (2L … 4L). */
const WATER_TARGETS = [2000, 2500, 3000, 3500, 4000]

/**
 * Quantity routines (water): how much so far against today's target, one segment per glass (or a bar for big
 * targets), quick adds (one glass, two, a litre), undo, and for ml goals the daily target in one tap.
 */
export function Goals({ rows, compact }: { rows: GoalRow[]; /** Today's "All day" rows: the number and a stepper, no daily-target picker (that lives in the metric's Peek). */ compact?: boolean }) {
  const [optimistic, change] = useOptimistic(rows, (state, a: { id: string; add?: number; target?: number }) =>
    state.map((g) => (g.scheduleId === a.id ? { ...g, value: Math.max(0, g.value + (a.add ?? 0)), target: a.target ?? g.target } : g)))
  const [, start] = useTransition()
  const toast = useToast()
  // Every step toasts with Undo, which takes back exactly that step (once, whatever the day it is by then).
  // A negative amount is the minus button: it takes back the latest step logged today.
  const add = (g: GoalRow, amount: number) => start(async () => {
    change({ id: g.scheduleId, add: amount })
    try {
      if (amount < 0) { announceXp(toast, await undoGoalStep(g.scheduleId)); return }
      const { undo, ...news } = await addToGoal(g.scheduleId, amount)
      announceXp(toast, news)
      let used = false
      toast(`${g.name} +${fmtAmount(amount, g.unit)}`, 'good', {
        description: `${fmtAmount(g.value + amount, g.unit)} of ${fmtAmount(g.target, g.unit)} today`, icon: routineArt(g.name, 'routine', g.area ?? 'health'),
        action: { label: 'Undo', onClick: () => {
          if (used) return
          used = true
          start(async () => {
            change({ id: g.scheduleId, add: -amount })
            try { announceXp(toast, await undoQuickLog(undo)) } catch { used = false; toast.error() }
          })
        } },
      })
    } catch { toast.error() }
  })
  const retarget = (g: GoalRow, target: number) => start(async () => {
    change({ id: g.scheduleId, target })
    try { await setGoalTarget(g.scheduleId, target); toast(`${g.name} target saved`, 'good', { description: `${fmtAmount(target, g.unit)} a day`, icon: routineArt(g.name, 'routine', g.area ?? 'health') }) } catch { toast.error() }
  })

  return (
    <ul className="flex flex-col gap-3">
      {optimistic.map((g) => {
        const done = g.value >= g.target
        const left = Math.max(0, g.target - g.value)
        const glasses = Math.round(g.target / g.step)
        const ml = g.unit.toLowerCase() === 'ml'
        if (compact) return <QuantityRow key={g.scheduleId} g={g} done={done} left={left} glasses={glasses} add={add} />
        return (
          <li key={g.scheduleId} className="rounded-[16px] p-4" style={{ background: `color-mix(in oklch, ${g.color} 7%, transparent)` }}>
            <div className="flex items-start gap-3">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[11px]" style={{ background: `color-mix(in oklch, ${g.color} 16%, transparent)` }}>
                <RoutineArt name={g.name} kind="routine" area={g.area ?? 'health'} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-ink">{g.name}</p>
                <p className={cn('mt-0.5 text-[12.5px] tabular-nums', done ? 'font-medium text-good' : 'text-ink-3')}>
                  {done ? `Goal reached · ${fmtAmount(g.value, g.unit)}` : `${fmtAmount(left, g.unit)} to go`}
                  {!done && g.next ? ` · next reminder ${g.next}` : ''}
                </p>
              </div>
              <p className="shrink-0 text-right tabular-nums">
                <span className="text-[20px] leading-none font-bold tracking-[-0.02em] text-ink">{fmtAmount(g.value, g.unit)}</span>
                <span className="block text-[12px] text-ink-3">of {fmtAmount(g.target, g.unit)}</span>
              </p>
            </div>

            {/* One segment per glass, so "3 more glasses" is visible at a glance; a bar when that would be too many. */}
            {glasses <= 24 ? (
              <div className="mt-3 flex gap-1" role="img" aria-label={`${fmt(g.value)} of ${fmt(g.target)} ${g.unit}`}>
                {Array.from({ length: glasses }, (_, i) => {
                  const fill = Math.min(1, Math.max(0, (g.value - i * g.step) / g.step))
                  return (
                    <span key={i} className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/[0.08]">
                      <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out-quint" style={{ width: `${fill * 100}%`, background: done ? 'var(--good)' : g.color }} />
                    </span>
                  )
                })}
              </div>
            ) : <Capsule value={g.value} max={g.target} color={done ? 'var(--good)' : g.color} label={`${g.name} progress`} className="mt-3" />}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {[g.step, g.step * 2, ...(ml && g.step * 4 !== 1000 ? [1000] : [g.step * 4])].filter((v, i, a) => a.indexOf(v) === i).map((amount) => (
                  <Button key={amount} size="sm" variant="secondary" onClick={() => add(g, amount)} className="tabular-nums">+{fmtAmount(amount, g.unit)}</Button>
                ))}
                {g.value > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => add(g, -Math.min(g.step, g.value))} aria-label={`Undo ${fmtAmount(g.step, g.unit)}`} className="text-ink-3">
                    <RotateCcw className="size-3.5" strokeWidth={1.5} />Undo
                  </Button>
                ) : null}
              </div>
              {ml ? (
                <div role="radiogroup" aria-label={`${g.name} daily target`} className="inline-flex rounded-full bg-ink/[0.05] p-0.5 dark:bg-white/[0.06]">
                  {WATER_TARGETS.map((t) => (
                    <button
                      key={t} type="button" role="radio" aria-checked={g.target === t} onClick={() => g.target !== t && retarget(g, t)}
                      className="h-7 rounded-full px-2.5 text-[12px] font-medium text-ink-3 tabular-nums transition-[background-color,color] duration-150 hover:text-ink aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-1 focus-visible:outline-2 focus-visible:outline-pill"
                    >
                      {t / 1000}L
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** 2500 ml → "2.5 L", 1250 ml → "1.25 L", 250 ml → "250 ml". */
function fmtAmount(v: number, unit: string) {
  if (unit.toLowerCase() === 'ml' && Math.abs(v) >= 1000) return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v / 1000)} L`
  return `${fmt(v)} ${unit}`.trim()
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(n)
}


/**
 * A quantity routine inside Today's plan ("All day"): what is left, the big number (it opens the metric's Peek), one
 * segment per glass and a stepper. Steps are the routine's own step and twice it; Undo is in the toast.
 */
function QuantityRow({ g, done, left, glasses, add }: { g: GoalRow; done: boolean; left: number; glasses: number; add: (g: GoalRow, amount: number) => void }) {
  const number = (
    <>
      <span className="num block text-heading">{fmtAmount(g.value, g.unit)}</span>
      <span className="block text-caption font-normal text-ink-3">of {fmtAmount(g.target, g.unit)}</span>
    </>
  )
  return (
    <li className="rounded-lg p-3" style={{ background: `color-mix(in oklch, ${g.color} 7%, transparent)` }}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in oklch, ${g.color} 16%, transparent)` }}>
          <RoutineArt name={g.name} kind="routine" area={g.area ?? 'health'} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">{g.name}</p>
          <p className={cn('text-small tabular-nums', done ? 'font-medium text-good' : 'text-ink-3')}>
            {g.value === 0 ? 'Tap a glass as you drink' : done ? `Goal reached · ${fmtAmount(g.value, g.unit)}` : `${fmtAmount(left, g.unit)} to go`}
            {!done && g.next ? ` · next reminder ${g.next}` : ''}
          </p>
        </div>
        {g.slug ? (
          <PeekLink to={{ type: 'metric', id: g.slug }} aria-label={`${g.name}: ${fmtAmount(g.value, g.unit)} of ${fmtAmount(g.target, g.unit)}, open details`}
            className="-m-1 shrink-0 rounded-md p-1 text-end text-ink tabular-nums hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill dark:hover:bg-white/[0.05]">{number}</PeekLink>
        ) : <p className="shrink-0 text-end text-ink tabular-nums">{number}</p>}
      </div>
      {glasses <= 24 ? (
        <div className="mt-3 flex gap-1" role="img" aria-label={`${fmt(g.value)} of ${fmt(g.target)} ${g.unit}`}>
          {Array.from({ length: glasses }, (_, i) => {
            const fill = Math.min(1, Math.max(0, (g.value - i * g.step) / g.step))
            return (
              <span key={i} className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/[0.08]">
                <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out-quint" style={{ width: `${fill * 100}%`, background: done ? 'var(--good)' : g.color }} />
              </span>
            )
          })}
        </div>
      ) : <Capsule value={g.value} max={g.target} color={done ? 'var(--good)' : g.color} label={`${g.name} progress`} className="mt-3" />}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div role="group" aria-label={`Log ${g.name}`} className="inline-flex items-center rounded-full bg-surface p-0.5 shadow-1">
          <Button size="icon-sm" variant="ghost" className="rounded-full text-ink-3" disabled={g.value <= 0} onClick={() => add(g, -Math.min(g.step, g.value))} aria-label={`Remove ${fmtAmount(g.step, g.unit)}`}>
            <Minus className="size-3.5" strokeWidth={2} />
          </Button>
          {[g.step, g.step * 2].map((amount) => (
            <Button key={amount} size="sm" variant="ghost" className="rounded-full px-3 tabular-nums" onClick={() => add(g, amount)}>+{fmtAmount(amount, g.unit)}</Button>
          ))}
        </div>
        <span className="text-caption text-ink-3 max-sm:hidden">All day</span>
      </div>
    </li>
  )
}
