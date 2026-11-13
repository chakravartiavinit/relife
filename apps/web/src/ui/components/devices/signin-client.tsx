'use client'

import brand from '@relife/brand/brand.json'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, Loader2, ShieldAlert, Terminal } from 'lucide-react'
import type { PairPoll, PairRequestStarted } from '@relife/contract'
import { browserDeviceName, isPhoneUa } from '@/core/auth/names'
import { Button } from '../button'
import { SystemLabel } from '../card'
import { FormError } from '../forms/dialog'
import { CodeInput } from './code-input'
import { ConnectCode } from './connect-code'
import { postJson, safeNext } from './pair-api'
import { QrCode } from './qr-code'
import { mmss, useCountdown } from './use-countdown'

type State =
  | { s: 'idle' }
  | { s: 'waiting'; req: PairRequestStarted }
  | { s: 'ended'; why: 'denied' | 'expired' }
  | { s: 'locked'; until: number }

const REASON: Record<string, string> = {
  revoked: `This device was disconnected from ${brand.name}.`,
  expired: 'Your sign-in ended.',
}

/**
 * `/signin` runs flow B itself (plan §3): this browser shows a code (and a QR for a signed-in phone), and a screen that is
 * signed in approves it in Settings → Devices. Or type a code from a signed-in screen (flow A). There is no password.
 */
export function SigninClient({ next, reason, container }: { next?: string; reason?: string; /** Running in Docker: the code comes from `docker compose exec`, not `npm run signin`. */ container?: boolean }) {
  const [st, setSt] = useState<State>({ s: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const target = safeNext(next)

  const start = useCallback(async () => {
    setBusy(true); setError(null)
    const ua = navigator.userAgent
    const r = await postJson<PairRequestStarted>('/api/v1/pair/requests', { kind: isPhoneUa(ua) ? 'phone' : 'browser', name: browserDeviceName(ua) })
    setBusy(false)
    if (r.ok) setSt({ s: 'waiting', req: r.data })
    else if (r.error.code === 'rate_limited') setSt({ s: 'locked', until: Date.now() + (r.retryAfter ?? 60) * 1000 })
    else setError(r.error.message)
  }, [])

  // Poll every 2 s; the answer sets the cookie on this very response.
  const req = st.s === 'waiting' ? st.req : null
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!req) return
    let stop = false
    let wait = req.interval * 1000
    const tick = async () => {
      const r = await postJson<PairPoll>(`/api/v1/pair/requests/${req.id}/poll`, { pollSecret: req.pollSecret })
      if (stop) return
      if (r.ok) {
        if (r.data.status === 'approved') { location.assign(target); return }
        if (r.data.status === 'denied' || r.data.status === 'expired') { setSt({ s: 'ended', why: r.data.status }); return }
      } else if (r.error.code === 'rate_limited') wait = Math.max(wait, (r.retryAfter ?? 2) * 1000) // slow_down: back off
      else if (r.error.code === 'not_found') { setSt({ s: 'ended', why: 'expired' }); return }
      timer.current = setTimeout(tick, wait)
    }
    timer.current = setTimeout(tick, wait)
    return () => { stop = true; clearTimeout(timer.current) }
  }, [req, target])

  const redeem = async (value: string) => {
    setBusy(true); setError(null)
    const r = await postJson<unknown>('/api/v1/pair/redeem', { code: value, name: browserDeviceName(navigator.userAgent) })
    setBusy(false)
    if (r.ok) { location.assign(target); return }
    if (r.error.code === 'rate_limited') setSt({ s: 'locked', until: Date.now() + (r.retryAfter ?? 600) * 1000 })
    else setError(r.error.message)
  }

  return (
    <div>
      {reason && REASON[reason] && st.s === 'idle' ? (
        <p role="status" className="mb-5 flex items-start gap-2.5 rounded-[12px] bg-warn/10 px-3.5 py-3 text-small text-ink">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} aria-hidden />{REASON[reason]}
        </p>
      ) : null}

      {st.s === 'waiting' ? <Waiting req={st.req} onCancel={() => setSt({ s: 'idle' })} /> : st.s === 'locked' ? <Locked until={st.until} onBack={() => { setSt({ s: 'idle' }); setCode('') }} /> : (
        <>
          <h1 className="font-display text-title leading-tight font-extrabold tracking-[-0.03em] text-ink">{st.s === 'ended' ? (st.why === 'denied' ? 'It was turned down' : 'That request expired') : `Connect to your ${brand.name}`}</h1>
          <p className="mt-2 text-body leading-relaxed text-ink-3">
            {st.s === 'ended' ? 'Start again whenever you are ready.' : `This browser shows a code. Approve it from a screen that is already signed in: ${brand.name} on your Mac or phone, in Settings → Devices.`}
          </p>
          {typing ? (
            <div className="mt-5">
              <p className="mb-2 text-small font-medium text-ink-2">Type the code from Connect a device</p>
              <CodeInput value={code} onChange={(v) => { setCode(v); setError(null) }} onComplete={(v) => void redeem(v)} disabled={busy} invalid={!!error} autoFocus />
              <div className="mt-3 min-h-5"><FormError message={error ?? undefined} /></div>
              <Button variant="primary" size="lg" className="mt-3 w-full" disabled={busy || code.length !== 8} onClick={() => void redeem(code)}>{busy ? 'Connecting…' : 'Connect'}</Button>
              <button type="button" onClick={() => { setTyping(false); setError(null) }} className="mt-2 flex h-11 w-full items-center justify-center rounded-md text-body font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">Show a code here instead</button>
            </div>
          ) : (
            <div className="mt-5">
              <div className="mb-3"><FormError message={error ?? undefined} /></div>
              <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => void start()}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{busy ? 'Asking…' : st.s === 'ended' ? 'Try again' : 'Connect this browser'}</Button>
              <button type="button" onClick={() => { setTyping(true); setError(null) }} className="mt-2 flex h-11 w-full items-center justify-center rounded-md text-body font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">I have a code</button>
            </div>
          )}
        </>
      )}

      <p className="mt-6 flex items-start gap-2.5 border-t border-divider pt-4 text-caption leading-relaxed text-ink-3">
        <Terminal className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        {container
          ? <span>First time? Run <code className="rounded-xs bg-surface-2 px-1 font-mono text-caption">docker compose exec web relife signin</code> on the server for a code.</span>
          : <span>Signing in on this Mac? Use the address in your terminal: run <code className="rounded-xs bg-surface-2 px-1 font-mono text-caption">npm run signin</code>.</span>}
      </p>
    </div>
  )
}

function Waiting({ req, onCancel }: { req: PairRequestStarted; onCancel: () => void }) {
  const left = useCountdown(req.expiresAt)
  return (
    <div role="status" aria-live="polite">
      <SystemLabel>Waiting for approval</SystemLabel>
      <h1 className="mt-2 font-display text-title leading-tight font-extrabold tracking-[-0.03em] text-ink">Approve this code in {brand.name}</h1>
      <p className="mt-1.5 text-body leading-relaxed text-ink-3">Open {brand.name} on a device that’s signed in, go to Settings → Devices, and check this code. Or scan it with a signed-in phone.</p>
      <div className="mt-5 flex flex-col items-center gap-4 rounded-[16px] bg-surface-2 p-4">
        <ConnectCode code={req.userCode} size="lg" />
        <QrCode value={req.approveUrl} label="QR code that opens the approval page" className="w-44" />
      </div>
      <p className="mt-4 flex items-center justify-center gap-2 text-small text-ink-3 tabular-nums">
        <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} aria-hidden />Waiting{left !== null ? ` · expires in ${mmss(left)}` : ''}
      </p>
      <Button className="mt-3 w-full" onClick={onCancel}>Cancel</Button>
    </div>
  )
}

function Locked({ until, onBack }: { until: number; onBack: () => void }) {
  const left = useCountdown(new Date(until).toISOString())
  return (
    <div role="alert">
      <span aria-hidden className="grid size-12 place-items-center rounded-full bg-warn/12 text-warn"><Clock className="size-6" strokeWidth={1.5} /></span>
      <h1 className="mt-4 font-display text-title leading-tight font-extrabold tracking-[-0.03em] text-ink">Too many tries</h1>
      <p className="mt-1.5 text-body text-ink-3 tabular-nums">{left ? `Try again in ${mmss(left)}.` : 'You can try again now.'}</p>
      <Button className="mt-5 w-full" disabled={!!left} onClick={onBack}>Back</Button>
    </div>
  )
}
