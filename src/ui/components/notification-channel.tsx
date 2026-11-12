'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { BellRing, Check, Loader2, MessageSquare, Send } from 'lucide-react'
import { sendTestMessage } from '@/app/actions'
import { Button, buttonClass } from './button'
import { Card, SystemLabel } from './card'
import { cn } from '../cn'

export type ChannelStats = { sent: number; held: number; skipped: number }
type Result = { tone: 'good' | 'warn' | 'bad'; text: string }

/**
 * Where messages go: Telegram (on or not, with a test), the app's own copy in Coach › History, and what the
 * last 7 days did. The test goes through the same outbox as real messages, so it obeys the user's own settings
 * and says so when they hold it back.
 */
export function NotificationChannel({ telegram, stats }: { telegram: boolean; stats: ChannelStats }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<Result | null>(null)
  const test = () => start(async () => {
    setResult(null)
    try {
      const r = await sendTestMessage()
      setResult(!r.ok ? { tone: 'bad', text: r.error } : r.sent
        ? { tone: 'good', text: 'Sent. Check Telegram.' }
        : { tone: 'warn', text: 'Queued. Your Progress setting or quiet hours hold it; it arrives when they allow.' })
    } catch {
      setResult({ tone: 'bad', text: 'Couldn’t send. Nothing was changed. Try again.' })
    }
  })
  return (
    <Card as="section" aria-labelledby="channel-h" className="flex flex-col gap-4">
      <div>
        <SystemLabel>Where they go</SystemLabel>
        <h2 id="channel-h" className="mt-1.5 text-heading text-ink">Telegram and the app</h2>
      </div>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: telegram ? 'var(--good)' : 'var(--ink-3)' }} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">{telegram ? 'Telegram is connected' : 'Telegram is not connected'}</p>
          <p className="text-small text-ink-3">{telegram ? 'Messages go to your chat, with buttons you can tap.' : 'Connect it to get these on your phone. Everything still shows in Coach.'}</p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <MessageSquare aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} />
        <p className="text-small text-ink-2">In the app: <Link href="/coach/history" className="font-medium text-pill-ink hover:underline">Coach › History</Link> keeps every message, even ones Telegram doesn’t get.</p>
      </div>
      {telegram ? (
        <div className="flex flex-col gap-2">
          <Button onClick={test} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : <Send className="size-4" strokeWidth={1.5} aria-hidden />}
            {pending ? 'Sending…' : 'Send a test message'}
          </Button>
          <p role="status" aria-live="polite" className={cn('min-h-5 text-small', result?.tone === 'good' && 'text-good', result?.tone === 'warn' && 'text-warn', result?.tone === 'bad' && 'text-bad')}>
            {result ? <span className="inline-flex items-start gap-1.5">{result.tone === 'good' ? <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden /> : null}{result.text}</span> : null}
          </p>
        </div>
      ) : (
        <Link href="/you/connections?peek=connector:telegram" className={buttonClass({ variant: 'primary', className: 'w-full' })}><BellRing className="size-4" strokeWidth={1.5} aria-hidden />Connect Telegram</Link>
      )}
      <dl className="grid grid-cols-3 gap-3 border-t border-divider pt-4 text-center">
        {([['Sent', stats.sent], ['Held', stats.held], ['Dropped', stats.skipped]] as const).map(([label, n]) => (
          <div key={label}><dd className="num text-heading text-ink">{n}</dd><dt className="text-caption text-ink-3">{label}</dt></div>
        ))}
      </dl>
      <p className="-mt-2 text-center text-caption text-ink-3">Last 7 days</p>
    </Card>
  )
}
