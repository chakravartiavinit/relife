'use client'

import { useId, useState } from 'react'
import { ChartNoAxesColumn, ChevronDown, RotateCcw, Sparkles } from 'lucide-react'
import { parsePeek } from '@/domain/peek'
import type { CoachSource } from '@/domain/coach-thread'
import { cn } from '../../cn'
import { Button } from '../button'
import { PeekLink } from '../peek/peek-link'

/** The user's question: a dark bubble on the right. */
export function QuestionBubble({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('max-w-[88%] rounded-[20px] rounded-br-[8px] bg-ink px-4 py-2.5 text-body text-surface text-pretty [overflow-wrap:anywhere]', className)}>{children}</div>
}

/** What an answer read, one chip each. A chip with a Peek opens it; the others are labels. */
export function SourceChips({ sources, className }: { sources: CoachSource[]; className?: string }) {
  if (!sources.length) return null
  return (
    <ul aria-label="Sources" className={cn('flex flex-wrap gap-1.5', className)}>
      {sources.map((s) => {
        const ref = parsePeek(s.peek)
        const cls = 'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-caption text-ink-2'
        const body = <><ChartNoAxesColumn className="size-3 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden /><span className="truncate">{s.label}</span></>
        return (
          <li key={s.label} className="max-w-full">
            {ref ? <PeekLink to={ref} className={cn(cls, 'transition-[background-color,color] duration-150 hover:bg-ink/[0.07] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill')}>{body}</PeekLink> : <span className={cls}>{body}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The coach's answer: a card with the text as plain paragraphs (no HTML from the model), what it read as chips, and
 * "Why?", which says how the numbers were got. A failed answer shows its error in `--bad` with Retry. Anything the
 * coach suggests goes to Needs you or shows as an approval under the card; nothing changes without a tap.
 */
export function AnswerCard({ text, sources = [], error, onRetry, footer, className }: {
  text: string; sources?: CoachSource[]; error?: boolean; onRetry?: () => void; footer?: React.ReactNode; className?: string
}) {
  const [why, setWhy] = useState(false)
  const whyId = useId()
  if (error) {
    return (
      <div role="alert" className={cn('w-full rounded-lg bg-surface p-4 shadow-1', className)}>
        <p className="text-body text-bad text-pretty [overflow-wrap:anywhere]">{text}</p>
        {onRetry ? <Button size="sm" className="mt-3" onClick={onRetry}><RotateCcw className="size-3.5" strokeWidth={1.5} aria-hidden />Retry</Button> : null}
      </div>
    )
  }
  return (
    <div className={cn('w-full rounded-lg bg-surface p-4 shadow-1', className)}>
      <p className="mb-2 flex items-center gap-1.5 text-caption font-medium text-ink-3"><Sparkles className="size-3.5 text-pill-ink" strokeWidth={1.5} aria-hidden />Answer</p>
      <div className="flex flex-col gap-2 text-body text-ink">
        {text.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-wrap text-pretty [overflow-wrap:anywhere]">{p}</p>)}
      </div>
      {why ? (
        <div id={whyId} className="mt-3 rounded-md bg-surface-2 px-3 py-2.5 text-small text-ink-2 text-pretty">
          <span className="font-semibold text-ink">How I got this: </span>
          {sources.length
            ? `I read ${sources.map((s) => s.label).join(', ')} through ReLife’s data tools, so the numbers come from your records, not from memory. Missing days count as missing, not zero.`
            : 'No data tools were needed. This comes from the summary of your week, not from a new lookup.'}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <SourceChips sources={sources} className="min-w-0" />
        <button
          type="button" aria-expanded={why} aria-controls={why ? whyId : undefined} onClick={() => setWhy((v) => !v)}
          className="ml-auto inline-flex min-h-10 items-center gap-0.5 rounded-sm px-1.5 text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
        >
          Why?<ChevronDown className={cn('size-3.5 transition-[rotate] duration-150 ease-out-quint', why && 'rotate-180')} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      {footer}
    </div>
  )
}
