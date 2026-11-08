'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { saveProfile, type FormState } from '@/app/actions'
import { Button } from './button'
import { Input, Textarea } from './form'
import { CurrencyPicker, TimezonePicker } from './region-picker'
import { SettingsRow, SettingsSection } from './settings-layout'
import { applyTheme, type ThemeChoice } from './theme-toggle'
import { useToast } from './toast'
import { cn } from '../cn'

/**
 * Profile and coaching notes in one form. A save bar appears only when something changed,
 * so the page never asks you to save what you didn't touch.
 */
export function ProfileForm({ name, timezone, baseCurrency, goals, constraints, notes, timezones, currencies }: {
  name: string; timezone: string; baseCurrency: string; goals: string; constraints: string; notes: string
  timezones: string[]; currencies: string[]
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfile, null)
  const [dirty, setDirty] = useState(false)
  const [resets, setResets] = useState(0)
  // This device's zone, offered first in the picker. Read after mount so SSR markup matches.
  const [device, setDevice] = useState<string | null>(null)
  useEffect(() => setDevice(Intl.DateTimeFormat().resolvedOptions().timeZone), [])
  const form = useRef<HTMLFormElement>(null)
  const toast = useToast()

  useEffect(() => {
    if (state?.ok) { setDirty(false); toast('Settings saved', 'good') }
  }, [state, toast])

  const localTime = (() => {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date()) } catch { return null }
  })()

  return (
    <form
      ref={form}
      // Submit by hand: a form `action` resets the fields afterwards, which would wipe edits when a save fails.
      onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => action(data)) }}
      onChange={() => setDirty(true)}
      onReset={() => { setDirty(false); setResets((n) => n + 1) }}
      className="flex flex-col gap-10"
    >
      <SettingsSection id="profile" title="Profile" description="Used for day boundaries, money conversion and every AI prompt.">
        <SettingsRow label="Name" hint="Shown on Today and your Profile." htmlFor="p-name">
          <Input id="p-name" name="name" defaultValue={name} autoComplete="given-name" maxLength={60} className="max-w-sm" />
        </SettingsRow>
        <SettingsRow
          label="Time zone"
          hint={<>Decides when your day starts and when reminders fire.{localTime ? <> It’s <span className="tabular-nums">{localTime}</span> there now.</> : null}</>}
          htmlFor="p-tz"
        >
          <TimezonePicker key={`tz${resets}`} id="p-tz" name="timezone" defaultValue={timezone} options={timezones} suggested={[device]} onChange={() => setDirty(true)} className="max-w-sm" />
        </SettingsRow>
        <SettingsRow label="Base currency" hint="Every amount is converted into this for totals and charts. Originals are kept." htmlFor="p-cur">
          <CurrencyPicker key={`cur${resets}`} id="p-cur" name="baseCurrency" defaultValue={baseCurrency} options={currencies} onChange={() => setDirty(true)} className="max-w-[12rem]" />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="coaching" title="Goals & coaching" description="Your AI model reads these before every plan, nudge and weekly review.">
        <SettingsRow label="Goals" hint="What levelling up means to you." htmlFor="p-goals">
          <Textarea id="p-goals" name="goals" defaultValue={goals} rows={3} placeholder="Sleep 7.5h, ship one side project a month, save 30% of income…" />
        </SettingsRow>
        <SettingsRow label="Constraints" hint="Things plans have to work around." htmlFor="p-con">
          <Textarea id="p-con" name="constraints" defaultValue={constraints} rows={3} placeholder="Vegetarian, office 10 to 7, budget for food delivery ₹4,000/month…" />
        </SettingsRow>
        <SettingsRow label="Notes for the observer" hint="How you want to be talked to." htmlFor="p-notes">
          <Textarea id="p-notes" name="notes" defaultValue={notes} rows={2} placeholder="Be blunt. Prefer one small change a week." />
        </SettingsRow>
      </SettingsSection>

      {state && !state.ok ? <p role="alert" className="-mt-6 rounded-md bg-bad/8 px-4 py-3 text-[13px] text-bad">{state.error}</p> : null}

      {/* Save bar: shown only while there are unsaved edits. */}
      <div
        aria-hidden={!dirty}
        inert={!dirty}
        className={cn(
          // Floats over the page (no layout space): centred on the content column, above the phone tab bar.
          'fixed bottom-24 left-1/2 z-40 flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-lg bg-ink py-2.5 pr-2.5 pl-4 text-bg shadow-3 lg:bottom-6 lg:left-[calc(50%+132px)]',
          'transition-[opacity,translate] duration-200 ease-out-quint',
          dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0 motion-reduce:translate-y-0',
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium">
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', state && !state.ok ? 'bg-bad' : 'bg-warn')} />
          <span className="truncate">{state && !state.ok ? 'Couldn’t save: see the message below the form' : 'Unsaved changes'}</span>
        </span>
        <span className="flex items-center gap-2">
          <button type="reset" className="h-9 rounded-md px-3 text-[13.5px] font-medium text-bg/70 transition-[color,scale] duration-150 hover:text-bg active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
            Discard
          </button>
          <Button type="submit" variant="accent" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>
        </span>
      </div>
    </form>
  )
}

const THEMES: { key: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
]

/** Light / Dark / System. Applies instantly; stored in this browser only. */
export function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice | null>(null)
  useEffect(() => {
    const read = () => setChoice((localStorage.getItem('theme') as ThemeChoice | null) ?? 'system')
    read()
    window.addEventListener('relife:theme', read)
    return () => window.removeEventListener('relife:theme', read)
  }, [])
  return (
    <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-3 gap-2">
      {THEMES.map(({ key, label, icon: Icon }) => {
        const on = choice === key
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => { applyTheme(key); setChoice(key) }}
            className={cn(
              'flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
              on ? 'bg-surface text-ink shadow-[0_0_0_2px_var(--pill)]' : 'bg-surface-2 text-ink-3 hover:text-ink',
            )}
          >
            <Icon className="size-5" strokeWidth={on ? 2 : 1.5} aria-hidden />
            {label}
          </button>
        )
      })}
    </div>
  )
}
