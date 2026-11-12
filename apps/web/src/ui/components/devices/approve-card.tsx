'use client'

import { useState, useTransition } from 'react'
import { Check, Clock, X } from 'lucide-react'
import { approveDevice, denyDevice, type WaitingDevice } from '@/app/devices-actions'
import { cn } from '@/ui/cn'
import { Button } from '../button'
import { SystemLabel } from '../card'
import { ConnectCode } from './connect-code'
import { DeviceTile, KIND } from './device-kind'
import { ago, mmss, useCountdown } from './use-countdown'

/** What a device can do once approved, in plain words (the extension has the smaller scope). */
const CAN: Record<string, string> = {
  extension: 'See Today, check off quests, quick log, send browsing time',
  default: 'See and log everything, like this dashboard',
}

export type ApproveResult = { status: 'approved' | 'denied'; name: string }

/**
 * Approve or deny a device that is waiting (flow B). The code is shown large so it can be compared with the one on the
 * device's own screen; the device, where it asked from and what it may do are in plain words. Used in the Connect dialog,
 * on Settings → Devices, on the approve page and from the banner.
 */
export function ApproveCard({ device, onResult, className }: { device: WaitingDevice; onResult?: (r: ApproveResult) => void; className?: string }) {
  const [state, setState] = useState<'idle' | 'approved' | 'denied' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const left = useCountdown(device.expiresAt)
  const expired = left === 0
  const kind = KIND[device.kind]
  const title = `“${device.name}”`

  const answer = (approve: boolean) => start(async () => {
    setError(null)
    if (approve) {
      const r = await approveDevice(device.id)
      if (!r.ok) { setError(r.error); setState('error'); return }
      setState('approved'); onResult?.({ status: 'approved', name: device.name })
    } else {
      await denyDevice(device.id)
      setState('denied'); onResult?.({ status: 'denied', name: device.name })
    }
  })

  if (state === 'approved') {
    return (
      <div role="status" className={cn('flex items-center gap-3 rounded-[16px] bg-pill-wash p-4', className)}>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-good/15 text-good"><Check className="size-5" strokeWidth={2} /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{device.name} is connected</p>
          <p className="text-[13px] text-ink-3">It stays signed in until you disconnect it in Settings → Devices.</p>
        </div>
      </div>
    )
  }
  if (state === 'denied') {
    return (
      <div role="status" className={cn('flex items-center gap-3 rounded-[16px] bg-surface-2 p-4', className)}>
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-bad/10 text-bad"><X className="size-5" strokeWidth={2} /></span>
        <p className="text-[15px] font-semibold text-ink">You turned {device.name} away</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-start gap-4">
        <DeviceTile kind={device.kind} className="size-11" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink">Approve {title}?</h3>
          <p className="mt-1 text-[13px] text-ink-3">It asked to connect to your ReLife {ago(device.askedAt)}.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-3 rounded-[16px] bg-surface-2 px-4 py-4 text-center">
        <SystemLabel>Check the code</SystemLabel>
        <ConnectCode code={device.code} size="lg" struck={expired} />
        <p className="text-[13px] text-ink-3">It should match the code on {kind.label === 'Browser' ? 'that browser' : `the ${kind.label}`}’s screen.</p>
      </div>

      <dl className="mt-4 grid grid-cols-[84px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px]">
        <dt className="text-ink-3">Device</dt>
        <dd className="text-ink">{device.name}{device.platform ? <span className="text-[13px] text-ink-3"> · {device.platform}</span> : null}</dd>
        <dt className="text-ink-3">From</dt>
        <dd className="text-ink">{device.ip === 'local' ? 'This computer' : device.ip}{device.via ? <span className="text-[13px] text-ink-3"> · via {device.via}</span> : null}</dd>
        <dt className="text-ink-3">Can</dt>
        <dd className="text-ink">{CAN[device.kind] ?? CAN.default}</dd>
        <dt className="text-ink-3">Signed in</dt>
        <dd className="text-ink">Until you disconnect it in Settings → Devices</dd>
      </dl>

      {error ? <p role="alert" className="mt-4 rounded-md bg-bad/8 px-3 py-2 text-[13px] text-bad">{error}</p> : null}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-divider pt-4">
        <span className="mr-auto flex items-center gap-1.5 text-[12.5px] text-ink-3 tabular-nums">
          <Clock className="size-3.5" strokeWidth={1.5} aria-hidden />
          {left === null ? 'Request expires soon' : expired ? 'This request expired. Ask the device to connect again.' : `Request expires in ${mmss(left)}`}
        </span>
        <Button variant="secondary" onClick={() => answer(false)} disabled={pending || expired}>Deny</Button>
        <Button variant="primary" onClick={() => answer(true)} disabled={pending || expired}><Check className="size-4" strokeWidth={2} aria-hidden />Approve</Button>
      </div>
    </div>
  )
}
