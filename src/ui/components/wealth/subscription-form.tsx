'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { saveSchedule } from '@/app/actions'
import { Button } from '../button'
import { Field, Input, Select, Segmented } from '../form'
import { useToast } from '../toast'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function SubscriptionForm({ today, baseCurrency }: { today: string; baseCurrency: string }) {
  const [state, action, pending] = useActionState(saveSchedule, null)
  const [freq, setFreq] = useState('monthly')
  const form = useRef<HTMLFormElement>(null)
  const toast = useToast()

  useEffect(() => {
    if (state?.ok) {
      form.current?.reset()
      setFreq('monthly')
      toast('Subscription added', 'good')
    }
  }, [state, toast])

  return (
    <form ref={form} action={action} className="flex flex-col gap-4" onChange={(e) => {
      const t = e.target as unknown as HTMLInputElement
      if (t.name === 'freq') setFreq(t.value)
    }}>
      <input type="hidden" name="kind" value="subscription" />
      <input type="hidden" name="category" value="wealth" />
      <input type="hidden" name="times" value="09:00" />
      <Field label="Name" htmlFor="sub-name">
        <Input id="sub-name" name="name" required placeholder="Claude Pro" autoComplete="off" />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
        <Field label="Amount" htmlFor="sub-amount">
          <Input id="sub-amount" name="amount" type="number" inputMode="decimal" min="0" step="0.01" required placeholder="649" />
        </Field>
        <Field label="Currency" htmlFor="sub-currency">
          <Input id="sub-currency" name="currency" defaultValue={baseCurrency} maxLength={5} className="uppercase" />
        </Field>
      </div>
      <Field label="Billed">
        <Segmented
          name="freq"
          defaultValue="monthly"
          options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }, { value: 'weekly', label: 'Weekly' }]}
        />
      </Field>
      {freq !== 'weekly' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day of month" htmlFor="sub-day">
            <Input id="sub-day" name="bymonthday" type="number" min="1" max="31" defaultValue={Number(today.slice(8))} />
          </Field>
          {freq === 'yearly' ? (
            <Field label="Month" htmlFor="sub-month">
              <Select id="sub-month" name="bymonth" defaultValue={String(Number(today.slice(5, 7)))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Select>
            </Field>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Remind me" htmlFor="sub-remind">
          <Select id="sub-remind" name="remindOffsetMin" defaultValue="4320">
            <option value="0">On the day</option>
            <option value="1440">1 day before</option>
            <option value="4320">3 days before</option>
            <option value="10080">7 days before</option>
          </Select>
        </Field>
        <Field label="Starts" htmlFor="sub-start">
          <Input id="sub-start" name="start" type="date" defaultValue={today} required />
        </Field>
      </div>
      {state && !state.ok ? <p role="alert" className="text-[13px] text-bad">{state.error}</p> : null}
      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {pending ? 'Adding…' : 'Add subscription'}
      </Button>
    </form>
  )
}
