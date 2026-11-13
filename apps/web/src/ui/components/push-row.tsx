import Link from 'next/link'
import { Bell, BellOff, BellRing, Check, Loader2, Lock, Send, Smartphone } from 'lucide-react'
import type { PushState } from '@/domain/push'
import { cn } from '../cn'
import { Button } from './button'

export type PushResult = { tone: 'good' | 'warn' | 'bad'; text: string }

const PHONE_PAGE = '/you/settings/devices/phone'

const COPY: Record<PushState, { icon: typeof Bell; title: string; body: string }> = {
  unsupported: { icon: BellOff, title: 'This browser can’t do push', body: 'Use Chrome, Edge, Firefox or Safari 16.4 or later to get notifications on this device.' },
  insecure: { icon: Lock, title: 'Open it from its https address', body: 'Push needs https. Open the app from its https address on this device, then turn it on here.' },
  'ios-install': { icon: Smartphone, title: 'Add it to your Home Screen first', body: 'On iPhone and iPad, push works from the Home Screen app (iOS 16.4 or later). Share, then Add to Home Screen, then open it from there.' },
  blocked: { icon: BellOff, title: 'Blocked in this browser', body: 'Notifications were turned off for this site. Allow them in your browser’s site settings, then come back.' },
  off: { icon: Bell, title: 'Push is off on this device', body: 'Get reminders and alerts as notifications here, with buttons you can tap.' },
  on: { icon: BellRing, title: 'Push is on for this device', body: 'Messages arrive here as notifications, with buttons you can tap.' },
}

/**
 * The "Push on this device" row in You › Notifications and on the phone page: what this browser can do about push right now,
 * in six states, with the one action that fits. It only draws; PushControl reads the browser and runs the actions.
 */
export function PushRow({ state, devices, ios, pending, result, onTurnOn, onTest, onTurnOff }: {
  state: PushState
  /** How many devices get push, this one included. */
  devices: number
  /** iPhone or iPad: no action buttons, Home Screen app only. */
  ios?: boolean
  pending?: 'on' | 'test' | 'off' | null
  result?: PushResult | null
  onTurnOn?: () => void
  onTest?: () => void
  onTurnOff?: () => void
}) {
  const { icon: Icon, title, body } = COPY[state]
  const link = state === 'insecure' || state === 'ios-install'
  return (
    <div className="flex flex-col gap-3" data-push-state={state}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', state === 'on' ? 'text-good' : state === 'blocked' ? 'text-warn' : 'text-ink-3')} strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">{title}</p>
          <p className="text-small text-ink-3">{body}</p>
          {ios && (state === 'on' || state === 'off') ? <p className="mt-1 text-small text-ink-3">On iPhone there are no action buttons: a tap opens the app. Notifications reach the Home Screen app only, and stop if you remove it.</p> : null}
          {devices > 0 ? <p className="mt-1 text-caption text-ink-3 tabular-nums">Push on {devices} {devices === 1 ? 'device' : 'devices'}</p> : null}
        </div>
      </div>
      {link ? <Link href={PHONE_PAGE} className="inline-flex h-10 items-center self-start rounded-md px-1 text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Ways to reach your phone</Link> : null}
      {state === 'off' ? (
        <Button variant="primary" onClick={onTurnOn} disabled={!!pending} className="w-full">
          {pending === 'on' ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : <Bell className="size-4" strokeWidth={1.5} aria-hidden />}
          {pending === 'on' ? 'Asking…' : 'Turn on'}
        </Button>
      ) : null}
      {state === 'on' ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onTest} disabled={!!pending} className="min-w-0 flex-1">
            {pending === 'test' ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : <Send className="size-4" strokeWidth={1.5} aria-hidden />}
            {pending === 'test' ? 'Sending…' : 'Send a test to this device'}
          </Button>
          <Button variant="ghost" onClick={onTurnOff} disabled={!!pending}>{pending === 'off' ? 'Turning off…' : 'Turn off'}</Button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className={cn('min-h-5 text-small', result?.tone === 'good' && 'text-good', result?.tone === 'warn' && 'text-warn', result?.tone === 'bad' && 'text-bad')}>
        {result ? <span className="inline-flex items-start gap-1.5">{result.tone === 'good' ? <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden /> : null}{result.text}</span> : null}
      </p>
    </div>
  )
}
