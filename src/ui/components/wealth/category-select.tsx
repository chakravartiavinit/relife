'use client'

import { useOptimistic, useTransition } from 'react'
import { recategorize } from '@/app/actions'
import { useToast } from '../toast'

/** Inline category picker. Changing it re-categorizes and remembers the rule for that merchant. */
export function CategorySelect({ id, value, options, merchant }: { id: string; value: string; options: string[]; merchant: string }) {
  const [current, setCurrent] = useOptimistic(value)
  const [pending, start] = useTransition()
  const toast = useToast()
  return (
    <select
      aria-label={`Category for ${merchant}`}
      value={current}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value
        start(async () => {
          setCurrent(next)
          try {
            await recategorize(id, next, true)
            toast(`${merchant} → ${next}`, 'good')
          } catch {
            toast('Could not save. Try again.', 'bad')
          }
        })
      }}
      className="h-8 max-w-full cursor-pointer appearance-none truncate rounded-sm bg-surface-2 px-2 pr-6 text-[12px] font-medium text-ink-2 transition-[background-color,color] duration-150 hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--pill)] disabled:opacity-60"
      style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 6.5 8 10l3.5-3.5' fill='none' stroke='%23889' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '12px',
      }}
    >
      {options.includes(current) ? null : <option value={current}>{current}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
