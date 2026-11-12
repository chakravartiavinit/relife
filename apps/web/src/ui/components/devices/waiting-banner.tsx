'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { denyDevice, waitingDevices, type WaitingDevice } from '@/app/devices-actions'
import { EASE_OUT } from '@/ui/beui/lib/ease'
import { Button } from '../button'
import { Dialog } from '../forms/dialog'
import { ApproveCard } from './approve-card'
import { DeviceTile } from './device-kind'
import { onLiveEvent } from './live-events'

/**
 * A device is waiting to be let in: a banner on any dashboard page (the Devices page and the approve page already show
 * it). It learns of a new request over the event stream, with a slow poll as the fallback.
 */
export function WaitingBanner() {
  const path = usePathname()
  const [list, setList] = useState<WaitingDevice[]>([])
  const [review, setReview] = useState<WaitingDevice | null>(null)
  const refresh = useCallback(() => { void waitingDevices().then(setList).catch(() => setList([])) }, [])
  useEffect(() => {
    refresh()
    const off = onLiveEvent((e) => { if (e.type === 'pairing') refresh() })
    const poll = setInterval(refresh, 15_000)
    return () => { off(); clearInterval(poll) }
  }, [refresh])

  const hidden = path === '/settings/devices' || path.startsWith('/pair')
  const w = hidden ? null : list[0]
  return (
    <>
      <AnimatePresence>
        {w ? (
          <motion.div
            key={w.id} role="status" aria-live="polite"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="fixed inset-x-3 top-3 z-40 mx-auto flex max-w-[560px] items-center gap-3 rounded-[20px] bg-surface p-3 shadow-3 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--pill)_25%,transparent)]"
          >
            <DeviceTile kind={w.kind} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">“{w.name}” wants to connect</p>
              <p className="truncate text-[12.5px] text-ink-3">Code <span className="font-mono tabular-nums">{w.code}</span>{list.length > 1 ? ` · ${list.length - 1} more waiting` : ''}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={async () => { await denyDevice(w.id); refresh() }}>Deny</Button>
            <Button size="sm" variant="primary" onClick={() => setReview(w)}>Review</Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Dialog open={!!review} onClose={() => { setReview(null); refresh() }} width="max-w-[520px]" title="Connect a device" description="Check the code, then let it in.">
        {review ? <ApproveCard device={review} onResult={() => refresh()} /> : null}
      </Dialog>
    </>
  )
}
