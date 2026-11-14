'use client'

import type { Event } from '@relife/contract'

// One shared EventSource for the page (GET /api/v1/events, the session cookie rides along). Open only while something
// listens. After 3 failed (re)connects it gives up: LiveRefresh keeps its 20 s poll for exactly that case.

type Handler = (e: Event) => void
const handlers = new Set<Handler>()
const TYPES: Event['type'][] = ['hello', 'data', 'pairing', 'device.revoked', 'ping']
let source: EventSource | null = null
let failures = 0
let lastAt = 0
let retry: ReturnType<typeof setTimeout> | undefined

function open() {
  if (source || typeof EventSource === 'undefined' || failures >= 3) return
  const s = (source = new EventSource('/api/v1/events'))
  s.onopen = () => { failures = 0 }
  for (const t of TYPES) {
    s.addEventListener(t, (m) => {
      lastAt = Date.now()
      try { for (const h of handlers) h(JSON.parse((m as MessageEvent<string>).data) as Event) } catch { /* ignore a bad frame */ }
    })
  }
  s.onerror = () => {
    // The browser retries by itself while the stream was open; a refused connection (401, restart) closes it for good.
    if (s.readyState !== EventSource.CLOSED) return
    source = null
    failures++
    if (handlers.size && failures < 3) retry = setTimeout(open, 1500 * failures)
  }
}

function close() {
  clearTimeout(retry)
  source?.close()
  source = null
}

/** Whether the stream is delivering (a ping arrives every 25 s), so pollers can stand down. */
export const liveHealthy = () => source?.readyState === EventSource.OPEN && Date.now() - lastAt < 60_000

// Leaving the page (a full navigation, or the back/forward cache keeping it) must free the connection: a browser allows
// six to one host, and a stream per page you have visited would stall the seventh. Coming back to a kept page reopens it.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', close)
  window.addEventListener('pageshow', (e) => { if (e.persisted && handlers.size) { failures = 0; open() } })
}

export function onLiveEvent(h: Handler) {
  handlers.add(h)
  failures = 0
  open()
  return () => { handlers.delete(h); if (!handlers.size) close() }
}
