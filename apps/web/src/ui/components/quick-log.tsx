'use client'

import { useState, useTransition } from 'react'
import { ArrowUp, Sparkles } from 'lucide-react'
import { quickLog } from '@/app/actions'
import { routineArt } from '../routine-icons'
import { cn } from '../cn'
import { announceXp, useToast } from './toast'

/** The same quick log as ⌘K, as a field on Today for a phone: "water 250", "coffee 2". */
export function QuickLog({ className }: { className?: string }) {
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const toast = useToast()
  const ready = value.trim().length > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || pending) return
    start(async () => {
      try {
        const r = await quickLog(value)
        announceXp(toast, r.news)
        const [title, ...rest] = r.message.split(' · ')
        if (r.ok) { toast(title, 'good', { description: rest.join(' · ') || undefined, icon: routineArt(title, '', '') }); setValue('') }
        else toast.error('Couldn’t read that', r.message)
      } catch {
        toast.error()
      }
    })
  }

  return (
    <form onSubmit={submit} className={cn('flex items-center gap-1.5 rounded-[16px] bg-surface py-1 ps-3.5 pe-1 shadow-1', className)}>
      <Sparkles className="size-[18px] shrink-0 text-pill-ink" strokeWidth={2} aria-hidden />
      <label htmlFor="quick-log" className="sr-only">Quick log</label>
      <input
        id="quick-log" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Log: water 250, coffee 2…"
        enterKeyHint="send" autoComplete="off" autoCapitalize="none"
        className="h-11 min-w-0 flex-1 bg-transparent ps-1.5 text-[16px] text-ink outline-none placeholder:text-ink-3"
      />
      <button
        type="submit" disabled={!ready || pending} aria-label="Log it"
        className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-ink-3 transition-[background-color,color,scale] duration-150 ease-out-quint active:scale-[0.96] enabled:bg-ink enabled:text-bg disabled:opacity-100"
      >
        <ArrowUp className="size-5" strokeWidth={2} aria-hidden />
      </button>
    </form>
  )
}
