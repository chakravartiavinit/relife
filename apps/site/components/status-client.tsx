'use client'

import { Check, Copy, Mail, MessageCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

async function post(path: string, token: string) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
  if (!res.ok) throw new Error(String(res.status))
}

/** Confirms on load with a tiny POST (link scanners don't run JS, so they don't confirm). Without JS the page shows a button. */
export function ConfirmOnLoad({ token }: { token: string }) {
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  const run = () => {
    setFailed(false)
    post('/api/waitlist/confirm', token).then(() => router.refresh()).catch(() => setFailed(true))
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div role="status" aria-live="polite">
      <p className="sub">{failed ? "Couldn't confirm right now." : 'Confirming your spot…'}</p>
      {failed ? <button type="button" className="btn ink" style={{ marginTop: 16 }} onClick={run}>Try again</button> : null}
    </div>
  )
}

export function ReferralBox({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false)
  const text = `I'm on the ${name} waitlist. It turns your real data into daily quests and XP.`
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* the field is selectable as a fallback */ }
  }
  const enc = encodeURIComponent
  return (
    <div className="refbox">
      <label htmlFor="ref-url">Your referral link</label>
      <div className="row">
        <input id="ref-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn secondary" onClick={copy} aria-live="polite">{copied ? <><Check size={16} />Copied</> : <><Copy size={16} />Copy</>}</button>
      </div>
      <div className="share">
        <a className="btn secondary sm" href={`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`} target="_blank" rel="noopener noreferrer">Share on X</a>
        <a className="btn secondary sm" href={`https://wa.me/?text=${enc(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} />WhatsApp</a>
        <a className="btn secondary sm" href={`mailto:?subject=${enc(`Join me on the ${name} waitlist`)}&body=${enc(`${text}\n${url}`)}`}><Mail size={15} />Email</a>
      </div>
    </div>
  )
}

export function LeaveButton({ token }: { token: string }) {
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const stay = useRef<HTMLButtonElement>(null)
  const opened = useRef(false)
  const id = useId()

  // Focus moves into the confirmation on the safe choice, and back to the link that opened it when it closes.
  useEffect(() => {
    if (ask) { opened.current = true; stay.current?.focus() }
    else if (opened.current) { opened.current = false; trigger.current?.focus() }
  }, [ask])

  const leave = async () => {
    setBusy(true); setFailed(false)
    try { await post('/api/waitlist/leave', token); router.replace(`/w/${encodeURIComponent(token)}?left=1`); router.refresh() } catch { setFailed(true); setBusy(false) }
  }
  if (!ask) return <button ref={trigger} type="button" onClick={() => setAsk(true)}>Leave the waitlist</button>
  return (
    <div className="confirm" role="alertdialog" aria-labelledby={id} onKeyDown={(e) => { if (e.key === 'Escape' && !busy) setAsk(false) }}>
      <p id={id}>This deletes your email and your place in line. Leave?</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn ink sm" onClick={leave} disabled={busy} style={{ textDecoration: 'none', color: '#fff' }}>{busy ? 'Leaving…' : 'Yes, leave'}</button>
        <button ref={stay} type="button" className="btn secondary sm" onClick={() => setAsk(false)} style={{ textDecoration: 'none' }}>Stay</button>
      </div>
      {failed ? <p className="ink-2" role="alert">Couldn&apos;t leave right now. Try again.</p> : null}
    </div>
  )
}
