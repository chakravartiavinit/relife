'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useOptimistic, useTransition } from 'react'
import { Check, CreditCard, Pill, Repeat, RotateCcw, SkipForward } from 'lucide-react'
import { addToGoal, toggleCheck } from '@/app/actions'
import { cn } from '../cn'
import { Button } from './button'
import { Capsule } from './capsule'
import { announceXp, useToast } from './toast'

export type AgendaRow = {
  key: string
  scheduleId: string
  occurrence: string // ISO
  time: string
  name: string
  kind: 'routine' | 'medicine' | 'subscription' | 'bill' | 'renewal'
  color: string
  detail?: string
  status: 'done' | 'skipped' | 'pending' | 'missed'
}

const KIND_ICON = { routine: Repeat, medicine: Pill, subscription: CreditCard, bill: CreditCard, renewal: CreditCard }

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

  const open = optimistic.filter((r) => r.status === 'pending' || r.status === 'missed')
  const closed = optimistic.filter((r) => r.status === 'done' || r.status === 'skipped')

  return (
    <div>
      <ul className="flex flex-col">
        <AnimatePresence initial={false}>
          {open.map((r) => (
            <motion.li
              key={r.key}
              layout="position"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            >
              <Row r={r} onToggle={() => act(r, 'done')} onSkip={() => act(r, 'skipped')} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {open.length === 0 && rows.length > 0 ? (
        <p className="px-1 py-3 text-[13px] text-ink-3">Everything for today is checked off.</p>
      ) : null}
      {closed.length ? (
        <details className="group mt-3" open={open.length === 0}>
          <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-sm px-1 text-[13px] font-medium text-ink-3 select-none hover:text-ink-2 [&::-webkit-details-marker]:hidden">
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 transition-transform duration-150 group-open:rotate-90">
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Done · {closed.length}
          </summary>
          <ul className="flex flex-col">
            {closed.map((r) => (
              <li key={r.key}><Row r={r} onToggle={() => act(r, null)} /></li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function Row({ r, onToggle, onSkip }: { r: AgendaRow; onToggle: () => void; onSkip?: () => void }) {
  const done = r.status === 'done'
  const skipped = r.status === 'skipped'
  const Icon = KIND_ICON[r.kind]
  return (
    <div className="group/row -mx-2 flex min-h-14 items-center gap-3 rounded-md px-2 transition-colors duration-150 hover:bg-surface-2">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `Mark ${r.name} not done` : `Mark ${r.name} done`}
        className="relative grid size-7 shrink-0 place-items-center rounded-full transition-[scale] duration-150 ease-out-quint active:scale-96 after:absolute after:inset-[-8px] after:content-['']"
      >
        {/* Both states stay mounted; cross-fade with scale + blur. */}
        <span
          className={cn('absolute inset-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--ink-3)] transition-[opacity,scale,filter] duration-200 ease-out-quint', done || skipped ? 'scale-25 opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0')}
          style={r.status === 'missed' ? { boxShadow: `inset 0 0 0 1.5px var(--bad)` } : undefined}
        />
        <span
          className={cn('absolute inset-0 grid place-items-center rounded-full text-white transition-[opacity,scale,filter] duration-200 ease-out-quint', done ? 'scale-100 opacity-100 blur-0' : 'scale-25 opacity-0 blur-[4px]')}
          style={{ background: r.color }}
        >
          <Check className="size-4" strokeWidth={2.5} />
        </span>
        <span
          className={cn('absolute inset-0 grid place-items-center rounded-full bg-surface-3 text-ink-3 transition-[opacity,scale,filter] duration-200 ease-out-quint', skipped ? 'scale-100 opacity-100 blur-0' : 'scale-25 opacity-0 blur-[4px]')}
        >
          <SkipForward className="size-3.5" strokeWidth={2} />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[15px] transition-colors duration-150', done || skipped ? 'text-ink-3 line-through decoration-ink-3/40' : 'text-ink')}>
          {r.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-3">
          <Icon className="size-3.5" strokeWidth={1.5} style={{ color: r.color }} />
          <span className="tabular-nums">{r.time}</span>
          {r.detail ? <><span aria-hidden>·</span><span className="truncate">{r.detail}</span></> : null}
          {r.status === 'missed' ? <><span aria-hidden>·</span><span className="text-bad">Overdue</span></> : null}
          {skipped ? <><span aria-hidden>·</span><span>Skipped</span></> : null}
        </div>
      </div>
      {onSkip ? (
        <Button variant="ghost" size="sm" onClick={onSkip} className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 max-lg:opacity-100">
          Skip
        </Button>
      ) : done || skipped ? (
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={`Undo ${r.name}`} className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100">
          <RotateCcw className="size-4" strokeWidth={1.5} />
        </Button>
      ) : null}
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
