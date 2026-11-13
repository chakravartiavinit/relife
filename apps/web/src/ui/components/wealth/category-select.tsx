'use client'

import { useOptimistic, useTransition } from 'react'
import { recategorize } from '@/app/actions'
import { useToast } from '../toast'
import { usePeekChanged } from '../peek/peek-context'
import { Select } from '../select'

/** Inline category picker. Changing it re-categorizes and remembers the rule for that merchant. */
export function CategorySelect({ id, value, options, merchant }: { id: string; value: string; options: string[]; merchant: string }) {
  const [current, setCurrent] = useOptimistic(value)
  const [pending, start] = useTransition()
  const toast = useToast()
  const changed = usePeekChanged()
  return (
    <Select
      variant="pill" aria-label={`Category for ${merchant}`} value={current} disabled={pending} className="max-w-full"
      onChange={(e) => {
        const next = e.target.value
        start(async () => {
          setCurrent(next)
          try {
            await recategorize(id, next, true)
            changed()
            toast(`${merchant} moved to ${next}`, 'good', { description: 'Remembered for their next payments' })
          } catch {
            toast.error()
          }
        })
      }}
    >
      {options.includes(current) ? null : <option value={current}>{current}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </Select>
  )
}
