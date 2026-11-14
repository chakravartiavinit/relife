'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { BellRing, Check, ExternalLink, Loader2, MessageSquare, Send, Unlink } from 'lucide-react'
import type { Channel } from '@/domain/notify'
import { sendTestMessage } from '@/app/actions'
import { linkTelegramAction, unlinkTelegramAction } from '@/app/people-actions'
import { Button, buttonClass } from './button'
import { Card, SystemLabel } from './card'
import { cn } from '../cn'
import { PushControl } from './push-control'

export type ChannelStats = { sent: number; held: number; skipped: number }
type Result = { tone: 'good' | 'warn' | 'bad'; text: string }

const NAME: Record<Channel, string> = { telegram: 'Telegram', push: 'push' }

/**
 * Where messages go: Telegram (on or not), push on this device, the app's own copy in Coach › History, a test that goes
 * through the outbox (once Telegram is connected), and what the last 7 days did. The test obeys the user's own settings like real messages do, and says
 * which channels took it, or when they hold it back. `push` stands in for the live push row (the gallery draws its states).
 */
export type TelegramLink = {
  /** The server's bot token is set, so a person can link their own chat to it. */
  bot: boolean
  /** This person's chat is linked (not just the owner's old typed-in chat id). */
  linked: boolean
  /** Someone who does not run the server: the bot is the owner's to set up. */
  member: boolean
  owner?: string
}

export function NotificationChannel({ telegram, stats, pushDevices, push, locked, link }: { telegram: boolean; stats: ChannelStats; pushDevices: number; push?: React.ReactNode; locked?: string; link?: TelegramLink }) {
  const [code, setCode] = useState<{ url: string; code: string } | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linking, startLink] = useTransition()
  const [unlinked, setUnlinked] = useState(false)
  const makeLink = () => startLink(async () => {
    setLinkError(null)
    const r = await linkTelegramAction().catch(() => ({ ok: false as const, error: 'Couldn’t make a link. Try again.' }))
    if (r.ok) { setCode({ url: r.url, code: r.code }); window.open(r.url, '_blank', 'noopener') } else setLinkError(r.error)
  })
  const unlink = () => startLink(async () => { const r = await unlinkTelegramAction().catch(() => null); if (r?.ok) setUnlinked(true) })
  const [devices, setDevices] = useState(pushDevices)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<Result | null>(null)
  const test = () => start(async () => {
    setResult(null)
    try {
      const r = await sendTestMessage()
      setResult(!r.ok ? { tone: 'bad', text: r.error }
        : r.result === 'sent' ? { tone: 'good', text: `Sent. Check ${r.channels.length ? r.channels.map((c) => NAME[c]).join(' and ') : 'your notifications'}.` }
        : r.result === 'held' ? { tone: 'warn', text: 'Waiting for your quiet hours to end. It arrives then.' }
        : r.result === 'failed' ? { tone: 'bad', text: 'Nothing took it. Check the Telegram bot token and chat id, or turn push off and on again, then try again.' }
        : { tone: 'warn', text: 'Not sent: Progress messages are off or at today’s limit. Change it below.' })
    } catch {
      setResult({ tone: 'bad', text: 'Couldn’t send. Nothing was changed. Try again.' })
    }
  })
  return (
    <Card as="section" aria-labelledby="channel-h" className="flex flex-col gap-4">
      <div>
        <SystemLabel>Where they go</SystemLabel>
        <h2 id="channel-h" className="mt-1.5 text-heading text-ink">Telegram, push and the app</h2>
      </div>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: telegram ? 'var(--good)' : 'var(--ink-3)' }} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">{telegram ? 'Telegram is connected' : 'Telegram is not connected'}</p>
          <p className="text-small text-ink-3">{telegram ? 'Messages go to your chat, with buttons you can tap.' : 'Connect it to get these on your phone. Everything still shows in Coach.'}</p>
        </div>
      </div>
      <div className="border-t border-divider pt-4">{push ?? <PushControl devices={pushDevices} onCount={setDevices} locked={locked} />}</div>
      <div className="flex items-start gap-3">
        <MessageSquare aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} />
        <p className="text-small text-ink-2">In the app: <Link href="/coach/history" className="font-medium text-pill-ink hover:underline">Coach › History</Link> keeps every message, even ones Telegram doesn’t get.</p>
      </div>
      {/* Only once Telegram is connected. Push has its own "Send a test to this device" in its row, and Connect Telegram below is the next step before it. */}
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
      ) : null}
      {link && telegram && link.linked && !unlinked ? (
        <Button variant="ghost" size="sm" onClick={unlink} disabled={linking} className="self-start"><Unlink className="size-4" strokeWidth={1.5} aria-hidden />Unlink this chat</Button>
      ) : null}
      {link && (!telegram || unlinked) ? (
        link.bot ? (
          <div className="flex flex-col gap-2">
            <Button onClick={makeLink} disabled={linking || !!locked} className="w-full">
              {linking ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : <BellRing className="size-4" strokeWidth={1.5} aria-hidden />}
              {code ? 'Make a new link' : 'Link Telegram'}
            </Button>
            {code ? (
              <p role="status" className="text-small text-ink-2">
                <a href={code.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-pill-ink hover:underline">Open Telegram<ExternalLink className="size-3.5" aria-hidden /></a>
                {' '}and press Start. Or send <span className="font-mono tabular-nums">/start {code.code}</span> to the bot. It works once, for 10 minutes.
              </p>
            ) : <p className="text-caption text-ink-3">Opens the bot in Telegram. Only this chat gets your messages.</p>}
            {linkError ? <p role="alert" className="text-small text-bad">{linkError}</p> : null}
          </div>
        ) : link.member ? (
          <p className="text-small text-ink-3">{link.owner ?? 'The person who runs this server'} hasn’t set up a Telegram bot yet. Ask them to add the bot token in Connections.</p>
        ) : (
          <Link href="/you/connections?peek=connector:telegram" className={buttonClass({ variant: devices > 0 ? 'secondary' : 'primary', className: 'w-full' })}><BellRing className="size-4" strokeWidth={1.5} aria-hidden />Connect Telegram</Link>
        )
      ) : null}
      {link ? null : telegram ? null : (
        <Link href="/you/connections?peek=connector:telegram" className={buttonClass({ variant: devices > 0 ? 'secondary' : 'primary', className: 'w-full' })}><BellRing className="size-4" strokeWidth={1.5} aria-hidden />Connect Telegram</Link>
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
