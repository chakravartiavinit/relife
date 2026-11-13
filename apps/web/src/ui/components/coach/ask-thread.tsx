'use client'

import brand from '@relife/brand/brand.json'
import { useOptimistic, useState, useTransition } from 'react'
import { Check, Send, Sparkles, Trash2 } from 'lucide-react'
import { ask, clearConversation, resolveInsight } from '@/app/actions'
import type { ThreadEntry, ThreadProposal } from '@/core/coach-messages'
import { formatTime } from '@/core/time'
import { Message, MessageContent, MessageGroup, MessageScroller } from '@/ui/beui/agents/message'
import { PromptInput } from '@/ui/beui/agents/prompt-input'
import { TextShimmer } from '@/ui/beui/motion/text-shimmer'
import { Button } from '../button'
import { useToast } from '../toast'
import { usePeekChanged } from '../peek/peek-context'
import { cn } from '../../cn'
import { AnswerCard, QuestionBubble } from './answer-card'
import { ActionPreview } from './needs-you-row'

const EXAMPLES = ['How much did I spend on Zepto last month?', 'Am I sleeping better than in October?', 'What slipped this week?']

/** An answer the server could not save (the table is missing, the connection dropped): shown here so it is not lost. */
type Unsaved = { q: string; text: string; error?: boolean; sources?: ThreadEntry['payload']['sources'] }

/** A routine the coach proposed while answering: what it would add, and Approve or Dismiss. Nothing changes without a tap. */
function Proposal({ p }: { p: ThreadProposal }) {
  const [status, setStatus] = useState(p.status)
  const [pending, start] = useTransition()
  const toast = useToast()
  const changed = usePeekChanged()
  const go = (d: 'accept' | 'dismiss') => start(async () => {
    try { await resolveInsight(p.id, d); setStatus(d === 'accept' ? 'accepted' : 'dismissed'); changed() } catch { toast.error() }
  })
  return (
    <div className="mt-3 rounded-md bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-small font-medium text-ink"><Sparkles className="size-3.5 text-pill-ink" strokeWidth={1.5} aria-hidden />{p.title}</p>
      {p.actions.length ? <ActionPreview actions={p.actions} /> : null}
      {status === 'pending' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={pending} onClick={() => go('accept')}><Check className="size-4" strokeWidth={2} aria-hidden />Approve</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('dismiss')}>Dismiss</Button>
          <span className="text-small text-ink-3">Nothing changes until you approve.</span>
        </div>
      ) : (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-small text-ink-2">
          <Check className="size-3.5 text-good" strokeWidth={2} aria-hidden />{status === 'dismissed' ? 'Dismissed' : 'Added to your routines'}
        </p>
      )}
    </div>
  )
}

/**
 * The Ask conversation: what was said (one thread for the app and Telegram), answer cards with their sources, a
 * composer, and example questions while it is empty. The question shows at once and the thread comes back from the
 * server with both messages saved. Without a model the composer is off but the history stays readable.
 */
export function AskThread({ thread, enabled, initial, timezone, className }: {
  thread: ThreadEntry[]; enabled: boolean; initial?: string; timezone: string; className?: string
}) {
  const [draft, setDraft] = useState(initial ?? '')
  const [unsaved, setUnsaved] = useState<Unsaved | null>(null)
  const [pending, start] = useTransition()
  const [asked, addAsked] = useOptimistic<ThreadEntry[], string>(thread, (cur, q) => [
    ...cur, { id: `asking-${cur.length}`, role: 'user', text: q, channel: 'app', at: new Date().toISOString(), payload: {}, proposals: [] },
  ])
  const [confirmClear, setConfirmClear] = useState(false)
  const toast = useToast()

  const send = (q: string) => {
    const text = q.trim()
    if (!text || pending || !enabled) return
    setDraft('')
    setUnsaved(null)
    start(async () => {
      addAsked(text)
      try {
        const r = await ask(text)
        if (!r.saved) setUnsaved({ q: text, text: r.error ?? r.answer, error: !!r.error, sources: r.sources })
      } catch {
        setUnsaved({ q: text, text: `Couldn’t reach ${brand.name}. Nothing was saved. Try again.`, error: true })
      }
    })
  }

  const clear = () => start(async () => {
    try { await clearConversation(); setConfirmClear(false); setUnsaved(null); toast('Conversation cleared', 'neutral') } catch { toast.error() }
  })

  const rows = asked
  const empty = rows.length === 0 && !unsaved && !pending
  const lastUser = (i: number) => rows.slice(0, i).reverse().find((r) => r.role === 'user')?.text

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <MessageScroller className="min-h-0 flex-1" viewportClassName="px-5" contentClassName="py-4" label="Ask thread" busy={pending}>
        {empty ? (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-body text-ink-2 text-pretty">Ask about your spending, sleep, routines or code. {brand.name} reads your own records and shows what it used.</p>
            <ul aria-label="Example questions" className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <li key={e}>
                  <button
                    type="button" disabled={!enabled} onClick={() => send(e)}
                    className="min-h-10 rounded-full bg-surface-2 px-3.5 py-2 text-start text-small text-ink-2 transition-[background-color,color,scale] duration-150 hover:bg-ink/[0.07] hover:text-ink active:scale-96 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
                  >{e}</button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <MessageGroup spacing="default">
            {rows.map((m, i) => (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  {m.role === 'user' ? (
                    <QuestionBubble>{m.text}</QuestionBubble>
                  ) : (
                    <AnswerCard
                      text={m.text} sources={m.payload.sources} error={m.payload.error}
                      onRetry={m.payload.error && enabled ? () => { const q = lastUser(i); if (q) send(q) } : undefined}
                      footer={m.proposals.length ? <>{m.proposals.map((p) => <Proposal key={p.id} p={p} />)}</> : undefined}
                    />
                  )}
                  {m.channel === 'telegram' ? (
                    <span className={cn('flex items-center gap-1 text-caption text-ink-3', m.role === 'user' && 'justify-end')}>
                      <Send className="size-3" strokeWidth={1.5} aria-hidden />Telegram · {formatTime(new Date(m.at), timezone)}
                    </span>
                  ) : null}
                </MessageContent>
              </Message>
            ))}
            {unsaved ? (
              <Message from="assistant"><MessageContent><AnswerCard text={unsaved.text} sources={unsaved.sources} error={unsaved.error} onRetry={enabled ? () => send(unsaved.q) : undefined} /></MessageContent></Message>
            ) : null}
            {pending ? (
              <Message from="assistant">
                <MessageContent>
                  <div className="flex items-center gap-2 rounded-lg bg-surface px-4 py-3 shadow-1" role="status">
                    <Sparkles className="size-4 text-pill-ink" strokeWidth={1.5} aria-hidden />
                    <TextShimmer className="text-body font-medium">Reading your data…</TextShimmer>
                  </div>
                </MessageContent>
              </Message>
            ) : null}
          </MessageGroup>
        )}
      </MessageScroller>

      {thread.length ? (
        <div className="flex items-center justify-end gap-2 px-5 pb-1">
          {confirmClear ? (
            <>
              <span className="text-small text-ink-2">Delete {thread.length} messages, here and in Telegram?</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)} disabled={pending}>Keep</Button>
              <Button size="sm" onClick={clear} disabled={pending}>Delete</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)} disabled={pending}><Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden />Clear conversation</Button>
          )}
        </div>
      ) : null}

      <div className="px-3 pt-1 pb-3">
        <PromptInput
          value={draft} onValueChange={setDraft} onSubmit={send} loading={false} disabled={!enabled || pending} minRows={1}
          placeholder={enabled ? 'Ask anything about your spending, sleep, habits or code…' : 'Connect an AI model to ask questions.'}
          aria-label="Ask about your data" labels={{ send: 'Ask' }}
        />
      </div>
    </div>
  )
}
