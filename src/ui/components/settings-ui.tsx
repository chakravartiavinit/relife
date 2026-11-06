'use client'

import { useActionState } from 'react'
import { saveProfile, type FormState } from '@/app/actions'
import { Button } from './button'
import { Field, Input, Textarea } from './form'

export function ProfileForm({ name, timezone, baseCurrency, goals, constraints, notes }: {
  name: string; timezone: string; baseCurrency: string; goals: string; constraints: string; notes: string
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfile, null)
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" htmlFor="p-name"><Input id="p-name" name="name" defaultValue={name} autoComplete="given-name" /></Field>
        <Field label="Time zone" htmlFor="p-tz" hint="IANA name, e.g. Asia/Kolkata"><Input id="p-tz" name="timezone" defaultValue={timezone} /></Field>
        <Field label="Base currency" htmlFor="p-cur"><Input id="p-cur" name="baseCurrency" defaultValue={baseCurrency} maxLength={5} /></Field>
      </div>
      <Field label="Goals" htmlFor="p-goals" hint="What levelling up means to you. The AI reads this for every plan.">
        <Textarea id="p-goals" name="goals" defaultValue={goals} placeholder="Sleep 7.5h, ship one side project a month, save 30% of income…" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Constraints" htmlFor="p-con"><Textarea id="p-con" name="constraints" defaultValue={constraints} placeholder="Vegetarian, office 10 to 7, budget for food delivery ₹4,000/month…" /></Field>
        <Field label="Notes for the observer" htmlFor="p-notes"><Textarea id="p-notes" name="notes" defaultValue={notes} placeholder="Be blunt. Prefer one small change a week." /></Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Save profile'}</Button>
        {state?.ok ? <span className="text-[13px] text-good">Saved</span> : null}
        {state && !state.ok ? <span className="text-[13px] text-bad">{state.error}</span> : null}
      </div>
    </form>
  )
}
