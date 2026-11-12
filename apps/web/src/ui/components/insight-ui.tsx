'use client'

import { useState, useTransition } from 'react'
import { ArrowUp, Check, Loader2, Sparkles, X } from 'lucide-react'
import { ask, resolveInsight } from '@/app/actions'
import { TextShimmer } from '@/ui/beui/motion/text-shimmer'
import { Button, buttonClass } from './button'
import { useToast } from './toast'
import { cn } from '../cn'

const EXAMPLES = ['How much did I spend on Zepto last month?', 'Am I sleeping better than in October?', 'What slipped this week?']

/** Ask your data. The answer renders as plain paragraphs (no HTML from the model). */
export function AskBox({ initial, enabled }: { initial?: string; enabled: boolean }) {
  const [q, setQ] = useState(initial ?? '')
  const [answer, setAnswer] = useState<{ text: string; error?: boolean } | null>(null)
  const [pending, start] = useTransition()

  const submit = (question = q) => {
    if (!question.trim() || pending) return
    start(async () => {
      const r = await ask(question)
      setAnswer(r.error ? { text: r.error, error: true } : { text: r.answer })
    })
  }

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); submit() }}
        className="flex items-end gap-2 rounded-lg bg-surface p-2 shadow-1 focus-within:shadow-[0_0_0_2px_var(--pill)]"
      >
        <label htmlFor="ask" className="sr-only">Ask about your data</label>
        <textarea
          id="ask"
          rows={1}
          value={q}
          disabled={!enabled}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder={enabled ? 'Ask anything about your spending, sleep, habits or code…' : 'Connect an AI model on Connectors to ask questions.'}
          className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <Button type="submit" variant="primary" size="icon" disabled={!enabled || pending || !q.trim()} aria-label="Ask">
          {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <ArrowUp className="size-4" strokeWidth={2} />}
        </Button>
      </form>
      {enabled && !pending && !answer && !q ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Example questions">
          {EXAMPLES.map((e) => (
            <button
              key={e} type="button" onClick={() => { setQ(e); submit(e) }}
              className={buttonClass({ variant: 'secondary', size: 'sm', className: 'rounded-full font-normal text-ink-2 hover:text-ink' })}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}
      {pending ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-surface p-5 shadow-1" aria-live="polite">
          <Sparkles className="size-4 text-pill-ink" strokeWidth={1.5} />
          <TextShimmer className="text-[14px] font-medium">Reading your data…</TextShimmer>
        </div>
      ) : answer ? (
        <div className={cn('mt-4 rounded-lg p-5 shadow-1', answer.error ? 'bg-surface text-bad' : 'bg-surface')} aria-live="polite">
          {!answer.error ? (
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
              <Sparkles className="size-3.5 text-pill-ink" strokeWidth={1.5} /> Answer
            </div>
          ) : null}
          <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-ink">
            {answer.text.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function InsightActions({ id, hasActions }: { id: string; hasActions: boolean }) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const go = (d: 'accept' | 'dismiss') => start(async () => {
    await resolveInsight(id, d)
    if (d === 'accept') toast(hasActions ? 'Added to your routines' : 'Insight noted', 'good', { icon: Sparkles })
    else toast('Insight dismissed', 'neutral', { icon: X })
  })
  return (
    <div className="flex items-center gap-2">
      {/* Approve changes your routines, so it is the strong button; "Got it" only files the card away. */}
      <Button size="sm" variant={hasActions ? 'primary' : 'secondary'} disabled={pending} onClick={() => go('accept')}>
        <Check className="size-4" strokeWidth={2} /> {hasActions ? 'Approve' : 'Got it'}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('dismiss')}>
        <X className="size-4" strokeWidth={1.5} /> Dismiss
      </Button>
    </div>
  )
}
