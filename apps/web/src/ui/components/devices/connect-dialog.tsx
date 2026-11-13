'use client'

import brand from '@relife/brand/brand.json'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, ExternalLink, Laptop, Puzzle, QrCode as QrIcon, RefreshCw, ServerOff, ShieldCheck, Smartphone } from 'lucide-react'
import {
  createPairingOffer, disconnectDevice, findWaitingByCode, offerState, waitingDevices, type Offer, type WaitingDevice,
} from '@/app/devices-actions'
import { Button } from '../button'
import { SystemLabel } from '../card'
import { Dialog, FormError } from '../forms/dialog'
import { ApproveCard } from './approve-card'
import { CodeInput } from './code-input'
import { ConnectCode } from './connect-code'
import { KIND } from './device-kind'
import { onLiveEvent } from './live-events'
import { QrCode } from './qr-code'
import { mmss, useCountdown } from './use-countdown'

const OFFER_SECONDS = 120
const MAX_ROTATIONS = 3

type Joined = { id: string; name: string; kind: keyof typeof KIND }

/**
 * "Connect a device": a QR and code for a phone or another browser (flow A), and a code box for a Mac app or extension waiting
 * to be approved (flow B). `mode="approve"` is flow B alone (no QR, no offer), for "Connect the Chrome extension".
 */
export function ConnectDialog({ open, onClose, initialCode, mode = 'all' }: { open: boolean; onClose: () => void; initialCode?: string; mode?: 'all' | 'approve' }) {
  const approveOnly = mode === 'approve'
  const [offer, setOffer] = useState<Offer | null>(null)
  const [rotations, setRotations] = useState(0)
  const [joined, setJoined] = useState<Joined | null>(null)
  const [failed, setFailed] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [review, setReview] = useState<WaitingDevice | null>(null)
  const [waiting, setWaiting] = useState<WaitingDevice[]>([])
  const [copied, setCopied] = useState(false)
  const [isMac, setIsMac] = useState(false)
  const offerRef = useRef<Offer | null>(null)
  offerRef.current = offer
  const left = useCountdown(offer?.expiresAt ?? null)
  const expired = !!offer && left === 0 && rotations >= MAX_ROTATIONS && !joined

  useEffect(() => { setIsMac(/Mac/.test(navigator.platform) && !/iPhone|iPad/.test(navigator.userAgent)) }, [])

  const make = useCallback(async (rotation: number) => {
    setFailed(false)
    try {
      setOffer(await createPairingOffer())
      setRotations(rotation)
      setJoined(null)
    } catch { setFailed(true) }
  }, [])

  // A fresh code each time the dialog opens; the old one is left to expire.
  useEffect(() => {
    if (!open) return
    setOffer(null); setJoined(null); setCode(''); setCodeError(null); setReview(null); setCopied(false)
    if (!approveOnly) void make(0)
  }, [open, make, approveOnly])

  // The code rotates on its own while the dialog is open, up to 3 times, then shows the expired state.
  useEffect(() => {
    if (open && offer && left === 0 && !joined && rotations < MAX_ROTATIONS) void make(rotations + 1)
  }, [open, offer, left, joined, rotations, make])

  // Who joined: the server tells us over SSE; a slow poll covers a stream that is not delivering.
  const check = useCallback(async () => {
    const o = offerRef.current
    if (!o) return
    const s = await offerState(o.id).catch(() => null)
    if (s?.status === 'redeemed' && s.device) setJoined({ id: s.device.id, name: s.device.name, kind: s.device.kind })
  }, [])
  const refreshWaiting = useCallback(() => { void waitingDevices().then(setWaiting).catch(() => {}) }, [])
  useEffect(() => {
    if (!open) return
    refreshWaiting()
    const off = onLiveEvent((e) => { if (e.type === 'pairing') { void check(); refreshWaiting() } })
    const poll = setInterval(() => { void check(); refreshWaiting() }, 4000)
    return () => { off(); clearInterval(poll) }
  }, [open, check, refreshWaiting])

  const find = useCallback(async (value: string) => {
    setChecking(true); setCodeError(null)
    const r = await findWaitingByCode(value)
    setChecking(false)
    if (r.ok) setReview(r.device)
    else setCodeError(r.error)
  }, [])

  // `?approve=CODE` (the Mac app and the extension open Settings → Devices with it): look the code up straight away.
  useEffect(() => {
    if (open && initialCode) { setCode(initialCode); void find(initialCode) }
  }, [open, initialCode, find])

  const codeBox = (
    <>
      <CodeInput value={code} onChange={(v) => { setCode(v); setCodeError(null) }} onComplete={(v) => void find(v)} disabled={checking} invalid={!!codeError} autoFocus />
      <div className="mt-2 min-h-5">{codeError ? <FormError message={codeError} /> : null}</div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" disabled={code.length !== 8 || checking} onClick={() => void find(code)}>{checking ? 'Looking…' : 'Find device'}</Button>
        {waiting.length ? (
          <Button size="sm" variant="ghost" onClick={() => setReview(waiting[0])}>
            <span aria-hidden className="size-1.5 rounded-full bg-pill" />{waiting.length === 1 ? `${waiting[0].name} is waiting` : `${waiting.length} devices are waiting`}
          </Button>
        ) : null}
      </div>
    </>
  )

  const phoneBlocked = !!offer && !offer.qrUrl
  const hostLabel = offer?.qrUrl ? new URL(offer.qrUrl).host : offer?.host

  return (
    <Dialog
      open={open} onClose={onClose} icon={approveOnly ? Puzzle : QrIcon} width={approveOnly ? 'max-w-[520px]' : 'max-w-[780px]'}
      title={approveOnly ? 'Connect the Chrome extension' : 'Connect a device'}
      description={approveOnly ? 'The extension shows a code. Type it here to let it in.' : 'Your phone, another browser, the Mac app or the Chrome extension.'}
    >
      {review ? (
        <div>
          <button type="button" onClick={() => { setReview(null); setCode(''); refreshWaiting() }} className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-sm text-small text-ink-3 transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">
            <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />Back
          </button>
          <ApproveCard device={review} />
          <div className="mt-4 flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      ) : approveOnly ? (
        <div>
          <ol className="flex flex-col gap-3 text-body leading-snug text-ink-2">
            <Step n={1}>Open the <b className="font-semibold text-ink">{brand.name} extension</b> in Chrome and choose <b className="font-semibold text-ink">Connect</b>.</Step>
            <Step n={2}>It shows an 8-character code. Type it below.</Step>
          </ol>
          <div className="mt-5">{codeBox}</div>
          <div className="mt-6 flex justify-end border-t border-divider pt-4"><Button onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-[252px_minmax(0,1fr)] md:gap-8">
            {/* Left: the phone's way in. */}
            <div className="flex flex-col items-center gap-3">
              {failed ? (
                <div role="alert" className="grid aspect-square w-full place-items-center rounded-[20px] bg-surface-2 p-6 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <ServerOff className="size-6 text-ink-3" strokeWidth={1.5} aria-hidden />
                    <p className="text-body font-medium text-ink">Couldn’t make a code</p>
                    <Button size="sm" onClick={() => void make(0)}><RefreshCw className="size-4" aria-hidden />Try again</Button>
                  </div>
                </div>
              ) : !offer ? (
                <div aria-hidden className="aspect-square w-full rounded-[20px] bg-surface-2" />
              ) : phoneBlocked ? (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[20px] bg-surface-2 p-5 text-center">
                  <Smartphone className="size-6 text-ink-3" strokeWidth={1.5} aria-hidden />
                  <p className="text-body font-semibold text-ink">Your phone can’t reach {offer.host}</p>
                  <p className="text-caption leading-relaxed text-ink-3">A phone needs an address it can open. Set up Tailscale on this Mac and the phone, then open {brand.name} from its <code className="font-mono">.ts.net</code> address. The Mac app and the extension work from here.</p>
                  <a href="https://tailscale.com/kb/1312/serve" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1 text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Set up Tailscale<ExternalLink className="size-3.5" aria-hidden /></a>
                </div>
              ) : joined ? (
                <div role="status" className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-[20px] bg-pill-wash p-5 text-center">
                  <span aria-hidden className="grid size-12 place-items-center rounded-full bg-good/15 text-good"><Check className="size-6" strokeWidth={2} /></span>
                  <p className="text-heading font-semibold text-ink">Connected: {joined.name}</p>
                  <p className="text-caption text-ink-3">It stays signed in until you disconnect it.</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={async () => { await disconnectDevice(joined.id); void make(0) }}>Remove</Button>
                    <Button size="sm" onClick={() => void make(0)}>Connect another</Button>
                  </div>
                </div>
              ) : (
                <div className="relative w-full">
                  <QrCode value={offer.qrUrl!} label={`QR code to connect a device to ${brand.name} at ${hostLabel}`} dim={expired} />
                  {expired ? (
                    <div className="absolute inset-0 grid place-items-center p-4">
                      <div className="flex flex-col items-center gap-2 rounded-[16px] bg-surface/90 px-4 py-3 text-center shadow-2 backdrop-blur-sm">
                        <p className="text-heading font-semibold text-ink">Code expired</p>
                        <p className="text-caption text-ink-3">Codes last 2 minutes and work once.</p>
                        <Button size="sm" variant="primary" onClick={() => void make(0)}><RefreshCw className="size-4" aria-hidden />Show new code</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {offer && !joined ? (
                <>
                  <ConnectCode code={offer.code} size="sm" struck={expired} />
                  <div className="flex w-full items-center gap-2">
                    <Button
                      variant="ghost" size="sm" disabled={expired} className="-ml-2 shrink-0"
                      onClick={async () => { await navigator.clipboard?.writeText(offer.code.replace('-', '')).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                    >
                      {copied ? <Check className="size-4 text-good" strokeWidth={2} aria-hidden /> : <Copy className="size-4" strokeWidth={1.5} aria-hidden />}{copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Countdown left={left} expired={expired} />
                  </div>
                  {expired && phoneBlocked ? <Button size="sm" variant="primary" onClick={() => void make(0)}><RefreshCw className="size-4" aria-hidden />Show new code</Button> : null}
                </>
              ) : null}
            </div>

            {/* Right: how to use it, and the way in for the Mac app and the extension. */}
            <div className="flex min-w-0 flex-col">
              <SystemLabel>Scan with your phone</SystemLabel>
              <ol className="mt-3 flex flex-col gap-3 text-body leading-snug text-ink-2">
                <Step n={1}>Open the <b className="font-semibold text-ink">Camera</b> on your phone and point it at the code.</Step>
                <Step n={2}>Tap the {brand.name} link, then <b className="font-semibold text-ink">Continue</b>. It stays signed in.</Step>
              </ol>
              {isMac && offer && !joined ? (
                <a href={offer.macLink} className="mt-3 inline-flex h-10 items-center gap-2 self-start rounded-md px-1 text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">
                  <Laptop className="size-4" strokeWidth={1.5} aria-hidden />Open in {brand.name} for Mac
                </a>
              ) : null}

              <div className="my-5 flex items-center gap-3 text-caption text-ink-3" role="separator"><span className="h-px flex-1 bg-divider" />or<span className="h-px flex-1 bg-divider" /></div>

              <p className="text-body font-medium text-ink">Connecting the Mac app or Chrome extension?</p>
              <p className="mt-0.5 mb-3 text-small text-ink-3">Type the code it shows.</p>
              {codeBox}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3 border-t border-divider pt-4">
            <p className="mr-auto flex min-w-0 items-center gap-2 text-caption text-ink-3">
              <ShieldCheck className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="truncate">Pairs with <span className="font-mono">{hostLabel ?? '…'}</span>{offer?.source === 'tailscale' ? ' · suggested: turn on tailscale serve' : ''}</span>
            </p>
            <Button onClick={onClose}>Done</Button>
          </div>
        </>
      )}
    </Dialog>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-full bg-surface-2 text-caption font-bold text-ink tabular-nums">{n}</span>
      <span>{children}</span>
    </li>
  )
}

/** "Expires in 1:52" with a bar that drains, and a text cue when it ran out. */
function Countdown({ left, expired }: { left: number | null; expired: boolean }) {
  const pct = left === null ? 100 : Math.min(100, (left / OFFER_SECONDS) * 100)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 text-small text-ink-2 tabular-nums" aria-live="off">
      <span className={expired ? "shrink-0 text-bad" : "shrink-0"}>{left === null ? 'Expires soon' : expired ? 'Expired' : `Expires in ${mmss(left)}`}</span>
      <span aria-hidden className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 shadow-inset">
        <span className="absolute inset-y-0 left-0 rounded-full bg-pill transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}
