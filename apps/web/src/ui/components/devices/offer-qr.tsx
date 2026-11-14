'use client'

import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, RefreshCw, ServerOff, Smartphone } from 'lucide-react'
import { createPairingOffer, disconnectDevice, offerState, type Offer } from '@/app/devices-actions'
import type { ReachId } from '@/core/auth/reach'
import { Button } from '../button'
import { ConnectCode } from './connect-code'
import type { KIND } from './device-kind'
import { onLiveEvent } from './live-events'
import { QrCode } from './qr-code'
import { mmss, useCountdown } from './use-countdown'

const OFFER_SECONDS = 120
const MAX_ROTATIONS = 3
type Joined = { id: string; name: string; kind: keyof typeof KIND }

/**
 * The pairing QR and the typed code under it, with the 2-minute countdown, the automatic new code (up to 3 times) and the
 * "Connected: Pixel 8" state. Shared by "Connect a device" and "Use on your phone". `choice` picks the address from the
 * server's own check (see createPairingOffer); `active` false stops it making codes (a closed dialog). `onOffer` reports the
 * current offer, for what the dialog shows next to it.
 */
export function OfferQr({ choice, active = true, onOffer }: { choice?: ReachId; active?: boolean; onOffer?: (o: Offer | null) => void }) {
  const [offer, setOffer] = useState<Offer | null>(null)
  const [rotations, setRotations] = useState(0)
  const [joined, setJoined] = useState<Joined | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const offerRef = useRef<Offer | null>(null)
  offerRef.current = offer
  const left = useCountdown(offer?.expiresAt ?? null)
  const expired = !!offer && left === 0 && rotations >= MAX_ROTATIONS && !joined

  useEffect(() => { onOffer?.(offer) }, [offer, onOffer])

  const make = useCallback(async (rotation: number) => {
    setFailed(false)
    try {
      setOffer(await createPairingOffer(choice))
      setRotations(rotation)
      setJoined(null)
    } catch { setFailed(true) }
  }, [choice])

  // A fresh code each time it becomes active (a dialog opening, another way of reaching the server picked); the old one is left to expire.
  useEffect(() => {
    if (!active) return
    setOffer(null); setJoined(null); setCopied(false)
    void make(0)
  }, [active, make])

  // The code rotates on its own while shown, up to 3 times, then shows the expired state.
  useEffect(() => {
    if (active && offer && left === 0 && !joined && rotations < MAX_ROTATIONS) void make(rotations + 1)
  }, [active, offer, left, joined, rotations, make])

  // Who joined: the server tells us over SSE; a slow poll covers a stream that is not delivering.
  const check = useCallback(async () => {
    const o = offerRef.current
    if (!o) return
    const s = await offerState(o.id).catch(() => null)
    if (s?.status === 'redeemed' && s.device) setJoined({ id: s.device.id, name: s.device.name, kind: s.device.kind })
  }, [])
  useEffect(() => {
    if (!active) return
    const off = onLiveEvent((e) => { if (e.type === 'pairing') void check() })
    const poll = setInterval(() => void check(), 4000)
    return () => { off(); clearInterval(poll) }
  }, [active, check])

  const phoneBlocked = !!offer && !offer.qrUrl
  const hostLabel = offer?.qrUrl ? new URL(offer.qrUrl).host : offer?.host

  return (
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
          <p className="text-caption leading-relaxed text-ink-3">A phone needs an address it can open. The Mac app and the extension work from here.</p>
          <Link href="/you/settings/devices/phone" className="inline-flex h-10 items-center gap-1 text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Ways to reach your phone<ExternalLink className="size-3.5" aria-hidden /></Link>
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
  )
}

/** "Expires in 1:52" with a bar that drains, and a text cue when it ran out. */
function Countdown({ left, expired }: { left: number | null; expired: boolean }) {
  const pct = left === null ? 100 : Math.min(100, (left / OFFER_SECONDS) * 100)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 text-small text-ink-2 tabular-nums" aria-live="off">
      <span className={expired ? 'shrink-0 text-bad' : 'shrink-0'}>{left === null ? 'Expires soon' : expired ? 'Expired' : `Expires in ${mmss(left)}`}</span>
      <span aria-hidden className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 shadow-inset">
        <span className="absolute inset-y-0 left-0 rounded-full bg-pill transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}
