'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useOptimistic, useState, useTransition } from 'react'
import { Check, ChevronDown, Minus, Moon, RotateCcw, SkipForward, Sun, Sunrise, type LucideIcon } from 'lucide-react'
import { RoutineArt } from './routine-art'
import { Picture } from './picture'
import { addToGoal, setGoalTarget, toggleCheck, undoGoalStep, undoQuickLog } from '@/app/actions'
import { cn } from '../cn'
import { Button } from './button'
import { Capsule } from './capsule'
import { Fold } from './fold'
import { announceXp, useToast } from './toast'
import { EASE_OUT, EASE_OUT_STRONG } from '@/ui/beui/lib/ease'
import { nextUp, planPeriods, timeUntil, type Period, type PeriodGroup } from '@/domain/day-plan'
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
export function Agenda({ rows, timeline, phoneOpen }: { rows: AgendaRow[]; /** On a phone only this many open rows show; the rest open with "N more today". From 640px every row shows. */ phoneOpen?: number; /** Today's layout: the Up next block (with `lead` beside it, the all-day panel), then Morning, Afternoon, Evening as compact rows with a Now line at this `HH:MM`, done rows folded. */ timeline?: { now: string; lead?: React.ReactNode } }) {
  const [optimistic, setOptimistic] = useOptimistic(
    rows,
    (state, { key, status }: { key: string; status: AgendaRow['status'] }) => state.map((r) => (r.key === key ? { ...r, status } : r)),
  )
  const [, start] = useTransition()
  const [more, setMore] = useState(false)
  const toast = useToast()

  // Every check-off toasts what happened with Undo (the same words Capture uses); Undo is `toggleCheck(…, null)`.
  const act = (r: AgendaRow, status: 'done' | 'skipped' | null) =>
    start(async () => {
      setOptimistic({ key: r.key, status: status ?? 'pending' })
      try {
        announceXp(toast, await toggleCheck(r.scheduleId, r.occurrence, status))
        if (status) {
          toast(`${r.name} ${status === 'done' ? 'done' : 'skipped'}`, 'good', {
            description: status === 'done' && r.xp ? `+${r.xp} XP` : undefined, picture: { of: 'routine', name: r.name, kind: r.kind, area: r.area },
            action: { label: 'Undo', onClick: () => act(r, null) },
          })
        }
      } catch {
        toast.error()
      }
    })

  if (timeline) return <Timeline rows={optimistic} now={timeline.now} lead={timeline.lead} act={act} />

  const overdue = optimistic.filter((r) => r.status === 'missed')
  const upcoming = optimistic.filter((r) => r.status === 'pending')
  const closed = optimistic.filter((r) => r.status === 'done' || r.status === 'skipped')
  const groups = [
    ...(overdue.length ? [{ key: 'overdue', label: 'Overdue', rows: overdue, alert: true }] : []),
    ...PERIODS.map((p) => ({ key: p.key, label: p.label, rows: upcoming.filter((r) => periodOf(r.time) === p.key), alert: false })),
  ].filter((g) => g.rows.length)
  // A phone shows the first `phoneOpen` open rows; the later ones (and any group left with none) wait behind the button.
  const open = groups.flatMap((g) => g.rows)
  const laterCount = phoneOpen == null ? 0 : Math.max(0, open.length - phoneOpen)
  const keep = new Set((more || phoneOpen == null ? open : open.slice(0, phoneOpen)).map((r) => r.key))
  const hideLater = (shown: boolean) => (shown ? undefined : 'hidden grid-md:block')

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} className={hideLater(g.rows.some((r) => keep.has(r.key)))}>
          <h3 className={cn('mb-1 flex items-center gap-2 px-1 text-small font-medium', g.alert ? 'text-bad' : 'text-ink-3')}>
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
                  className={keep.has(r.key) ? undefined : 'hidden grid-md:list-item'}
                >
                  <Row r={r} onToggle={() => act(r, 'done')} onSkip={() => act(r, 'skipped')} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}

      {phoneOpen != null && laterCount > 0 ? (
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((x) => !x)}
          className="-mt-2 flex h-11 items-center gap-2 rounded-md px-1 text-small font-medium text-ink-3 transition-colors duration-150 ease-out-quint hover-fine:text-ink-2 focus-visible:outline-2 focus-visible:outline-pill grid-md:hidden"
        >
          {more ? 'Show fewer' : `${laterCount} more today`}
          <ChevronDown aria-hidden strokeWidth={1.5} className={cn('size-3.5 transition-transform duration-150 ease-out-quint motion-reduce:transition-none', more && 'rotate-180')} />
        </button>
      ) : null}

      {groups.length === 0 && rows.length > 0 ? (
        <p className="rise flex items-center gap-2 px-1 text-small text-ink-2">
          <Check className="size-4 text-good" strokeWidth={2} aria-hidden />
          Everything for today is checked off.
        </p>
      ) : null}

      {closed.length ? (
        <details className="group" open={groups.length === 0}>
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md px-1 text-small font-medium text-ink-3 select-none hover:text-ink-2 [&::-webkit-details-marker]:hidden">
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
 * Today's plan as a day: the Up next block (the next routine, time until it, Check off and Skip) beside the all-day
 * panel, then Morning, Afternoon, Evening as compact rows with overdue ones first, a Now line where the clock is, and
 * everything already done folded into one line ("6 done ●●●●●● names") that opens in place. On a phone every period
 * after the first one with something to do folds, so the plan opens on what is next.
 */
function Timeline({ rows, now, lead, act }: { rows: AgendaRow[]; now: string; lead?: React.ReactNode; act: (r: AgendaRow, status: 'done' | 'skipped' | null) => void }) {
  const next = nextUp(rows, now)
  const all = planPeriods(rows, now)
  // The next row is drawn in the Up next block, so the rows below leave it out; the counts still include it.
  const rest = planPeriods(rows.filter((r) => r !== next), now)
  const first = all.findIndex((p) => p.open.length)
  return (
    <div className="flex flex-col gap-5">
      {next || lead ? (
        <div className="grid gap-3 grid-md:grid-cols-[minmax(0,1fr)_16.25rem] grid-lg:grid-cols-[minmax(0,1fr)_18.75rem]">
          {next ? <UpNext key={next.key} r={next} now={now} act={act} /> : null}
          {lead ? <div className={cn('min-w-0', !next && 'grid-md:col-span-2')}>{lead}</div> : null}
        </div>
      ) : null}
      {rest.map((p) => {
        const i = all.findIndex((a) => a.key === p.key)
        return <PeriodSection key={p.key} p={{ ...p, summary: all[i].summary }} now={now} act={act} foldable={first !== -1 && i > first} />
      })}
    </div>
  )
}

/** The next routine, large: when, what, and the two things you do with it. */
function UpNext({ r, now, act }: { r: AgendaRow; now: string; act: (r: AgendaRow, status: 'done' | 'skipped' | null) => void }) {
  const facts = [...(r.chips?.map((c) => c.text) ?? []), ...(r.detail ? [r.detail] : [])].join(' · ')
  return (
    <div className="flex flex-col rounded-lg bg-surface-2 p-4">
      <p className="mb-3 flex items-center gap-2 text-small font-medium text-ink-2">
        Up next<span className="font-normal text-ink-3 tabular-nums">· {timeUntil(now, r.time)}</span>
      </p>
      <div className="flex items-center gap-4">
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-lg bg-surface">
          <RoutineArt name={r.name} kind={r.kind} area={r.area} className="size-11" />
        </span>
        <div className="min-w-0">
          <p className={cn('text-small font-medium tabular-nums', r.status === 'missed' ? 'text-bad' : 'text-ink-2')}>{r.time}{r.status === 'missed' ? ' · overdue' : ''}</p>
          <PeekLink to={{ type: 'routine', id: r.scheduleId }} className="line-clamp-2 rounded-xs font-display text-title text-ink hover-fine:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">{r.name}</PeekLink>
          {facts ? <p className="truncate text-small text-ink-3 tabular-nums">{facts}</p> : null}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 pt-4">
        <Button variant="primary" onClick={() => act(r, 'done')} aria-label={`Check off ${r.name}`} className="h-11 flex-1 grid-md:h-9 grid-md:flex-none">Check off</Button>
        <Button variant="quiet" onClick={() => act(r, 'skipped')} aria-label={`Skip ${r.name}`} className="h-11 grid-md:h-9">Skip</Button>
      </div>
    </div>
  )
}

function PeriodSection({ p, now, act, foldable }: { p: PeriodGroup<AgendaRow>; now: string; act: (r: AgendaRow, status: 'done' | 'skipped' | null) => void; foldable: boolean }) {
  const Icon = PERIOD_ICON[p.key]
  const head = (
    <>
      <Icon aria-hidden className="size-3.5" strokeWidth={1.5} />
      {p.label}
      <span className="font-normal text-ink-3">{p.summary}</span>
    </>
  )
  const body = (
    <>
      <ul className="flex flex-col">
        <AnimatePresence initial={false}>
          {p.open.flatMap((r, i) => [
            ...(p.nowAt === i ? [<NowLine key="now" now={now} />] : []),
            <motion.li key={r.key} layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
              <Row r={r} compact onToggle={() => act(r, 'done')} onSkip={() => act(r, 'skipped')} />
            </motion.li>,
          ])}
          {p.nowAt === p.open.length ? <NowLine key="now" now={now} /> : null}
        </AnimatePresence>
      </ul>
      {p.closed.length ? <DoneLine rows={p.closed} act={act} /> : null}
    </>
  )
  if (foldable) {
    const from = p.open[0]?.time
    // A fold on a phone (one line: the period, what is left, when it starts); plain content with its heading from 640px.
    return (
      <section aria-label={p.label}>
        <Fold inline title={<span className="flex items-center gap-2 text-small font-medium text-ink-2">{head}{from ? <span className="font-normal text-ink-3">· from {from}</span> : null}</span>}>
          <h3 className="mb-1 hidden items-center gap-2 px-1 text-small font-medium text-ink-2 grid-md:flex">{head}</h3>
          {body}
        </Fold>
      </section>
    )
  }
  return (
    <section aria-label={p.label}>
      <h3 className="mb-1 flex items-center gap-2 px-1 text-small font-medium text-ink-2">{head}</h3>
      {body}
    </section>
  )
}

/** The current time, drawn between the rows that are before it and after it. */
function NowLine({ now }: { now: string }) {
  return (
    <li aria-label={`Now, ${now}`} className="flex items-center gap-2 px-1 py-1.5 text-caption font-medium text-pill-ink tabular-nums">
      <span aria-hidden className="size-1.5 rounded-full bg-pill" />
      {now}
      <span aria-hidden className="h-px flex-1 bg-pill/40" />
    </li>
  )
}

/** "3 done  Gym, Vitamin D3, Omega-3": one line per period (a fold); opens to the done rows, each with Undo. */
function DoneLine({ rows, act }: { rows: AgendaRow[]; act: (r: AgendaRow, status: 'done' | 'skipped' | null) => void }) {
  return (
    <Fold title={`${rows.length} done`} summary={rows.map((r) => r.name).join(', ')} className="mt-1">
      <ul className="flex flex-col pb-1">{rows.map((r) => <li key={r.key}><DoneRow r={r} onUndo={() => act(r, null)} /></li>)}</ul>
    </Fold>
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
      // The time keeps two routines with one name (Omega-3 at 09:00 and 21:00) apart for screen readers.
      aria-label={`${done || skipped ? 'Undo' : 'Mark'} ${r.name}${/^\d/.test(r.time) ? ` at ${r.time}` : ''}${done || skipped ? '' : ' done'}`}
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
function Row({ r, onToggle, onSkip, compact = false }: { r: AgendaRow; onToggle: () => void; onSkip: () => void; /** Today's compact row: no tint, a smaller picture, a hairline above; Skip shows on hover (always on touch). */ compact?: boolean }) {
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
      className={cn(
        'group/row @container relative flex items-center transition-[background-color] duration-150',
        compact
          ? 'group min-h-14 gap-3 border-t border-divider px-1 py-1 hover-fine:bg-ink/[0.025] dark:hover-fine:bg-white/[0.035]'
          : 'min-h-[64px] gap-3.5 rounded-md bg-ink/[0.025] px-3 py-2 hover:bg-ink/[0.045] dark:bg-white/[0.035] dark:hover:bg-white/[0.06]',
      )}
    >
      {/* Overdue is the time in --bad-ink plus the word Overdue under the name, never colour alone. */}
      <span className={cn('w-11 shrink-0 tabular-nums', compact ? 'text-small' : 'text-small font-medium', missed ? 'font-medium text-bad-ink' : compact ? 'text-ink-3' : 'text-ink-2')}>{r.time}</span>
      <motion.span
        aria-hidden
        animate={won ? { scale: [1, 1.12, 1], rotate: [0, -8, 0] } : undefined}
        transition={{ duration: 0.4, ease: EASE_OUT_STRONG }}
        className={cn('grid shrink-0 place-items-center', !compact && 'size-10 rounded-md bg-surface-2')}
      >
        {compact ? <Picture of="routine" name={r.name} kind={r.kind} area={r.area} size={32} /> : <RoutineArt name={r.name} kind={r.kind} area={r.area} />}
      </motion.span>
      <div className="min-w-0 flex-1">
        <PeekLink to={{ type: 'routine', id: r.scheduleId }} className={cn('block truncate rounded-xs text-body font-medium transition-[color] duration-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill', won ? 'text-ink-3' : 'text-ink')}>{r.name}</PeekLink>
        {r.chips?.length || r.detail || missed ? (
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-small text-ink-3 tabular-nums">
            {missed ? <span className="shrink-0 font-medium text-bad-ink">Overdue</span> : null}
            {r.chips?.map((c) => (
              <span key={c.text} className={cn('min-w-0 truncate', c.warn && 'font-medium text-warn-ink')}>{missed || r.chips?.[0] !== c ? '· ' : ''}{c.text}</span>
            ))}
            {r.detail ? <span className="min-w-0 truncate">{missed || r.chips?.length ? '· ' : ''}{r.detail}</span> : null}
          </p>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" onClick={onSkip} aria-label={`Skip ${r.name}`}
        className={cn('text-ink-3', compact ? 'max-sm:hidden [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover-fine:opacity-100 group-focus-within:opacity-100' : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 max-lg:hidden @max-md:hidden')}>Skip</Button>
      <span className="relative grid place-items-center">
        {won ? <CheckBurst color={r.color} /> : null}
        <CheckButton r={r} onToggle={complete} size="lg" forceDone={won} />
        <AnimatePresence>
          {won && r.xp ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -top-1 text-caption font-medium tabular-nums"
              style={{ color: 'color-mix(in oklch, var(--medal-gold) 80%, var(--ink))' }}
              initial={{ y: 0, opacity: 1 }} animate={{ y: -22, opacity: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT_STRONG }}
            >
              +{r.xp}
            </motion.span>
          ) : null}
        </AnimatePresence>
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
      <Picture of="routine" name={r.name} kind={r.kind} area={r.area} size={20} className="opacity-70 grayscale-[0.5]" />
      <span className="min-w-0 flex-1 truncate text-body text-ink-3 line-through decoration-ink-3/40">{r.name}</span>
      {skipped ? <span className="text-caption text-ink-3">Skipped</span> : null}
      {/* Hover hint only: the check button beside it is the one control (and the one name) for Undo. */}
      <RotateCcw aria-hidden className="size-3.5 text-ink-3 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100" strokeWidth={1.5} />
      <span className="w-12 shrink-0 text-end text-caption text-ink-3 tabular-nums">{r.time}</span>
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
        description: `${fmtAmount(g.value + amount, g.unit)} of ${fmtAmount(g.target, g.unit)} today`, picture: { of: 'routine', name: g.name, kind: 'routine', area: g.area ?? 'health' },
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
    try { await setGoalTarget(g.scheduleId, target); toast(`${g.name} target saved`, 'good', { description: `${fmtAmount(target, g.unit)} a day`, picture: { of: 'routine', name: g.name, kind: 'routine', area: g.area ?? 'health' } }) } catch { toast.error() }
  })

  return (
    <ul className={cn('flex flex-col gap-3', compact && 'h-full')}>
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
                <p className="text-heading font-medium text-ink">{g.name}</p>
                <p className={cn('mt-0.5 text-caption tabular-nums', done ? 'font-medium text-good' : 'text-ink-3')}>
                  {done ? `Goal reached · ${fmtAmount(g.value, g.unit)}` : `${fmtAmount(left, g.unit)} to go`}
                  {!done && g.next ? ` · next reminder ${g.next}` : ''}
                </p>
              </div>
              <p className="shrink-0 text-right tabular-nums">
                <span className="text-title leading-none font-medium text-ink">{fmtAmount(g.value, g.unit)}</span>
                <span className="block text-caption text-ink-3">of {fmtAmount(g.target, g.unit)}</span>
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
                      className="relative h-7 rounded-full px-2.5 text-caption font-medium text-ink-3 tabular-nums transition-[background-color,color] duration-150 after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] hover-fine:text-ink aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-1 focus-visible:outline-2 focus-visible:outline-pill"
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
    <li className="flex flex-1 flex-col rounded-lg bg-surface-2 p-4">
      <p className="mb-3 text-small font-medium text-ink-2">All day</p>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-md bg-surface">
          <RoutineArt name={g.name} kind="routine" area={g.area ?? 'health'} className="size-8" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-heading text-ink">{g.name}</p>
          <p className={cn('text-small tabular-nums', done ? 'font-medium text-good' : 'text-ink-3')}>
            {g.value === 0 ? 'Tap a glass as you drink' : done ? `Goal reached · ${fmtAmount(g.value, g.unit)}` : `${fmtAmount(left, g.unit)} to go`}
            {!done && g.next ? ` · next reminder ${g.next}` : ''}
          </p>
        </div>
        {g.slug ? (
          <PeekLink to={{ type: 'metric', id: g.slug }} aria-label={`${g.name}: ${fmtAmount(g.value, g.unit)} of ${fmtAmount(g.target, g.unit)}, open details`}
            className="-m-1 shrink-0 rounded-md p-1 text-end text-ink tabular-nums hover-fine:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill dark:hover-fine:bg-white/[0.05]">{number}</PeekLink>
        ) : <p className="shrink-0 text-end text-ink tabular-nums">{number}</p>}
      </div>
      {glasses <= 24 ? (
        <div className="mt-4 flex gap-0.5" role="img" aria-label={`${fmt(g.value)} of ${fmt(g.target)} ${g.unit}`}>
          {Array.from({ length: glasses }, (_, i) => {
            const fill = Math.min(1, Math.max(0, (g.value - i * g.step) / g.step))
            return (
              <span key={i} className="relative h-2 flex-1 overflow-hidden rounded-xs bg-ink/[0.08] dark:bg-white/[0.1]">
                <span className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out-quint" style={{ width: `${fill * 100}%`, background: done ? 'var(--good)' : g.color }} />
              </span>
            )
          })}
        </div>
      ) : <Capsule value={g.value} max={g.target} color={done ? 'var(--good)' : g.color} label={`${g.name} progress`} className="mt-4" />}
      <div role="group" aria-label={`Log ${g.name}`} className="mt-auto flex items-center gap-2 pt-4">
        <Button size="sm" variant="secondary" className="h-11 flex-1 grid-md:h-8" disabled={g.value <= 0} onClick={() => add(g, -Math.min(g.step, g.value))} aria-label={`Remove ${fmtAmount(g.step, g.unit)}`}>
          <Minus className="size-3.5" strokeWidth={2} />
        </Button>
        {[g.step, g.step * 2].map((amount) => (
          <Button key={amount} size="sm" variant="secondary" className="h-11 flex-[2] tabular-nums grid-md:h-8" onClick={() => add(g, amount)}>+{fmtAmount(amount, g.unit)}</Button>
        ))}
      </div>
    </li>
  )
}
