'use client'

import brand from '@relife/brand/brand.json'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, KeyRound, Share, ShieldCheck, SquarePlus } from 'lucide-react'
import type { PairRedeemResult } from '@relife/contract'
import { browserDeviceName, isPhoneUa } from '@/core/auth/names'
import { Button } from '../button'
import { FormError } from '../forms/dialog'
import { Input } from '../form'
import { CapsuleMark } from '../logo'
import { CodeInput } from './code-input'
import { postJson, safeNext } from './pair-api'
import { DeviceTile } from './device-kind'

type Step = 'loading' | 'confirm' | 'code' | 'done'

/**
 * `/pair`: where a scanned QR code lands. The secret is in the URL fragment (`#s=…`), so it never reaches a log or a link
 * preview, and opening the link does nothing by itself: the Continue tap redeems it. Without a fragment it is the
 * "Enter a code" page (the 8 characters from the dashboard), which is also how an installed home-screen app signs in.
 * It shows the address, not the owner's name: a stranger with the link learns nothing about who lives here.
 */
export function PairClient({ next }: { next?: string }) {
  const [step, setStep] = useState<Step>('loading')
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const host = typeof location === 'undefined' ? '' : location.host

  useEffect(() => {
    const s = new URLSearchParams(location.hash.slice(1)).get('s')
    setSecret(s)
    setName(browserDeviceName(navigator.userAgent))
    setPhone(isPhoneUa(navigator.userAgent))
    setStandalone(matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
    setStep(s ? 'confirm' : 'code')
  }, [])

  const redeem = async (body: { secret?: string; code?: string }) => {
    setBusy(true); setError(null)
    const r = await postJson<PairRedeemResult>('/api/v1/pair/redeem', { ...body, name: name.trim() || undefined })
    setBusy(false)
    if (!r.ok) {
      setError(r.error.code === 'rate_limited' ? `Too many tries. Try again in ${Math.max(1, Math.ceil((r.retryAfter ?? 600) / 60))} min.` : r.error.message)
      return
    }
    history.replaceState(null, '', location.pathname) // the secret is spent; don't leave it in the address bar
    if (standalone) { location.assign(safeNext(next ?? r.data.next)); return }
    setStep('done')
  }

  if (step === 'loading') return <div aria-busy className="h-72" />

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center text-center">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-good/15 text-good"><Check className="size-6" strokeWidth={2} /></span>
        <h1 className="mt-4 font-display text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-ink">You’re connected</h1>
        <p className="mt-1.5 text-[14px] text-ink-3">{name} stays signed in until you disconnect it in Settings → Devices.</p>
        {phone ? (
          <div className="mt-5 w-full rounded-[16px] bg-surface-2 p-4 text-start">
            <p className="text-[14px] font-semibold text-ink">Add {brand.name} to your Home Screen</p>
            <ol className="mt-3 flex flex-col gap-3 text-[13.5px] text-ink-2">
              <li className="flex items-center gap-3"><span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface text-ink-2 shadow-1"><Share className="size-4" strokeWidth={1.5} /></span>Tap Share in Safari’s toolbar.</li>
              <li className="flex items-center gap-3"><span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface text-ink-2 shadow-1"><SquarePlus className="size-4" strokeWidth={1.5} /></span>Choose Add to Home Screen. The app opens signed in.</li>
            </ol>
          </div>
        ) : null}
        <Link href={safeNext(next)} className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-ink px-5 text-[15px] font-medium text-bg transition-[scale,filter] duration-150 ease-out-quint hover:brightness-110 active:scale-[0.96]">Open {brand.name}</Link>
      </div>
    )
  }

  if (step === 'confirm' && secret) {
    return (
      <div>
        <div className="flex items-center justify-center gap-3" aria-hidden>
          <DeviceTile kind={phone ? 'phone' : 'browser'} className="size-14 rounded-[16px] bg-surface-2 text-ink" />
          <span className="h-px w-10 border-t-2 border-dotted border-pill" />
          <span className="grid size-14 place-items-center rounded-[16px] bg-surface-2"><CapsuleMark className="size-9" /></span>
        </div>
        <h1 className="mt-5 text-center font-display text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-ink">Sign in to {brand.name} at <span className="inline-block max-w-full [overflow-wrap:anywhere]">{host}</span>?</h1>
        <p className="mt-2 text-center text-[14px] leading-relaxed text-ink-3">You opened a link from your {brand.name}. Nothing happens until you continue.</p>

        <div className="mt-5 rounded-[16px] bg-surface-2 p-4">
          <label htmlFor="device-name" className="text-[12.5px] font-medium text-ink-3">Name this {phone ? 'phone' : 'browser'}</label>
          <Input id="device-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1.5 h-11" />
        </div>
        <p className="mt-3 flex items-start gap-2 text-[13px] text-ink-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={1.5} aria-hidden />It stays signed in. Remove it any time in Settings → Devices.</p>
        <div className="mt-3"><FormError message={error ?? undefined} /></div>

        <Button variant="primary" size="lg" className="mt-5 w-full" disabled={busy} onClick={() => void redeem({ secret })}>{busy ? 'Connecting…' : `Continue`}</Button>
        <Link href="/signin" className="mt-2 flex h-11 items-center justify-center rounded-md text-[14px] font-medium text-ink-2 transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">Not now</Link>
      </div>
    )
  }

  return (
    <div>
      <span aria-hidden className="grid size-12 place-items-center rounded-[14px] bg-pill-wash text-pill-ink"><KeyRound className="size-6" strokeWidth={1.5} /></span>
      <h1 className="mt-4 font-display text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-ink">Enter a code</h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">On a screen that’s signed in to {brand.name}, open Settings → Devices → Connect a device and type the 8-character code it shows.</p>
      <CodeInput value={code} onChange={(v) => { setCode(v); setError(null) }} onComplete={(v) => void redeem({ code: v })} disabled={busy} invalid={!!error} autoFocus className="mt-5" />
      <div className="mt-3 min-h-5"><FormError message={error ?? undefined} /></div>
      <Button variant="primary" size="lg" className="mt-3 w-full" disabled={busy || code.length !== 8} onClick={() => void redeem({ code })}>{busy ? 'Connecting…' : 'Connect'}</Button>
      <Link href="/signin" className="mt-2 flex h-11 items-center justify-center rounded-md text-[14px] font-medium text-ink-2 transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">Approve from another device instead</Link>
    </div>
  )
}
