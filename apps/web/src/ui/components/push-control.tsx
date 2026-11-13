'use client'

import { useCallback, useEffect, useState } from 'react'
import { pushPublicKey, pushSubscribed, removePushSubscription, savePushSubscription, sendTestPush } from '@/app/push-actions'
import { pushState, type PushState } from '@/domain/push'
import { Skeleton } from './card'
import { PushRow, type PushResult } from './push-row'

/** The browser's VAPID key as the bytes `subscribe` wants. */
function keyBytes(b64: string) {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

type Seen = { state: PushState; ios: boolean }

async function look(): Promise<Seen> {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  let subscribed = false
  if (supported && window.isSecureContext) {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
    // The browser can hold a subscription the server already dropped (the push service said it was gone): that is "off".
    subscribed = !!sub && (await pushSubscribed(sub.endpoint).catch(() => false))
  }
  return {
    ios,
    state: pushState({ secure: window.isSecureContext, ios, standalone, supported, permission: supported ? Notification.permission : 'default', subscribed }),
  }
}

/**
 * Push on this browser: reads what it can do, asks for permission inside the click (iOS requires that), subscribes, and tells the
 * server. `devices` is how many devices already get push, for the count under the row.
 */
export function PushControl({ devices, onCount }: { devices: number; onCount?: (n: number) => void }) {
  const [seen, setSeen] = useState<Seen | null>(null)
  const [count, setCountState] = useState(devices)
  const setCount = (f: (n: number) => number) => setCountState((n) => { const next = f(n); onCount?.(next); return next })
  const [pending, setPending] = useState<'on' | 'test' | 'off' | null>(null)
  const [result, setResult] = useState<PushResult | null>(null)
  const refresh = useCallback(() => { void look().then(setSeen).catch(() => setSeen({ state: 'unsupported', ios: false })) }, [])
  useEffect(refresh, [refresh])

  if (!seen) return <Skeleton className="h-24" />

  const turnOn = async () => {
    setResult(null); setPending('on')
    try {
      const permission = await Notification.requestPermission() // first, so the click still counts as the user's tap
      if (permission !== 'granted') { setResult({ tone: 'warn', text: 'Notifications were not allowed on this device.' }); refresh(); return }
      const reg = await navigator.serviceWorker.ready
      const key = await pushPublicKey()
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
      const saved = await savePushSubscription(sub.toJSON())
      if (!saved.ok) { setResult({ tone: 'bad', text: saved.error }); return }
      setCount((n) => n + 1)
      setResult({ tone: 'good', text: 'On. Send a test to see it arrive.' })
      refresh()
    } catch {
      setResult({ tone: 'bad', text: 'Couldn’t turn on push. Nothing was changed. Try again.' })
    } finally { setPending(null) }
  }

  const test = async () => {
    setResult(null); setPending('test')
    try {
      const r = await sendTestPush()
      setResult(r.ok ? { tone: 'good', text: 'Sent. It should arrive in a moment.' } : { tone: 'bad', text: r.error })
    } catch { setResult({ tone: 'bad', text: 'Couldn’t send. Try again.' }) } finally { setPending(null) }
  }

  const turnOff = async () => {
    setResult(null); setPending('off')
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe() }
      setCount((n) => Math.max(0, n - 1))
      setResult({ tone: 'good', text: 'Off for this device.' })
      refresh()
    } catch { setResult({ tone: 'bad', text: 'Couldn’t turn off push. Try again.' }) } finally { setPending(null) }
  }

  return <PushRow state={seen.state} ios={seen.ios} devices={count} pending={pending} result={result} onTurnOn={() => void turnOn()} onTest={() => void test()} onTurnOff={() => void turnOff()} />
}
