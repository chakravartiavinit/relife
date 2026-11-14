'use client'

import brand from '@relife/brand/brand.json'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, UserPlus } from 'lucide-react'
import type { PairJoinResult } from '@relife/contract'
import { Button } from '../button'
import { FormError } from '../forms/dialog'
import { Input } from '../form'
import { postJson } from './pair-api'

type Step = 'loading' | 'name' | 'invalid'

/**
 * `/join`: where an invite link lands. The secret is in the URL fragment (`#s=…`), so it never reaches a log or a link
 * preview, and opening the link does nothing by itself: the Join tap makes the person. It shows the address, not the
 * owner's name or anything stored here: a stranger with the link learns nothing. The time zone comes from the browser.
 */
export function JoinClient() {
  const [step, setStep] = useState<Step>('loading')
  const [secret, setSecret] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [zone, setZone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const host = typeof location === 'undefined' ? '' : location.host

  useEffect(() => {
    const s = new URLSearchParams(location.hash.slice(1)).get('s')
    setSecret(s)
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? '')
    setStep(s ? 'name' : 'invalid')
  }, [])

  const join = async () => {
    if (!secret || !name.trim()) return
    setBusy(true); setError(null)
    const r = await postJson<PairJoinResult>('/api/v1/pair/join', { secret, name: name.trim(), timezone: zone || undefined })
    setBusy(false)
    if (!r.ok) {
      setError(r.error.code === 'rate_limited' ? `Too many tries. Try again in ${Math.max(1, Math.ceil((r.retryAfter ?? 600) / 60))} min.` : r.error.message)
      return
    }
    history.replaceState(null, '', location.pathname) // the secret is spent; don't leave it in the address bar
    location.assign(r.data.next)
  }

  if (step === 'loading') return <div aria-busy className="h-72" />

  if (step === 'invalid') {
    return (
      <div>
        <span aria-hidden className="grid size-12 place-items-center rounded-[14px] bg-pill-wash text-pill-ink"><UserPlus className="size-6" strokeWidth={1.5} /></span>
        <h1 className="mt-4 font-display text-title leading-tight font-extrabold tracking-[-0.03em] text-ink">This invite link is incomplete</h1>
        <p className="mt-1.5 text-body leading-relaxed text-ink-3">Open the whole link the person who runs this {brand.name} sent you. It ends with a long code after a #.</p>
        <Link href="/signin" className="mt-5 flex h-11 items-center justify-center rounded-md text-body font-medium text-ink-2 transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">I already have an account here</Link>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void join() }}>
      <span aria-hidden className="grid size-12 place-items-center rounded-[14px] bg-pill-wash text-pill-ink"><UserPlus className="size-6" strokeWidth={1.5} /></span>
      <h1 className="mt-4 font-display text-title leading-tight font-extrabold tracking-[-0.03em] text-ink">Join {brand.name} at <span className="inline-block max-w-full [overflow-wrap:anywhere]">{host}</span></h1>
      <p className="mt-2 text-body leading-relaxed text-ink-3">You were invited to share this server. You get your own space: your data, your keys and your devices stay yours.</p>

      <div className="mt-5 rounded-[16px] bg-surface-2 p-4">
        <label htmlFor="join-name" className="text-caption font-medium text-ink-3">What should we call you?</label>
        <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus autoComplete="given-name" placeholder="Your name" className="mt-1.5 h-11" />
        {zone ? <p className="mt-2 text-caption text-ink-3">Time zone: <span className="tabular-nums text-ink-2">{zone}</span> (from this browser)</p> : null}
      </div>
      <p className="mt-3 flex items-start gap-2 text-small text-ink-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={1.5} aria-hidden />The person who runs this server can read everything stored on it, including connector keys. Don’t connect anything you wouldn’t tell them.</p>
      <div className="mt-3"><FormError message={error ?? undefined} /></div>

      <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={busy || !name.trim()}>{busy ? 'Joining…' : 'Join'}</Button>
      <Link href="/signin" className="mt-2 flex h-11 items-center justify-center rounded-md text-body font-medium text-ink-2 transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">Not now</Link>
    </form>
  )
}
