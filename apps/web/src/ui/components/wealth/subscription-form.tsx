'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { CreditCard, Plus } from 'lucide-react'
import { saveSchedule } from '@/app/actions'
import { formatMoney } from '@/domain/money'
import { Button } from '../button'
import { Field, Input, Select, Segmented } from '../form'
import { Dialog, FormError } from '../forms/dialog'
import { BrandLogo } from '../brand-logo'
import { useToast } from '../toast'
import { cn } from '@/ui/cn'

const EVERY = { monthly: 'month', yearly: 'year', weekly: 'week' } as const

/** One tap fills the name (and the usual currency), so the logo shows at once. Prices change too often to prefill. */
const POPULAR: { name: string; currency?: string }[] = [
  { name: 'Netflix' }, { name: 'Spotify' }, { name: 'YouTube Premium' }, { name: 'Amazon Prime' },
  { name: 'JioHotstar' }, { name: 'Apple iCloud+' }, { name: 'Google One' }, { name: 'Claude Pro', currency: 'USD' },
  { name: 'ChatGPT Plus', currency: 'USD' }, { name: 'Cursor', currency: 'USD' }, { name: 'Notion', currency: 'USD' }, { name: 'Airtel' },
  { name: 'Jio' }, { name: 'LinkedIn Premium' }, { name: 'X (Twitter)' },
]

export type SubscriptionValues = {
  id?: string; name: string; kind: 'subscription' | 'bill' | 'renewal'; amount?: number; currency?: string
  /** `start`: the next charge date. Its day (and month, for yearly) sets the billing day. */
  freq: 'monthly' | 'yearly' | 'weekly'; remindOffsetMin: number; start: string
}

/** The "Add subscription" button in the page header, with its dialog. */
export function AddSubscription({ today, baseCurrency }: { today: string; baseCurrency: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" strokeWidth={2} /> Add subscription
      </Button>
      <SubscriptionDialog open={open} onClose={() => setOpen(false)} today={today} baseCurrency={baseCurrency} />
    </>
  )
}

/** Add or edit a subscription, bill or renewal. A live preview shows the logo and the charge as you type. */
export function SubscriptionDialog({ open, onClose, today, baseCurrency, initial }: {
  open: boolean; onClose: () => void; today: string; baseCurrency: string; initial?: SubscriptionValues
}) {
  const edit = !!initial?.id
  return (
    <Dialog
      open={open} onClose={onClose} icon={CreditCard} color="var(--cat-wealth)" width={edit ? 'max-w-[520px]' : 'max-w-[820px]'}
      title={edit ? `Edit ${initial.name}` : 'Add subscription'}
      description={edit ? 'Changes apply from the next charge.' : 'Pick a service or type any name. You get a Telegram reminder before each charge.'}
    >
      {/* Remount on open, so a closed form starts fresh next time. */}
      {open ? <SubscriptionForm key={initial?.id ?? 'new'} today={today} baseCurrency={baseCurrency} initial={initial} onDone={onClose} /> : null}
    </Dialog>
  )
}

function SubscriptionForm({ today, baseCurrency, initial, onDone }: { today: string; baseCurrency: string; initial?: SubscriptionValues; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveSchedule, null)
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? baseCurrency)
  const [freq, setFreq] = useState<SubscriptionValues['freq']>(initial?.freq ?? 'monthly')
  const [next, setNext] = useState(initial?.start ?? today)
  const amountRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const handled = useRef<typeof state>(null)
  useEffect(() => {
    if (!state?.ok || handled.current === state) return
    handled.current = state // once per save, however often this re-renders before the dialog closes
    toast(initial?.id ? `${name} saved` : `${name} added`, 'good', { icon: '/routines/card.png' })
    onDone()
  }, [state, toast, onDone, name, initial?.id])

  const currencies = [...new Set([baseCurrency, 'INR', 'USD', 'EUR', 'GBP', currency])]
  const value = Number(amount)
  const pick = (p: (typeof POPULAR)[number]) => {
    setName(p.name)
    setCurrency(p.currency ?? baseCurrency)
    amountRef.current?.focus()
  }

  const edit = !!initial?.id
  const preview = (
    // Live preview: the card as it will appear on the page.
    <div className="flex items-center gap-3 rounded-[16px] bg-surface-2 p-3">
      {name.trim() ? <BrandLogo name={name} size="md" /> : (
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-surface text-ink-3 shadow-[inset_0_0_0_1.5px_var(--hairline)]">
          <CreditCard className="size-[18px]" strokeWidth={1.5} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[15px] font-semibold', name ? 'text-ink' : 'text-ink-3')}>{name || 'Your subscription'}</p>
        <p className="text-[12.5px] text-ink-3">Every {EVERY[freq]}</p>
      </div>
      <p className="shrink-0 text-right text-[16px] font-semibold text-ink tabular-nums">
        {value > 0 ? formatMoney(value, currency) : <span className="text-ink-3">–</span>}
        <span className="block text-[11.5px] font-normal text-ink-3">/ {EVERY[freq]}</span>
      </p>
    </div>
  )

  return (
    <form action={action} className="flex flex-col gap-5" onChange={(e) => {
      const t = e.target as unknown as HTMLInputElement
      if (t.name === 'freq') setFreq(t.value as SubscriptionValues['freq'])
    }}>
      {edit ? <input type="hidden" name="id" value={initial!.id} /> : null}
      <input type="hidden" name="category" value="wealth" />
      <input type="hidden" name="times" value="09:00" />
      {/* The next charge date sets the billing day (and month for yearly); weekly repeats on its weekday. */}
      <input type="hidden" name="start" value={next} />
      {freq !== 'weekly' ? <input type="hidden" name="bymonthday" value={Number(next.slice(8))} /> : null}
      {freq === 'yearly' ? <input type="hidden" name="bymonth" value={Number(next.slice(5, 7))} /> : null}

      {/* Two columns when adding, so the dialog fits a laptop screen without scrolling. */}
      <div className={cn('grid gap-6', !edit && 'md:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)]')}>
        {edit ? preview : (
          <div className="flex flex-col gap-4">
            {preview}
            <fieldset>
              <legend className="mb-2 text-[12.5px] font-medium text-ink-2">Popular</legend>
              <div className="grid grid-cols-4 gap-1.5 md:grid-cols-3">
                {POPULAR.map((p) => (
                  <button
                    key={p.name} type="button" onClick={() => pick(p)} aria-pressed={name === p.name}
                    className={cn(
                      'flex min-h-[70px] flex-col items-center justify-start gap-1.5 rounded-[12px] px-1 pt-2.5 pb-2 text-[11px] leading-tight text-ink-2 transition-[background-color,box-shadow,scale] duration-150 active:scale-[0.96]',
                      'hover:bg-surface-2 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--pill)]',
                      name === p.name && 'bg-surface-2 text-ink shadow-[0_0_0_1.5px_var(--pill)]',
                    )}
                  >
                    <BrandLogo name={p.name} size="sm" />
                    <span className="line-clamp-2 text-center">{p.name}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="sub-name">
            <Input id="sub-name" name="name" data-autofocus required maxLength={80} placeholder="Claude Pro" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <Field label="Amount" htmlFor="sub-amount">
              <Input ref={amountRef} id="sub-amount" name="amount" type="number" inputMode="decimal" min="0" step="0.01" required placeholder="649" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Currency" htmlFor="sub-currency">
              <Select id="sub-currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Billed">
            <Segmented name="freq" defaultValue={freq} className="w-full [&>label]:flex-1 [&_span]:justify-center" options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }, { value: 'weekly', label: 'Weekly' }]} />
          </Field>
          <Field label="Type">
            <Segmented name="kind" defaultValue={initial?.kind ?? 'subscription'} className="w-full [&>label]:flex-1 [&_span]:justify-center" options={[{ value: 'subscription', label: 'Subscription' }, { value: 'bill', label: 'Bill' }, { value: 'renewal', label: 'Renewal' }]} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next charge" htmlFor="sub-next">
              <Input id="sub-next" type="date" required value={next} onChange={(e) => e.target.value && setNext(e.target.value)} />
            </Field>
            <Field label="Remind me" htmlFor="sub-remind">
              <Select id="sub-remind" name="remindOffsetMin" defaultValue={String(initial?.remindOffsetMin ?? 4320)}>
                <option value="0">On the day</option>
                <option value="1440">1 day before</option>
                <option value="4320">3 days before</option>
                <option value="10080">7 days before</option>
              </Select>
            </Field>
          </div>
        </div>
      </div>

      <FormError message={state && !state.ok ? state.error : undefined} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : edit ? 'Save' : 'Add subscription'}</Button>
      </div>
    </form>
  )
}
