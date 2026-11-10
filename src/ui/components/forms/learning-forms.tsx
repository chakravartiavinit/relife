'use client'

import { useActionState, useEffect, useId, useState, useTransition } from 'react'
import { GraduationCap, Plus } from 'lucide-react'
import { createLearningItem, updateLearningProgress } from '@/app/actions'
import { Button } from '../button'
import { Field, Input } from '../form'
import { announceXp, useToast } from '../toast'
import { Dialog, FormError } from './dialog'

export function LearningActions({ id, title, hasModules }: { id: string; title: string; hasModules: boolean }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const run = (delta: Parameters<typeof updateLearningProgress>[1], logged: string) =>
    start(async () => {
      try { const news = await updateLearningProgress(id, delta); toast(logged, 'good', { description: title, icon: '/routines/learn.png' }); announceXp(toast, news) } catch { toast.error() }
    })
  return (
    <div className="flex gap-2">
      {hasModules ? (
        <Button size="sm" disabled={pending} onClick={() => run({ done: 1 }, '1 module done')}>+1 module</Button>
      ) : null}
      <Button size="sm" disabled={pending} onClick={() => run({ minutes: 15 }, '15 min logged')}>+15 min</Button>
    </div>
  )
}

export function NewLearningButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Plus className="size-4" strokeWidth={2} />
        Add
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a course or book" icon={GraduationCap} color='var(--cat-skills)' description="Track progress, time spent and what it cost you.">
        {open ? <LearningForm onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  )
}

function LearningForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createLearningItem, null)
  const toast = useToast()
  const id = useId()
  useEffect(() => { if (state?.ok) { toast('Added to your learning', 'good', { icon: '/routines/learn.png' }); onDone() } }, [state, onDone, toast])
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Title" htmlFor={`${id}-t`}>
        <Input id={`${id}-t`} name="title" required maxLength={120} autoFocus placeholder="Learn Go" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Provider" htmlFor={`${id}-p`}>
          <Input id={`${id}-p`} name="provider" maxLength={60} placeholder="boot.dev" />
        </Field>
        <Field label="Modules / chapters" htmlFor={`${id}-m`}>
          <Input id={`${id}-m`} name="progressTotal" type="number" min={1} placeholder="12" />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_90px_1fr] gap-4">
        <Field label="Cost" htmlFor={`${id}-c`}>
          <Input id={`${id}-c`} name="cost" type="number" min={0} step="any" placeholder="4999" />
        </Field>
        <Field label="Currency" htmlFor={`${id}-cur`}>
          <Input id={`${id}-cur`} name="currency" maxLength={5} placeholder="INR" />
        </Field>
        <Field label="Finish by" htmlFor={`${id}-d`}>
          <Input id={`${id}-d`} name="targetDate" type="date" />
        </Field>
      </div>
      <Field label="Link" hint="Optional" htmlFor={`${id}-u`}>
        <Input id={`${id}-u`} name="url" type="url" placeholder="https://" />
      </Field>
      <FormError message={state && !state.ok ? state.error : undefined} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Adding…' : 'Add'}</Button>
      </div>
    </form>
  )
}
