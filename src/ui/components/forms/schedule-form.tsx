'use client'

import { Switch } from '@/ui/beui/motion/switch'
import { useActionState, useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Repeat, X } from 'lucide-react'
import { saveSchedule } from '@/app/actions'
import { CATEGORIES } from '@/db/schema'
import { CATEGORY } from '@/ui/tokens'
import { Button } from '../button'
import { Field, Input, Select, Textarea } from '../form'
import { useToast } from '../toast'
import { Dialog, FormError } from './dialog'

export type ScheduleInitial = {
  id?: string
  name: string
  kind: 'routine' | 'medicine'
  category: (typeof CATEGORIES)[number]
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  times: string[]
  byweekday: string[]
  bymonthday?: number
  bymonth?: number
  start: string
  until?: string
  remindOffsetMin: number
  target?: number
  unit?: string
  step?: number
  dose?: string
  stock?: number
  notes?: string
}

const DAYS = [['MO', 'Mon'], ['TU', 'Tue'], ['WE', 'Wed'], ['TH', 'Thu'], ['FR', 'Fri'], ['SA', 'Sat'], ['SU', 'Sun']] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const REMIND = [[0, 'At the time'], [10, '10 min before'], [30, '30 min before'], [60, '1 hour before'], [1440, '1 day before']] as const

export function blankSchedule(today: string): ScheduleInitial {
  return {
    name: '', kind: 'routine', category: 'health', freq: 'daily', interval: 1, times: ['09:00'], byweekday: [],
    start: today, remindOffsetMin: 0,
  }
}

/** Create / edit dialog. Opens itself when `open`; calls onClose after save or cancel. */
export function ScheduleDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: ScheduleInitial }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial.id ? `Edit ${initial.name}` : 'New routine'} icon={Repeat} color='var(--pill)'
      description="Reminders arrive on Telegram at these times."
    >
      {/* Remount on open so the form starts from `initial` each time. */}
      {open ? <ScheduleForm initial={initial} onDone={onClose} /> : null}
    </Dialog>
  )
}

function ScheduleForm({ initial, onDone }: { initial: ScheduleInitial; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveSchedule, null)
  const [kind, setKind] = useState(initial.kind)
  const [freq, setFreq] = useState(initial.freq)
  const [times, setTimes] = useState(initial.times.length ? initial.times : ['09:00'])
  const [draft, setDraft] = useState('')
  const [goal, setGoal] = useState(!!initial.target)
  const toast = useToast()
  const id = useId()

  useEffect(() => {
    if (state?.ok) {
      toast(initial.id ? 'Saved' : 'Routine added', 'good')
      onDone()
    }
  }, [state, initial.id, onDone, toast])

  const addTime = () => {
    if (!/^\d{2}:\d{2}$/.test(draft) || times.includes(draft)) return
    setTimes([...times, draft].sort())
    setDraft('')
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="times" value={times.join(',')} />

      <div role="radiogroup" aria-label="Type" className="inline-flex self-start rounded-md bg-surface-2 p-1">
        {(['routine', 'medicine'] as const).map((k) => (
          <label key={k} className="relative">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="peer sr-only" />
            <span className="flex h-8 cursor-pointer items-center rounded-sm px-3.5 text-[13px] font-medium text-ink-2 capitalize transition-[background-color,color,box-shadow] duration-150 peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-1 peer-focus-visible:shadow-[0_0_0_2px_var(--pill)]">
              {k}
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <Field label="Name" htmlFor={`${id}-name`}>
          <Input id={`${id}-name`} name="name" required maxLength={80} defaultValue={initial.name} autoFocus
            placeholder={kind === 'medicine' ? 'Vitamin D3' : 'Morning skincare'} />
        </Field>
        <Field label="Category" htmlFor={`${id}-cat`}>
          <Select id={`${id}-cat`} name="category" defaultValue={initial.category}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c].label}</option>)}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-[13px] font-medium text-ink-2">Repeats</legend>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Select aria-label="Frequency" name="freq" value={freq} onChange={(e) => setFreq(e.target.value as ScheduleInitial['freq'])}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
          <label className="flex items-center gap-2 text-[13px] text-ink-3">
            Every
            <Input aria-label="Interval" type="number" name="interval" min={1} max={365} defaultValue={initial.interval} className="w-16" />
          </label>
        </div>

        {freq === 'weekly' ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
            {DAYS.map(([v, l]) => (
              <label key={v} className="relative">
                <input type="checkbox" name="byweekday" value={v} defaultChecked={initial.byweekday.includes(v)} className="peer sr-only" />
                <span className="flex h-9 w-12 cursor-pointer items-center justify-center rounded-md bg-surface-2 text-[13px] font-medium text-ink-2 transition-[background-color,color,box-shadow] duration-150 select-none peer-checked:bg-ink peer-checked:text-bg peer-focus-visible:shadow-[0_0_0_2px_var(--pill)]">
                  {l}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {freq === 'monthly' || freq === 'yearly' ? (
          <div className="grid grid-cols-2 gap-4">
            {freq === 'yearly' ? (
              <Field label="Month" htmlFor={`${id}-month`}>
                <Select id={`${id}-month`} name="bymonth" defaultValue={initial.bymonth ?? Number(initial.start.slice(5, 7))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </Select>
              </Field>
            ) : null}
            <Field label="Day of month" htmlFor={`${id}-mday`}>
              <Input id={`${id}-mday`} type="number" name="bymonthday" min={1} max={31} defaultValue={initial.bymonthday ?? Number(initial.start.slice(8, 10))} />
            </Field>
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink-2" id={`${id}-times`}>Times</div>
          <div className="flex flex-wrap items-center gap-1.5" aria-labelledby={`${id}-times`}>
            {times.map((t) => (
              <span key={t} className="inline-flex h-9 items-center gap-1 rounded-md bg-surface-2 pr-1 pl-3 text-sm text-ink tabular-nums">
                {t}
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  disabled={times.length === 1}
                  onClick={() => setTimes(times.filter((x) => x !== t))}
                  className="grid size-7 place-items-center rounded-sm text-ink-3 transition-colors duration-150 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <Input
                type="time"
                aria-label="Add a time"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTime() } }}
                className="w-[7.5rem]"
              />
              <Button size="icon" aria-label="Add time" onClick={addTime} disabled={!draft}>
                <Plus className="size-4" strokeWidth={2} />
              </Button>
            </span>
          </div>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Starts" htmlFor={`${id}-start`}>
          <Input id={`${id}-start`} type="date" name="start" required defaultValue={initial.start} />
        </Field>
        <Field label={<>Ends <span className="font-normal text-ink-3">· optional</span></>} htmlFor={`${id}-until`}>
          <Input id={`${id}-until`} type="date" name="until" defaultValue={initial.until ?? ''} />
        </Field>
        <Field label="Remind" htmlFor={`${id}-remind`}>
          <Select id={`${id}-remind`} name="remindOffsetMin" defaultValue={String(initial.remindOffsetMin)}>
            {REMIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
      </div>

      {kind === 'medicine' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dose" htmlFor={`${id}-dose`}>
            <Input id={`${id}-dose`} name="dose" maxLength={40} defaultValue={initial.dose ?? ''} placeholder="1 tablet" />
          </Field>
          <Field label="In stock" hint="Counts down when you mark a dose done" htmlFor={`${id}-stock`}>
            <Input id={`${id}-stock`} type="number" name="stock" min={0} defaultValue={initial.stock ?? ''} placeholder="30" />
          </Field>
        </div>
      ) : (
        <div className="rounded-lg bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-4">
            <span>
              <span id={`${id}-goal`} className="block text-sm font-medium text-ink">Daily target</span>
              <span className="block text-[12px] text-ink-3">Track an amount, like 3,000 ml of water</span>
            </span>
            <Switch checked={goal} onCheckedChange={setGoal} ariaLabel="Daily target" />
          </div>
          {goal ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Field label="Target" htmlFor={`${id}-target`}>
                <Input id={`${id}-target`} type="number" name="target" min={0} step="any" required defaultValue={initial.target ?? ''} placeholder="3000" />
              </Field>
              <Field label="Unit" htmlFor={`${id}-unit`}>
                <Input id={`${id}-unit`} name="unit" maxLength={20} defaultValue={initial.unit ?? ''} placeholder="ml" />
              </Field>
              <Field label="Quick add" htmlFor={`${id}-step`}>
                <Input id={`${id}-step`} type="number" name="step" min={0} step="any" defaultValue={initial.step ?? ''} placeholder="250" />
              </Field>
            </div>
          ) : null}
        </div>
      )}

      <Field label={<>Notes <span className="font-normal text-ink-3">· optional</span></>} htmlFor={`${id}-notes`}>
        <Textarea id={`${id}-notes`} name="notes" maxLength={500} rows={2} defaultValue={initial.notes ?? ''} placeholder="Cleanser · serum · sunscreen" />
      </Field>

      <FormError message={state && !state.ok ? state.error : undefined} />

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : initial.id ? 'Save' : 'Add routine'}</Button>
      </div>
    </form>
  )
}

/** "New routine" button; also opens itself for `/habits?new=1`. */
export function NewScheduleButton({ today, autoOpen = false }: { today: string; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const router = useRouter()
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" strokeWidth={2} />
        New routine
      </Button>
      <ScheduleDialog
        open={open}
        initial={blankSchedule(today)}
        onClose={() => {
          setOpen(false)
          if (autoOpen) router.replace('/habits', { scroll: false })
        }}
      />
    </>
  )
}
