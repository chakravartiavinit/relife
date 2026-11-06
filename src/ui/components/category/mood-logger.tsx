'use client'

import { useOptimistic, useTransition } from 'react'
import { logEntry } from '@/app/actions'
import { cn } from '../../cn'
import { announceXp, useToast } from '../toast'

const FACES = [
  { v: 1, label: 'Awful' },
  { v: 2, label: 'Low' },
  { v: 3, label: 'Okay' },
  { v: 4, label: 'Good' },
  { v: 5, label: 'Great' },
]

/** Five-button 1–5 logger for scale trackers (mood, energy). */
export function ScaleLogger({ slug, name, value }: { slug: string; name: string; value?: number }) {
  const [current, set] = useOptimistic(value)
  const [, start] = useTransition()
  const toast = useToast()
  return (
    <div role="radiogroup" aria-label={`Today’s ${name}`} className="grid grid-cols-5 gap-2">
      {FACES.map((f) => {
        const on = current === f.v
        return (
          <button
            key={f.v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => start(async () => {
              set(f.v)
              try { announceXp(toast, await logEntry(slug, f.v)) } catch { toast('Could not save. Try again.', 'bad') }
            })}
            className={cn(
              'flex h-16 flex-col items-center justify-center gap-1 rounded-md transition-[background-color,color,box-shadow,scale] duration-150 ease-out-quint active:scale-96',
              on ? 'bg-ink text-bg shadow-1' : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink',
            )}
          >
            <span className="font-display text-[20px] leading-none font-bold tabular-nums">{f.v}</span>
            <span className="text-[11px] font-medium">{f.label}</span>
          </button>
        )
      })}
    </div>
  )
}
