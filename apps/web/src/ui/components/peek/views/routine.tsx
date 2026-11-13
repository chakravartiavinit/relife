'use client'

import { useState, useTransition } from 'react'
import { Check, Pause, Pencil, Play, Plus, SkipForward, Undo2 } from 'lucide-react'
import { addToGoal, setScheduleActive, toggleCheck } from '@/app/actions'
import type { RoutinePeek } from '@/core/peek/types'
import { amountText } from '@/domain/capture'
import { CATEGORY } from '@/ui/tokens'
import { routineIcon } from '@/ui/routine-icons'
import { Badge } from '../../card'
import { Button } from '../../button'
import { Capsule } from '../../capsule'
import { AdherenceLegend, AdherenceStrip } from '../../category/adherence-strip'
import { ScheduleDialog } from '../../forms/schedule-form'
import { announceXp, useToast } from '../../toast'
import { usePeekChanged } from '../peek-context'
import { PeekIcon, PeekNote, PeekRow, PeekSection, PeekStats } from '../peek-parts'

const KIND = { routine: 'Routine', medicine: 'Medicine', subscription: 'Subscription', bill: 'Bill', renewal: 'Renewal' } as const
const STATUS = { done: 'Done', skipped: 'Skipped', missed: 'Missed', pending: 'Due' } as const

export function routineHeading(d: RoutinePeek) {
  return { title: d.name, description: `${CATEGORY[d.category].label} · ${KIND[d.kind].toLowerCase()} · ${d.when}`, icon: <PeekIcon icon={routineIcon(d.name, d.kind, d.category)} color={CATEGORY[d.category].color} /> }
}

/** A routine or medicine: today's check-off, the last 14 days, and edit / pause. */
export function RoutinePeekView({ data: r }: { data: RoutinePeek }) {
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const toast = useToast()
  const changed = usePeekChanged()
  const color = CATEGORY[r.category].color
  const run = (fn: () => Promise<void>) => start(async () => { try { await fn(); changed() } catch { toast.error() } })
  const check = (iso: string, status: 'done' | 'skipped' | null) => run(async () => {
    announceXp(toast, await toggleCheck(r.id, iso, status))
    if (status) toast(`${r.name} ${status === 'done' ? 'done' : 'skipped'}`, status === 'done' ? 'good' : 'neutral')
  })
  const quantity = r.trackerSlug && r.target ? { value: r.value ?? 0, target: r.target, step: r.step ?? Math.max(1, Math.round(r.target / 8)) } : null
  const rate = r.rate == null ? '–' : `${Math.round(r.rate * 100)}%`
  return (
    <div>
      {!r.active ? <Badge>Paused</Badge> : null}
      {r.refillSoon ? <Badge color="var(--warn)" className="ml-1.5">Refill soon</Badge> : null}

      <PeekSection label="Today" className="mt-2" aside={r.active ? undefined : 'Paused: nothing is due'}>
        {quantity ? (
          <div className="rounded-md bg-surface-2 p-4">
            <p className="num text-title text-ink tabular-nums">{amountText(quantity.value, r.unit ?? '')} <span className="text-heading font-semibold text-ink-3">of {amountText(quantity.target, r.unit ?? '')}</span></p>
            <Capsule className="mt-3" value={quantity.value} max={quantity.target} color={color} label={`${r.name} today`} />
            <div className="mt-3 flex gap-2">
              <Button disabled={pending} onClick={() => run(async () => { announceXp(toast, await addToGoal(r.id, quantity.step)) })}><Plus className="size-4" strokeWidth={2} aria-hidden />{amountText(quantity.step, r.unit ?? '')}</Button>
              {quantity.value > 0 ? <Button variant="ghost" disabled={pending} onClick={() => run(async () => { await addToGoal(r.id, -quantity.step) })}>Undo {amountText(quantity.step, r.unit ?? '')}</Button> : null}
            </div>
          </div>
        ) : r.occurrences.length ? (
          <ul className="flex flex-col gap-2">
            {r.occurrences.map((o) => (
              <li key={o.iso} className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5">
                <span className="w-12 shrink-0 text-small text-ink-2 tabular-nums">{o.time}</span>
                <span className={`flex-1 text-small ${o.status === 'missed' ? 'text-bad' : o.status === 'done' ? 'text-good' : 'text-ink-3'}`}>{STATUS[o.status]}</span>
                {o.status === 'done' || o.status === 'skipped' ? (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => check(o.iso, null)}><Undo2 className="size-3.5" strokeWidth={1.5} aria-hidden />Undo</Button>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => check(o.iso, 'skipped')}><SkipForward className="size-3.5" strokeWidth={1.5} aria-hidden />Skip</Button>
                    <Button size="sm" variant="primary" disabled={pending} onClick={() => check(o.iso, 'done')}><Check className="size-3.5" strokeWidth={2} aria-hidden />Done</Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-3">{r.active ? 'Not due today.' : 'Resume it to see what is due.'}</p>
        )}
      </PeekSection>

      {r.kind === 'routine' || r.kind === 'medicine' ? (
        <PeekSection label="Last 14 days" aside={r.days.length ? undefined : 'No history yet'}>
          {r.days.length ? <AdherenceStrip days={r.days} color={color} name={r.name} /> : null}
          <div className="mt-3"><PeekStats items={[{ label: 'Streak', value: `${r.streak}d` }, { label: 'Done, 60 days', value: rate }]} /></div>
          <div className="mt-3"><AdherenceLegend /></div>
        </PeekSection>
      ) : null}

      {r.dose || r.stock != null || r.notes ? (
        <PeekSection label="Details">
          {r.dose ? <PeekRow label="Dose">{r.dose}</PeekRow> : null}
          {r.stock != null ? <PeekRow label="Stock"><span className={r.refillSoon ? 'text-warn' : undefined}>{r.stock} left</span></PeekRow> : null}
          {r.notes ? <PeekRow label="Note">{r.notes}</PeekRow> : null}
        </PeekSection>
      ) : null}

      {r.refillSoon ? <PeekNote tone="warn" label="Refill">Stock is low. Refill soon so doses are not missed.</PeekNote> : null}

      {r.initial ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => setEditing(true)}><Pencil className="size-4" strokeWidth={1.5} aria-hidden />Edit</Button>
          <Button variant="ghost" disabled={pending} onClick={() => run(async () => { await setScheduleActive(r.id, !r.active); toast(r.active ? `${r.name} paused` : `${r.name} resumed`, r.active ? 'neutral' : 'good') })}>
            {r.active ? <Pause className="size-4" strokeWidth={1.5} aria-hidden /> : <Play className="size-4" strokeWidth={1.5} aria-hidden />}{r.active ? 'Pause' : 'Resume'}
          </Button>
          <ScheduleDialog open={editing} initial={r.initial} onClose={() => { setEditing(false); changed() }} />
        </div>
      ) : null}
    </div>
  )
}
