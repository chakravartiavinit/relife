'use client'

import { useActionState, useEffect, useId, useState, useTransition } from 'react'
import { Activity, Archive, Check, Plus } from 'lucide-react'
import { archiveTracker, createTracker, logEntry } from '@/app/actions'
import { CATEGORIES } from '@/db/schema'
import { CATEGORY } from '@/ui/tokens'
import { Button } from '../button'
import { Field, Input, Select } from '../form'
import { announceXp, useToast } from '../toast'
import { Dialog, FormError } from './dialog'

/** Inline "set today's value" for a tracker card. */
export function QuickLog({ slug, name, unit, step }: { slug: string; name: string; unit?: string | null; step?: string }) {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const toast = useToast()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(value)
    if (value === '' || !Number.isFinite(n)) return
    start(async () => {
      try {
        announceXp(toast, await logEntry(slug, n))
        setValue('')
        setSaved(true)
        setTimeout(() => setSaved(false), 1200)
      } catch {
        toast('Could not save. Try again.', 'bad')
      }
    })
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="decimal"
        step={step ?? 'any'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={unit ? `Today, ${unit}` : 'Today'}
        aria-label={`Set today’s ${name}`}
        className="h-10"
      />
      <Button type="submit" size="icon" className="size-10" aria-label={`Save ${name}`} disabled={pending || value === ''}>
        {/* Both icons mounted; cross-fade on save. */}
        <span className="relative grid size-4 place-items-center">
          <Plus className={`absolute size-4 transition-[opacity,scale,filter] duration-200 ease-out-quint ${saved ? 'scale-25 opacity-0 blur-[4px]' : ''}`} strokeWidth={2} />
          <Check className={`absolute size-4 text-good transition-[opacity,scale,filter] duration-200 ease-out-quint ${saved ? '' : 'scale-25 opacity-0 blur-[4px]'}`} strokeWidth={2} />
        </span>
      </Button>
    </form>
  )
}

export function NewTrackerButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" strokeWidth={2} />
        New tracker
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New tracker" icon={Activity} color='var(--pill)' description="Anything you want to count daily. You can also just type “coffee 2” in ⌘K.">
        {open ? <TrackerForm onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  )
}

function TrackerForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createTracker, null)
  const toast = useToast()
  const id = useId()
  useEffect(() => {
    if (state?.ok) { toast('Tracker added', 'good'); onDone() }
  }, [state, onDone, toast])
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Name" htmlFor={`${id}-n`}>
        <Input id={`${id}-n`} name="name" required maxLength={60} autoFocus placeholder="Pages read" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Category" htmlFor={`${id}-c`}>
          <Select id={`${id}-c`} name="category" defaultValue="health">
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c].label}</option>)}
          </Select>
        </Field>
        <Field label="Type" htmlFor={`${id}-k`}>
          <Select id={`${id}-k`} name="kind" defaultValue="number">
            <option value="number">Number</option>
            <option value="duration">Minutes</option>
            <option value="money">Money</option>
            <option value="scale">Scale 1 to 5</option>
            <option value="bool">Yes / no</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Unit" htmlFor={`${id}-u`}>
          <Input id={`${id}-u`} name="unit" maxLength={20} placeholder="pages" />
        </Field>
        <Field label="Daily target" htmlFor={`${id}-t`}>
          <Input id={`${id}-t`} name="target" type="number" min={0} step="any" placeholder="20" />
        </Field>
        <Field label="Better when" htmlFor={`${id}-d`}>
          <Select id={`${id}-d`} name="direction" defaultValue="up">
            <option value="up">Higher</option>
            <option value="down">Lower</option>
          </Select>
        </Field>
      </div>
      <FormError message={state && !state.ok ? state.error : undefined} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Adding…' : 'Add tracker'}</Button>
      </div>
    </form>
  )
}

export function ArchiveTrackerButton({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])
  return confirming ? (
    <Button variant="danger" size="sm" disabled={pending} onClick={() => start(() => archiveTracker(id))}>Archive?</Button>
  ) : (
    <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Archive ${name}`}>
      <Archive className="size-4" strokeWidth={1.5} />
      Archive
    </Button>
  )
}
