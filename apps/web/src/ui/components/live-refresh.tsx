'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { dataVersion } from '@/app/actions'
import { liveHealthy, onLiveEvent } from './devices/live-events'

const EVERY_MS = 20_000
/** Fired on window when new data has landed while the page is open. */
export const DATA_CHANGED = 'relife:data-changed'

/**
 * Keeps open pages current. The server pushes a `data` event over Server-Sent Events (GET /api/v1/events) when something
 * new lands; as the fallback (a proxy that buffers, a stream that won't open) it asks every 20 seconds while the tab is
 * visible, and when you come back to it. Either way the page's data re-renders in place, and client state such as an
 * open dialog or a half-typed form is kept.
 */
export function LiveRefresh() {
  const router = useRouter()
  const seen = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    let busy = false
    const refresh = () => {
      router.refresh()
      window.dispatchEvent(new Event(DATA_CHANGED)) // e.g. a new bank payment to toast
    }
    const check = async () => {
      if (busy || document.visibilityState !== 'visible' || liveHealthy()) return
      busy = true
      try {
        const v = await dataVersion()
        if (seen.current !== undefined && v !== seen.current) refresh()
        seen.current = v
      } catch { /* server restarting: try again next time */ } finally { busy = false }
    }
    void check()
    const timer = setInterval(check, EVERY_MS)
    document.addEventListener('visibilitychange', check)
    const off = onLiveEvent((e) => {
      if (e.type === 'data') { seen.current = e.version; refresh() }
      // Disconnected from another device: find out right now instead of on the next click.
      if (e.type === 'device.revoked') void fetch('/api/v1/me').then((r) => { if (r.status === 401) location.assign('/signin?reason=revoked') }).catch(() => {})
    })
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); off() }
  }, [router])

  return null
}
