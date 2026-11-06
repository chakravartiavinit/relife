'use client'

import { useState, useTransition } from 'react'
import { ArrowUp, Check, Loader2, Sparkles, X } from 'lucide-react'
import { ask, resolveInsight } from '@/app/actions'
import { TextShimmer } from '@/ui/beui/motion/text-shimmer'
import { Button } from './button'
import { useToast } from './toast'
import { cn } from '../cn'

/** Ask your data. The answer renders as plain paragraphs (no HTML from the model). */
export function AskBox({ initial, enabled }: { initial?: string; enabled: boolean }) {
  const [q, setQ] = useState(initial ?? '')
  const [answer, setAnswer] = useState<{ text: string; error?: boolean } | null>(null)
  const [pending, start] = useTransition()

  const submit = () => {
    if (!q.trim() || pending) return
    start(async () => {
      const r = await ask(q)
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
          placeholder={enabled ? 'How much did I spend on Zepto last month? Am I sleeping better than in October?' : 'Set LLM_DEFAULT and a provider key in .env to ask questions.'}
          className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <Button type="submit" variant="primary" size="icon" disabled={!enabled || pending || !q.trim()} aria-label="Ask">
          {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <ArrowUp className="size-4" strokeWidth={2} />}
        </Button>
      </form>
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
    toast(d === 'accept' ? (hasActions ? 'Added to your routines' : 'Marked as accepted') : 'Dismissed', 'good')
  })
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="primary" disabled={pending} onClick={() => go('accept')}>
        <Check className="size-4" strokeWidth={2} /> {hasActions ? 'Approve' : 'Got it'}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('dismiss')}>
        <X className="size-4" strokeWidth={1.5} /> Dismiss
      </Button>
    </div>
  )
}
