'use client'

import { useState } from 'react'
import type { ReachId } from '@/core/auth/reach'
import { QrCode } from './qr-code'
import { PhoneSetup, type ReachData } from './phone-setup'
import { ReachOptionRow } from './reach-option-row'
import { PushRow } from '../push-row'
import { NotificationChannel } from '../notification-channel'
import { NotificationSettings } from '../notification-settings'
import type { PushState } from '@/domain/push'

/** /dev/ui: "Use on your phone" and the push row in every state. Nothing here talks to the server. */


const PUSH_STATES: { state: PushState; label: string; devices: number; ios?: boolean }[] = [
  { state: 'off', label: 'Off (Turn on)', devices: 1 },
  { state: 'on', label: 'On', devices: 2 },
  { state: 'blocked', label: 'Blocked in the browser', devices: 1 },
  { state: 'insecure', label: 'Not on https', devices: 0 },
  { state: 'ios-install', label: 'iPhone, not on the Home Screen', devices: 0, ios: true },
  { state: 'unsupported', label: 'Browser has no push', devices: 0 },
]

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-2 text-small text-ink-2">{children}</div>
const sampleQr = (choice: ReachId) => <QrCode value={`https://mac.relife-demo.ts.net/pair#s=sample-${choice}`} label="Sample QR code" />
const pushNow = <PushRow state="on" devices={2} />

export function PhoneGallery({ nothing, tailscale, long, docker }: { nothing: ReachData; tailscale: ReachData; long: ReachData; docker: ReachData }) {
  const [pick, setPick] = useState<ReachId | null>('tailscale')
  const stay = async () => nothing
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Label>Phone setup: nothing ready (the code is hidden)</Label>
        <div className="rounded-md bg-surface-2 p-4"><PhoneSetup reach={nothing} phone={false} qr={sampleQr} push={pushNow} check={stay} /></div>
      </div>
      <div>
        <Label>Phone setup: Tailscale ready, the local network to fix</Label>
        <div className="rounded-md bg-surface-2 p-4"><PhoneSetup reach={tailscale} phone={false} qr={sampleQr} push={pushNow} check={async () => tailscale} /></div>
      </div>
      <div>
        <Label>Phone setup: long names, several interfaces, a public address that needs allowing</Label>
        <div className="rounded-md bg-surface-2 p-4"><PhoneSetup reach={long} phone={false} qr={sampleQr} push={pushNow} check={async () => long} /></div>
      </div>
      <div>
        <Label>Phone setup: in Docker (the container address is never shown)</Label>
        <div className="rounded-md bg-surface-2 p-4"><PhoneSetup reach={docker} phone={false} qr={sampleQr} push={pushNow} check={async () => docker} /></div>
      </div>
      <div>
        <Label>Phone setup: opened on the phone itself (address and code fold away)</Label>
        <div className="rounded-md bg-surface-2 p-4"><PhoneSetup reach={tailscale} phone qr={sampleQr} push={pushNow} check={async () => tailscale} /></div>
      </div>
      <div>
        <Label>Option row: ready and picked, ready, needs setup, not available</Label>
        <ul role="radiogroup" aria-label="Sample options" className="flex max-w-xl flex-col gap-2.5 rounded-md bg-surface-2 p-4">
          {tailscale.options.map((o) => <ReachOptionRow key={o.id} option={o} selected={pick === o.id && o.state === 'ready'} onPick={() => setPick(o.id)} />)}
        </ul>
      </div>
      <div>
        <Label>Push on this device: the six states</Label>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PUSH_STATES.map((p) => (
            <div key={p.state}>
              <div className="mb-1 text-caption text-ink-3">{p.label}</div>
              <div className="rounded-md bg-surface-2 p-4" inert><PushRow state={p.state} devices={p.devices} ios={p.ios} /></div>
            </div>
          ))}
          <div>
            <div className="mb-1 text-caption text-ink-3">Turn on, waiting for permission</div>
            <div className="rounded-md bg-surface-2 p-4" inert><PushRow state="off" devices={1} pending="on" /></div>
          </div>
          <div>
            <div className="mb-1 text-caption text-ink-3">On: a test went out</div>
            <div className="rounded-md bg-surface-2 p-4" inert><PushRow state="on" devices={2} result={{ tone: 'good', text: 'Sent. It should arrive in a moment.' }} /></div>
          </div>
          <div>
            <div className="mb-1 text-caption text-ink-3">On: the test failed</div>
            <div className="rounded-md bg-surface-2 p-4" inert><PushRow state="on" devices={2} result={{ tone: 'bad', text: 'The push service did not take it. Turn push off and on again on this device.' }} /></div>
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Label>Where they go: Telegram and push on this device</Label>
          <div className="max-w-[340px]"><NotificationChannel telegram stats={{ sent: 41, held: 6, skipped: 0 }} pushDevices={2} push={pushNow} /></div>
        </div>
        <div>
          <Label>Where they go: push only, Telegram not connected</Label>
          <div className="max-w-[340px]"><NotificationChannel telegram={false} stats={{ sent: 12, held: 0, skipped: 0 }} pushDevices={1} push={<PushRow state="on" devices={1} />} /></div>
        </div>
      </div>
      <div>
        <Label>Notifications: the "Send to" chips (they show when Telegram and push both exist; the last one stays on)</Label>
        <div className="max-w-3xl rounded-md bg-surface-2 p-4" inert>
          <NotificationSettings both initial={{ quiet: null, categories: { reminders: { channels: ['push'] }, alerts: { channels: ['telegram', 'push'] } } }} />
        </div>
      </div>
    </div>
  )
}
