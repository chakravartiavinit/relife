'use client'

import brand from '@relife/brand/brand.json'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Laptop, Puzzle, QrCode as QrIcon, ShieldCheck } from 'lucide-react'
import { findWaitingByCode, waitingDevices, type Offer, type WaitingDevice } from '@/app/devices-actions'
import { Button } from '../button'
import { SystemLabel } from '../card'
import { Dialog, FormError } from '../forms/dialog'
import { ApproveCard } from './approve-card'
import { CodeInput } from './code-input'
import { onLiveEvent } from './live-events'
import { OfferQr } from './offer-qr'
import { Step } from './step'

/**
 * "Connect a device": a QR and code for a phone or another browser (flow A), and a code box for a Mac app or extension waiting
 * to be approved (flow B). `mode="approve"` is flow B alone (no QR, no offer), for "Connect the Chrome extension".
 */
export function ConnectDialog({ open, onClose, initialCode, mode = 'all' }: { open: boolean; onClose: () => void; initialCode?: string; mode?: 'all' | 'approve' }) {
  const approveOnly = mode === 'approve'
  const [offer, setOffer] = useState<Offer | null>(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [review, setReview] = useState<WaitingDevice | null>(null)
  const [waiting, setWaiting] = useState<WaitingDevice[]>([])
  const [isMac, setIsMac] = useState(false)

  useEffect(() => { setIsMac(/Mac/.test(navigator.platform) && !/iPhone|iPad/.test(navigator.userAgent)) }, [])

  // Clean slate each time the dialog opens (the QR makes its own fresh code).
  useEffect(() => {
    if (open) { setOffer(null); setCode(''); setCodeError(null); setReview(null) }
  }, [open])

  const refreshWaiting = useCallback(() => { void waitingDevices().then(setWaiting).catch(() => {}) }, [])
  useEffect(() => {
    if (!open) return
    refreshWaiting()
    const off = onLiveEvent((e) => { if (e.type === 'pairing') refreshWaiting() })
    const poll = setInterval(refreshWaiting, 4000)
    return () => { off(); clearInterval(poll) }
  }, [open, refreshWaiting])

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
            <OfferQr active={open} onOffer={setOffer} />

            {/* Right: how to use it, and the way in for the Mac app and the extension. */}
            <div className="flex min-w-0 flex-col">
              <SystemLabel>Scan with your phone</SystemLabel>
              <ol className="mt-3 flex flex-col gap-3 text-body leading-snug text-ink-2">
                <Step n={1}>Open the <b className="font-semibold text-ink">Camera</b> on your phone and point it at the code.</Step>
                <Step n={2}>Tap the {brand.name} link, then <b className="font-semibold text-ink">Continue</b>. It stays signed in.</Step>
              </ol>
              {isMac && offer ? (
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
