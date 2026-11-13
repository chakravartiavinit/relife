'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { chooseQuestRecovery } from '@/app/actions'
import { formatValue } from '@/domain/patterns'
import type { RecoveryChoice, RecoveryView } from '@/domain/recovery'
import { cn } from '../../cn'

type Result = { ok: true; choice: RecoveryChoice | null } | { ok: false; error: string; retryOnly?: boolean }

/** What the row says when a choice is saved. */
export const RECOVERY_DONE: Record<RecoveryChoice, string> = {
  smaller: 'Smaller step added to Today',
  rest: 'Rest today saved. New quests stay paused until tomorrow',
  priorities: 'Priorities review chosen',
}

/**
 * The recovery decision as three plain choices, with the exact smaller step previewed and the pause note always in
 * view. A choice is never a new commitment until the server confirms it; a stale preview or a lost connection says so
 * and offers a retry. `choose` is the server action, passed in so /dev/ui can draw every state.
 */
export function RecoveryChoices({ recovery, onChosen, choose = (input) => chooseQuestRecovery(input) as Promise<Result>, className }: {
  recovery: RecoveryView
  /** Called once the server has saved the choice, so the row can collapse. */
  onChosen?: (choice: RecoveryChoice) => void
  choose?: (input: { insightId: string; version: number; choice: RecoveryChoice }) => Promise<Result>
  className?: string
}) {
  const [pending, start] = useTransition()
  const [attempt, setAttempt] = useState<RecoveryChoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryOnly, setRetryOnly] = useState(false)
  const preview = recovery.preview

  const pick = (choice: RecoveryChoice) => {
    setAttempt(choice)
    setError(null)
    start(async () => {
      try {
        const r = await choose({ insightId: recovery.id, version: recovery.version, choice })
        if (r.ok) onChosen?.(choice)
        else { setError(r.error); setRetryOnly(r.retryOnly === true) }
      } catch {
        setError('Could not confirm your choice. Retry to check and save it safely.')
        setRetryOnly(true)
      }
    })
  }

  const options: { choice: RecoveryChoice; title: string; sub: string; off?: boolean }[] = [
    { choice: 'smaller', title: 'Smaller step', sub: preview ? preview.title : 'No safe smaller step from today’s data', off: !preview },
    { choice: 'rest', title: 'Rest today', sub: 'No new quest' },
    { choice: 'priorities', title: 'Review priorities', sub: 'Look at this week’s load' },
  ]

  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy={pending}>
      {recovery.missed.length ? (
        <ul className="flex flex-col gap-0.5 text-small text-ink-3 tabular-nums">
          {recovery.missed.map((q) => (
            <li key={q.id}><span className="font-medium text-ink-2">{q.title}</span> · Yesterday {q.progress == null ? 'no data' : `${formatValue(q.progress, q.unit)} of ${formatValue(q.target, q.unit)}`}</li>
          ))}
        </ul>
      ) : null}
      <div role="group" aria-label="Recovery choices" className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => {
          const wait = pending && attempt === o.choice
          return (
            <button
              key={o.choice} type="button"
              disabled={pending || o.off || (retryOnly && attempt !== o.choice)}
              onClick={() => pick(o.choice)}
              className="relative flex min-h-14 flex-col items-start rounded-md bg-surface px-3.5 py-2.5 text-start shadow-1 transition-[scale,background-color,opacity] duration-150 ease-out-quint hover:bg-surface-2 active:scale-96 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
            >
              <span className="flex items-center gap-1.5 text-body font-semibold text-ink">
                {wait ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={2} aria-hidden /> : null}
                {wait ? 'Saving…' : error && attempt === o.choice ? `Retry ${o.title.toLowerCase()}` : o.title}
              </span>
              <span className="mt-0.5 line-clamp-2 text-small text-ink-3">{o.sub}</span>
            </button>
          )
        })}
      </div>
      {error ? <p role="alert" className="text-small text-bad">{error}</p> : null}
      <p className="text-small text-ink-3 text-pretty">
        {preview ? `The smaller step starts ${preview.fromDate === recovery.localDate ? 'today' : 'tomorrow'}. ` : ''}New daily quests pause until midnight whatever you choose.
      </p>
    </div>
  )
}
