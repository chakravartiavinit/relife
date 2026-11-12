'use client'

import { useActionState, useEffect, useId, useState, useTransition } from 'react'
import { Palette, Plus } from 'lucide-react'
import { createHobby, logPractice } from '@/app/actions'
import { Button } from './button'
import { Field, Input } from './form'
import { Dialog, FormError } from './forms/dialog'
import { announceXp, useToast } from './toast'
import { cn } from '../cn'
import { hobbyArt } from '../hobby-art'
import { HobbyImage } from './hobby-image'

const IDEAS = ['Guitar', 'Drawing', 'Chess', 'Cooking', 'Photography', 'Piano', 'Writing', 'Dancing']
const WEEKLY = [60, 150, 300, 420]

/** "Add a hobby": a name (or a tap on an idea) and a weekly practice goal. */
export function AddHobbyButton({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus className="size-4" strokeWidth={2} aria-hidden />
        Add a hobby
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a hobby" icon={Palette} color='var(--cat-hobbies)' description="Log practice minutes and ReLife tracks your streak, your hours and how you grow. The System can set quests on it too.">
        {open ? <HobbyForm onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  )
}

function HobbyForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createHobby, null)
  const [name, setName] = useState('')
  const [weekly, setWeekly] = useState(150)
  const toast = useToast()
  const id = useId()
  useEffect(() => { if (state?.ok) { toast(`${name} added`, 'good', { description: `Goal: ${weekly} min a week`, icon: hobbyArt(name) }); onDone() } }, [state, onDone, toast, name])
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex items-end gap-3">
        {/* Live picture: changes as you type ("guitar", "chess", "baking"…). */}
        <HobbyImage name={name || 'sparkles'} />
        <Field label="Hobby" htmlFor={`${id}-n`} className="flex-1">
          <Input id={`${id}-n`} name="name" required maxLength={40} autoFocus placeholder="Guitar" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <div role="group" aria-label="Ideas" className="-mt-2 flex flex-wrap gap-1.5">
        {IDEAS.map((i) => (
          <button
            key={i} type="button" onClick={() => setName(i)} aria-pressed={name === i}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full ps-1.5 pe-3 text-[12.5px] font-medium transition-[background-color,color,scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
              name === i ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 hover:text-ink',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- small local PNGs */}
            <img src={hobbyArt(i)} alt="" width={22} height={22} className="size-[22px] outline-none" />
            {i}
          </button>
        ))}
      </div>
      <Field label="Weekly goal" htmlFor={`${id}-w`} hint={`About ${Math.round(weekly / 7)} minutes a day.`}>
        <div className="flex flex-wrap items-center gap-2">
          {WEEKLY.map((w) => (
            <button
              key={w} type="button" onClick={() => setWeekly(w)} aria-pressed={weekly === w}
              className={cn(
                'h-9 rounded-md px-3 text-[13px] font-medium tabular-nums transition-[background-color,color,box-shadow,scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
                weekly === w ? 'bg-surface text-ink shadow-[0_0_0_2px_var(--pill)]' : 'bg-surface-2 text-ink-2 hover:text-ink',
              )}
            >
              {w < 60 ? `${w} min` : `${w / 60} h`}
            </button>
          ))}
          <span className="flex items-center gap-2">
            <span className="w-24"><Input id={`${id}-w`} name="weekly" type="number" min={10} max={3000} value={weekly} onChange={(e) => setWeekly(Number(e.target.value) || 0)} className="tabular-nums" aria-label="Minutes a week" /></span>
            <span className="text-[13px] whitespace-nowrap text-ink-3">min a week</span>
          </span>
        </div>
      </Field>
      <FormError message={state?.ok === false ? state.error : undefined} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending || !name.trim()}>{pending ? 'Adding…' : 'Add hobby'}</Button>
      </div>
    </form>
  )
}

/** +15 / +30 minute buttons on a hobby card. */
export function PracticeButtons({ slug, name, color }: { slug: string; name: string; color: string }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const log = (m: number) => start(async () => {
    try {
      const news = await logPractice(slug, m)
      toast(`${name} logged`, 'good', { description: `+${m} min this week`, icon: hobbyArt(name) })
      announceXp(toast, news)
    } catch { toast.error() }
  })
  return (
    <div className="flex gap-2">
      {[15, 30].map((m) => (
        <button
          key={m} type="button" disabled={pending} onClick={() => log(m)}
          className="h-10 flex-1 rounded-md text-[13px] font-semibold tabular-nums transition-[background-color,scale,opacity] duration-150 ease-out-quint active:scale-[0.96] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
          style={{ color: `color-mix(in oklch, ${color} 80%, var(--ink))`, background: `color-mix(in oklch, ${color} 14%, transparent)` }}
        >
          +{m} min
        </button>
      ))}
    </div>
  )
}
