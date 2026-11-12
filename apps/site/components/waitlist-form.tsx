'use client'

import brand from '@relife/brand/brand.json'
import { Check } from 'lucide-react'
import Script from 'next/script'
import { useActionState, useEffect, useId, useState } from 'react'
import { joinAction, type JoinState } from '@/app/actions'

const AREAS: [string, string, string][] = [
  ['health', 'Health', 'var(--cat-health)'], ['mind', 'Mind', 'var(--cat-mind)'], ['skills', 'Skills', 'var(--cat-skills)'],
  ['wealth', 'Wealth', 'var(--cat-wealth)'], ['hobbies', 'Hobbies', 'var(--cat-hobbies)'], ['relationships', 'People', 'var(--cat-relationships)'],
]
const PLATFORMS: [string, string][] = [['mac', 'Mac'], ['chrome', 'Chrome'], ['iphone', 'iPhone'], ['android', 'Android'], ['web', 'Web'], ['selfhost', 'Self-host']]
const MESSAGES: Partial<Record<JoinState['status'], string>> = {
  invalid: 'Enter an email like name@example.com',
  disposable: 'Please use an email you keep',
  rate_limited: 'Too many tries. Try again in a few minutes.',
  error: "Couldn't join right now. Try again.",
}
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
const TURNSTILE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

function Chips({ name, options, legend }: { name: string; options: [string, string, string?][]; legend: string }) {
  const [on, setOn] = useState<string[]>([])
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="wl-group">
      <p id={id}>{legend}</p>
      <div className="chips">
        {options.map(([value, label, color]) => (
          <button key={value} type="button" className="chip" aria-pressed={on.includes(value)} onClick={() => setOn((s) => (s.includes(value) ? s.filter((v) => v !== value) : [...s, value]))}>
            {color ? <span className="dot" style={{ '--c': color } as React.CSSProperties} /> : null}
            {label}
          </button>
        ))}
      </div>
      {on.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </div>
  )
}

/**
 * The one form island. Works without JavaScript (a server action form); useActionState adds the inline states.
 * `expanded` shows the optional chips straight away (the final CTA); in the hero they reveal after a valid email.
 */
export function WaitlistForm({ expanded = false, tone = 'hero' }: { expanded?: boolean; tone?: 'hero' | 'cta' }) {
  const id = useId()
  const [state, action, pending] = useActionState<JoinState, FormData>(joinAction, { status: 'idle' })
  const [email, setEmail] = useState('')
  const [seen, setSeen] = useState<JoinState>()
  const [attr, setAttr] = useState<Record<string, string>>({})

  // Referral code and campaign tags travel with the form. The page itself stays static.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const next: Record<string, string> = {}
    const ref = q.get('ref') ?? sessionStorage.getItem('relife:ref')
    if (ref) { next.ref = ref; sessionStorage.setItem('relife:ref', ref) }
    for (const [k, v] of q) if (k.startsWith('utm_')) next[k] = v
    const host = document.referrer ? new URL(document.referrer).hostname : ''
    next.source = q.get('utm_source') || (host && host !== window.location.hostname ? host : '')
    setAttr(next)
  }, [])

  const done = state.status === 'done' && seen !== state
  const open = expanded || looksLikeEmail(email)
  const error = MESSAGES[state.status]
  const errId = `${id}-err`

  if (done) {
    return (
      <div className="wl" id={tone === 'hero' ? 'waitlist' : undefined}>
        <div className="wl-done" role="status">
          <span className="ic"><Check size={22} strokeWidth={2.5} /></span>
          <div>
            <h3>Check your inbox to confirm your spot.</h3>
            <p>We sent a link to {state.email}.</p>
            <button type="button" onClick={() => setSeen(state)}>Wrong email? Change it</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="wl" id={tone === 'hero' ? 'waitlist' : undefined} action={action} noValidate>
      <div className="wl-row">
        <div className="wl-field">
          <label htmlFor={`${id}-email`} className="sr-only">Email</label>
          <input
            id={`${id}-email`} name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@email.com"
            className="wl-input" value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={state.status === 'invalid' || state.status === 'disposable' ? true : undefined} aria-describedby={error ? errId : undefined}
          />
        </div>
        <button type="submit" className="btn ink xl" disabled={pending} style={{ minWidth: 188 }}>{pending ? 'Joining…' : 'Join the waitlist'}</button>
      </div>
      <p id={errId} className={`wl-msg${error ? ' err' : ''}`} role={error ? 'alert' : undefined}>{error}</p>

      <div className="wl-more" data-open={open}>
        <div inert={!open}>
          <Chips name="interests" legend="What do you want to level up?" options={AREAS} />
          <Chips name="platforms" legend="Where will you use it?" options={PLATFORMS.map(([v, l]) => [v, l])} />
        </div>
      </div>

      {/* Honeypot: people never see or tab to it */}
      <div className="hp" aria-hidden><label>Company<input name="company" tabIndex={-1} autoComplete="off" /></label></div>
      {Object.entries(attr).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {TURNSTILE_KEY ? (<><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" /><div className="cf-turnstile" data-sitekey={TURNSTILE_KEY} /></>) : null}

      <p className="wl-consent">We&apos;ll email you about {brand.name}&apos;s launch. Nothing else. Leave any time. <a href="/privacy">Privacy</a></p>
    </form>
  )
}
