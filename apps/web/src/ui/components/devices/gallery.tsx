'use client'

import { useState } from 'react'
import { ApproveCard } from './approve-card'
import { CodeInput } from './code-input'
import { ConnectCode } from './connect-code'
import { DeviceTile } from './device-kind'
import { QrCode } from './qr-code'
import type { WaitingDevice } from '@/app/devices-actions'

/** /dev/ui: the pairing parts in every state. Nothing here talks to the server. */

const sample = (soon: string): WaitingDevice => ({
  id: 'sample', kind: 'browser', name: 'Firefox on Linux', platform: 'Linux', code: 'QJFH-5KAQ', ip: '192.168.1.24', via: 'localhost',
  askedAt: soon, expiresAt: soon,
})

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-2 text-[13px] text-ink-2">{children}</div>

/** `now` is the time of the request (the page is rendered per request, so a countdown has something real to count). */
export function DevicesGallery({ now }: { now: number }) {
  const waiting = { ...sample(new Date(now + 9 * 60_000).toISOString()), askedAt: new Date(now - 60_000).toISOString() }
  const gone: WaitingDevice = { ...waiting, id: 'sample-2', kind: 'extension', name: 'Chrome extension', expiresAt: new Date(now - 60_000).toISOString() }
  const [typed, setTyped] = useState('C2DY')
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <Label>Connect code: sm, md, lg, struck (used up)</Label>
        <div className="flex flex-col items-start gap-3 rounded-md bg-surface-2 p-4">
          <ConnectCode code="C2DY-K8J8" size="sm" />
          <ConnectCode code="C2DY-K8J8" size="md" />
          <ConnectCode code="C2DY-K8J8" size="lg" />
          <ConnectCode code="C2DY-K8J8" size="md" struck />
        </div>
      </div>
      <div>
        <Label>QR code: live, then dimmed when it has expired</Label>
        <div className="flex items-start gap-4 rounded-md bg-surface-2 p-4">
          <QrCode value="https://mac.relife-demo.ts.net/pair#s=sample" label="Sample QR code" className="size-36" />
          <QrCode value="https://mac.relife-demo.ts.net/pair#s=sample" label="Sample expired QR code" dim className="size-36" />
        </div>
      </div>
      <div>
        <Label>Code input: typing, wrong code, disabled</Label>
        <div className="flex flex-col gap-3 rounded-md bg-surface-2 p-4">
          <CodeInput value={typed} onChange={setTyped} label="Sample code, typing" />
          <CodeInput value="C2DYK8J9" onChange={() => {}} invalid label="Sample code, wrong" />
          <CodeInput value="C2DYK8J8" onChange={() => {}} disabled label="Sample code, checking" />
        </div>
      </div>
      <div>
        <Label>Device tile, one per kind (and the quiet one)</Label>
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-2 p-4">
          {(['browser', 'mac', 'extension', 'phone', 'cli'] as const).map((k) => <DeviceTile key={k} kind={k} />)}
          <DeviceTile kind="browser" quiet />
        </div>
      </div>
      <div>
        <Label>Approve card: waiting</Label>
        <div className="rounded-md bg-surface-2 p-4" inert><ApproveCard device={waiting} /></div>
      </div>
      <div>
        <Label>Approve card: request ran out (the extension)</Label>
        <div className="rounded-md bg-surface-2 p-4" inert><ApproveCard device={gone} /></div>
      </div>
    </div>
  )
}
