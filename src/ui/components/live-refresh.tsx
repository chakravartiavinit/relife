'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { dataVersion } from '@/app/actions'

const EVERY_MS = 20_000
/** Fired on window when new data has landed while the page is open. */
export const DATA_CHANGED = 'relife:data-changed'

/**
 * Keeps open pages current: every 20 seconds while the tab is visible (and when you come back to it), asks for the
 * latest data change and, when there's something new, re-renders the page's data in place. Client state such as an
 * open dialog or a half-typed form is kept.
 */
export function LiveRefresh() {
  const router = useRouter()
  const seen = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    let busy = false
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        const v = await dataVersion()
        if (seen.current !== undefined && v !== seen.current) {
          router.refresh()
          window.dispatchEvent(new Event(DATA_CHANGED)) // e.g. a new bank payment to toast
        }
        seen.current = v
      } catch { /* server restarting: try again next time */ } finally { busy = false }
    }
    void check()
    const timer = setInterval(check, EVERY_MS)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [router])

  return null
}
