'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { newPayments, paymentsSeen } from '@/app/actions'
import { useToast } from './toast'
import { DATA_CHANGED } from './live-refresh'

const SHOWN = 3
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
      last.current = Date.now()
      const res = await newPayments().catch(() => null)
      if (!res?.upTo) return
      const items = res.items.filter((p) => !shown.has(p.id))
      items.forEach((p) => shown.add(p.id))
      const open = { label: 'View', onClick: () => router.push('/wealth/spending') }
      for (const p of items.slice(0, SHOWN)) {
        toast.show({
          title: p.title, description: p.detail, tone: p.credit ? 'good' : 'neutral', duration: DURATION, action: open,
          icon: p.credit
            ? <ArrowDownLeft className="size-4 text-good" strokeWidth={2} aria-hidden />
            : <ArrowUpRight className="size-4 text-ink-2" strokeWidth={2} aria-hidden />,
        })
      }
      const rest = items.length - SHOWN + res.more
      if (rest > 0) toast.show({ title: `${rest} more bank payment${rest === 1 ? '' : 's'}`, description: 'All on Spending', duration: DURATION, action: open })
      // Marked seen only after they're on screen, so nothing is lost to a reload in between.
      await paymentsSeen(res.upTo).catch(() => {})
    }
    void check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener(DATA_CHANGED, check)
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener(DATA_CHANGED, check) }
  }, [toast, router])

  return null
}
