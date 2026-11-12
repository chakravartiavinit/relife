'use client'

import { useActionState, useEffect, useId, useState, useTransition } from 'react'
import { Check, Plus, UserPlus } from 'lucide-react'
import { createPerson, markContacted } from '@/app/actions'
import { Button } from '../button'
import { Field, Input } from '../form'
import { announceXp, useToast } from '../toast'
import { usePeekChanged } from '../peek/peek-context'
import { Dialog, FormError } from './dialog'

export function ContactedButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const changed = usePeekChanged()
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => start(async () => {
        try { const news = await markContacted(id); changed(); toast(`Catch-up with ${name} logged`, 'good', { icon: '/routines/call.png' }); announceXp(toast, news) } catch { toast.error() }
      })}
    >
      <Check className="size-4" strokeWidth={2} />
      Talked today
    </Button>
  )
}

export function NewPersonButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" strokeWidth={2} />
        Add person
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add someone" icon={UserPlus} color='var(--cat-relationships)' description="Set how often you want to be in touch and ReLife will nudge you.">
        {open ? <PersonForm onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  )
}

function PersonForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createPerson, null)
  const toast = useToast()
  const id = useId()
  useEffect(() => { if (state?.ok) { toast('Added to your people', 'good', { icon: '/routines/people.png' }); onDone() } }, [state, onDone, toast])
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Name" htmlFor={`${id}-n`}>
        <Input id={`${id}-n`} name="name" required maxLength={80} autoFocus placeholder="Maa" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Relation" htmlFor={`${id}-r`}>
          <Input id={`${id}-r`} name="relation" maxLength={40} placeholder="Family" />
        </Field>
        <Field label="Talk every (days)" htmlFor={`${id}-e`}>
          <Input id={`${id}-e`} name="contactEveryDays" type="number" min={1} placeholder="7" />
        </Field>
      </div>
      <FormError message={state && !state.ok ? state.error : undefined} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Adding…' : 'Add'}</Button>
      </div>
    </form>
  )
}
