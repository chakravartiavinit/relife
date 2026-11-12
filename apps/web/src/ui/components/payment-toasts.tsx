'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { newPayments, paymentsSeen } from '@/app/actions'
import { useToast } from './toast'
import { DATA_CHANGED } from './live-refresh'
import { TOUR_END, touring } from './tour/tour'

const DURATION = 8000 // long enough to read an amount and a name
const RECHECK_MS = 30_000 // coming back to the tab sooner than this doesn't ask again
/** Shown in this page already: a double run (React dev mode, two quick checks) never shows one twice. */
const shown = new Set<string>()

/**
 * Bank credits and debits recorded since you last looked, shown once as toasts when the dashboard opens and when
 * you come back to its tab. Once shown they're marked seen, so another tab or a reload won't repeat them.
 */
export function PaymentToasts() {
  const toast = useToast()
  const router = useRouter()
  const last = useRef(0)

  useEffect(() => {
    const check = async (e?: Event) => {
      // New data that just landed always counts; a tab switch only after RECHECK_MS.
      if (document.visibilityState !== 'visible' || (e?.type !== DATA_CHANGED && Date.now() - last.current < RECHECK_MS)) return
      // Not during setup or the tour: both have the screen to themselves. It checks again when the tour ends.
      if (location.pathname.startsWith('/welcome') || touring()) return
      last.current = Date.now()
      const res = await newPayments().catch(() => null)
      if (!res?.upTo) return
      const items = res.items.filter((p) => !shown.has(p.id))
      if (!items.length) return
      items.forEach((p) => shown.add(p.id))
      const open = { label: 'View', onClick: () => router.push('/wealth/spending') }
      const total = items.length + res.more
      if (total === 1) {
        const [p] = items
        toast(p.title, p.credit ? 'good' : 'neutral', { description: p.detail, duration: DURATION, action: open, icon: p.credit ? ArrowDownLeft : ArrowUpRight })
      } else if (total > 1) {
        // One toast for the batch, not one per payment: the newest by name, the rest on Spending.
        toast(`${total} new payments`, 'neutral', {
          description: `Latest: ${items[0].title.replace(/ (paid|received) /, ' ')}`,
          duration: DURATION, action: open, icon: '/routines/money.png',
        })
      }
      // Marked seen only after they're on screen, so nothing is lost to a reload in between.
      await paymentsSeen(res.upTo).catch(() => {})
    }
    void check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener(DATA_CHANGED, check)
    window.addEventListener(TOUR_END, check)
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener(DATA_CHANGED, check); window.removeEventListener(TOUR_END, check) }
  }, [toast, router])

  return null
}
