'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, opts: { sitekey: string }): string; reset(id: string): void; remove(id: string): void }
  }
}

/**
 * Cloudflare Turnstile, rendered explicitly so it also works when the form remounts ("Wrong email? Change it").
 * The widget adds a `cf-turnstile-response` field to the surrounding form. A token is single-use, so `resetKey`
 * (the last submit result) asks for a fresh one after every attempt that did not finish the signup.
 */
export function Turnstile({ siteKey, resetKey }: { siteKey: string; resetKey: unknown }) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | undefined>(undefined)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!ready || !box.current || !window.turnstile) return
    widget.current = window.turnstile.render(box.current, { sitekey: siteKey })
    return () => { if (widget.current) window.turnstile?.remove(widget.current); widget.current = undefined }
  }, [ready, siteKey])

  useEffect(() => { if (widget.current) window.turnstile?.reset(widget.current) }, [resetKey])

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="lazyOnload" onReady={() => setReady(true)} />
      <div ref={box} className="wl-turnstile" />
    </>
  )
}
