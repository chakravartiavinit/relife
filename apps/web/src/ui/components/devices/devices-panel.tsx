'use client'

import brand from '@relife/brand/brand.json'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Laptop, LogOut, Pencil, Puzzle, Smartphone, X } from 'lucide-react'
import type { DeviceListItem } from '@relife/contract'
import {
  deviceList, denyDevice, disconnectDevice, renameMyDevice, setRequireSignIn, waitingDevices, type WaitingDevice,
} from '@/app/devices-actions'
import { cn } from '@/ui/cn'
import { Switch } from '@/ui/beui/motion/switch'
import { Button } from '../button'
import { Badge } from '../card'
import { Dialog } from '../forms/dialog'
import { Input } from '../form'
import { RowMenu } from '../row-menu'
import { SettingsRow, SettingsSection } from '../settings-layout'
import { useToast } from '../toast'
import { ApproveCard } from './approve-card'
import { CONNECT_EVENT } from './connect-button'
import { ConnectDialog } from './connect-dialog'
import { DeviceTile, KIND } from './device-kind'
import { onLiveEvent } from './live-events'
import { ago } from './use-countdown'

const DETAIL: Record<string, string> = { browser: 'Dashboard', phone: `${brand.name} web app`, mac: 'Mac app', extension: 'Chrome extension', cli: 'Command line' }

/** Settings → Devices (plan Part 2, Dashboard §1): who is waiting, everything signed in, and "Connect a device". */
export function DevicesPanel({ initial, waiting: initialWaiting, requireSignIn, loopbackTrust, approveCode, openConnect }: {
  initial: DeviceListItem[]; waiting: WaitingDevice[]; requireSignIn: boolean
  /** Self-host: a browser on this Mac is signed in without asking (until "Require sign-in on this Mac" is on). */
  loopbackTrust: boolean
  /** From `?approve=CODE`: open the dialog on that code. */
  approveCode?: string
  openConnect?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [devices, setDevices] = useState(initial)
  const [waiting, setWaiting] = useState(initialWaiting)
  const [connect, setConnect] = useState(!!approveCode || !!openConnect)
  const [reviewing, setReviewing] = useState<WaitingDevice | null>(null)
  const [leaving, setLeaving] = useState<DeviceListItem | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [require, setRequire] = useState(requireSignIn)

  const refresh = useCallback(async () => {
    try { const [d, w] = await Promise.all([deviceList(), waitingDevices()]); setDevices(d); setWaiting(w) } catch { /* signed out: the next request redirects */ }
  }, [])
  useEffect(() => {
    const off = onLiveEvent((e) => { if (e.type === 'pairing' || e.type === 'device.revoked') void refresh() })
    const poll = setInterval(() => void refresh(), 10_000)
    return () => { off(); clearInterval(poll) }
  }, [refresh])

  useEffect(() => {
    const open = () => setConnect(true)
    window.addEventListener(CONNECT_EVENT, open)
    return () => window.removeEventListener(CONNECT_EVENT, open)
  }, [])

  const [current] = devices.filter((d) => d.current)
  const onlyThis = devices.filter((d) => !d.legacy).length <= 1 && !waiting.length
  const confirmLeave = async () => {
    if (!leaving) return
    const target = leaving
    setLeaving(null)
    const r = await disconnectDevice(target.id)
    if (r.self) { router.push('/signin?reason=revoked'); router.refresh(); return }
    toast(r.ok ? `${target.name} disconnected` : 'That device was already gone', r.ok ? 'good' : undefined)
    void refresh()
  }

  return (
    <div className="flex flex-col gap-8">
      {waiting.length ? (
        <section aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="mb-3 px-1 text-heading font-semibold tracking-[-0.01em] text-ink">Waiting to connect</h2>
          <ul className="flex flex-col gap-2">
            {waiting.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3.5 rounded-[20px] bg-pill-wash p-3.5 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--pill)_25%,transparent),var(--elev-1)]">
                <DeviceTile kind={w.kind} />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-body font-semibold text-ink">{KIND[w.kind].label} “{w.name}” wants to connect</p>
                  <p className="mt-0.5 text-caption text-ink-3">Asked {ago(w.askedAt)} · from {w.ip === 'local' ? 'this computer' : w.ip} · code <span className="font-mono tabular-nums">{w.code}</span></p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={async () => { await denyDevice(w.id); void refresh() }}>Deny</Button>
                  <Button size="sm" variant="primary" onClick={() => setReviewing(w)}>Review</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SettingsSection id="devices" title="Devices" description={`Everything signed in to your ${brand.name}. Each one has its own key, so disconnecting it signs it out at once.`}>
        {devices.map((d) => (
          <DeviceRow
            key={d.id} d={d} editing={renaming === d.id}
            onEdit={() => setRenaming(d.id)}
            onSave={async (name) => { setRenaming(null); if (name && name !== d.name) { await renameMyDevice(d.id, name); void refresh() } }}
            onCancel={() => setRenaming(null)}
            onLeave={() => setLeaving(d)}
          />
        ))}
        {onlyThis ? <GetEverywhere onConnect={() => setConnect(true)} /> : null}
      </SettingsSection>

      {loopbackTrust ? (
        <SettingsSection id="this-mac" title="This Mac" description="A browser on this Mac is signed in without asking. Turn this on to make it connect like any other device.">
          <SettingsRow label="Require sign-in on this Mac" hint={`Then ${current?.name ?? 'this browser'} and any new browser here connect with a code. Run npm run signin in a terminal if you ever lock yourself out.`}>
            <Switch
              checked={require} ariaLabel="Require sign-in on this Mac"
              onCheckedChange={async (on) => { setRequire(on); await setRequireSignIn(on).catch(() => setRequire(!on)) }}
            />
          </SettingsRow>
        </SettingsSection>
      ) : null}

      <ConnectDialog open={connect} onClose={() => { setConnect(false); void refresh(); if (approveCode) router.replace('/you/settings/devices') }} initialCode={approveCode} />

      <Dialog open={!!reviewing} onClose={() => { setReviewing(null); void refresh() }} width="max-w-[520px]" title="Connect a device" description="Check the code, then let it in.">
        {reviewing ? <ApproveCard device={reviewing} onResult={() => void refresh()} /> : null}
      </Dialog>

      <Dialog
        open={!!leaving} onClose={() => setLeaving(null)} width="max-w-[420px]" icon={LogOut} color="var(--bad)"
        title={leaving?.current ? 'Sign out of this browser?' : `Disconnect ${leaving?.name ?? ''}?`}
        description={leaving?.current ? `You will need to connect it again to use ${brand.name} here.` : 'It signs out now. To use it again, connect it again.'}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setLeaving(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => void confirmLeave()} data-autofocus>{leaving?.current ? 'Sign out' : 'Disconnect'}</Button>
        </div>
      </Dialog>
    </div>
  )
}

function DeviceRow({ d, editing, onEdit, onSave, onCancel, onLeave }: {
  d: DeviceListItem; editing: boolean; onEdit: () => void; onSave: (name: string) => void; onCancel: () => void; onLeave: () => void
}) {
  const detail = [DETAIL[d.kind], d.appVersion ? `${brand.name} ${d.appVersion}` : null, d.platform, d.via && d.via !== 'local' ? `via ${d.via}` : null].filter(Boolean).join(' · ')
  const age = d.lastSeenAt ? Date.now() - new Date(d.lastSeenAt).getTime() : Infinity
  const tone = age < 10 * 60_000 ? 'bg-good' : age < 7 * 86_400_000 ? 'bg-ink-3' : 'bg-warn'
  const seen = age < 2 * 60_000 ? 'Active now' : ago(d.lastSeenAt)
  const items = [
    { label: 'Rename', icon: Pencil, onSelect: onEdit },
    { label: d.current ? 'Sign out' : 'Disconnect', icon: LogOut, onSelect: onLeave },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
      <DeviceTile kind={d.kind} quiet={!d.current && age > 7 * 86_400_000} />
      <div className="min-w-0 flex-1 basis-48">
        {editing ? <RenameField name={d.name} onSave={onSave} onCancel={onCancel} /> : (
          <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
            <span className="truncate">{d.name}</span>
            {d.current ? <Badge color="var(--pill)">This device</Badge> : null}
          </p>
        )}
        <p className="mt-0.5 truncate text-caption text-ink-3">{detail}</p>
        {d.legacy ? <p className="mt-1 flex items-center gap-2 text-caption text-ink-3"><Badge color="var(--warn)">Old token</Badge>Remove it once the extension is updated.</p> : null}
      </div>
      <span className="flex items-center gap-2 text-small text-ink-2 tabular-nums">
        <span aria-hidden className={cn('size-[7px] rounded-full', tone)} />{seen}
      </span>
      <RowMenu label={d.name} items={items} />
    </div>
  )
}

function RenameField({ name, onSave, onCancel }: { name: string; onSave: (n: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(name)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.select() }, [])
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(v.trim()) }} className="flex items-center gap-1.5">
      <Input ref={ref} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} maxLength={80} aria-label="Device name" autoFocus className="h-9 max-w-64" />
      <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name"><Check className="size-[18px]" strokeWidth={1.5} /></Button>
      <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={onCancel}><X className="size-[18px]" strokeWidth={1.5} /></Button>
    </form>
  )
}

/** Only this browser is signed in: three ways to get the app onto the other screens. */
function GetEverywhere({ onConnect }: { onConnect: () => void }) {
  const cards = [
    { icon: Laptop, title: 'Mac app', text: 'Menu bar, a quick-log shortcut and reminders.', action: 'Connect the Mac app' },
    { icon: Puzzle, title: 'Chrome extension', text: 'Today in a popup, and browsing time counted for you.', action: 'Connect the extension' },
    { icon: Smartphone, title: 'Phone', text: `Scan a code, add ${brand.name} to your Home Screen.`, action: 'Scan to connect' },
  ]
  return (
    <div className="py-6">
      <h3 className="font-display text-heading font-bold tracking-[-0.015em] text-ink">Get {brand.name} everywhere</h3>
      <p className="mt-1 text-small text-ink-3">This browser is the only device so far.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {cards.map(({ icon: Icon, title, text, action }) => (
          <li key={title} className="flex flex-col gap-3 rounded-[16px] bg-surface-2 p-4">
            <span aria-hidden className="grid size-9 place-items-center rounded-[10px] bg-pill-wash text-pill-ink"><Icon className="size-[18px]" strokeWidth={1.5} /></span>
            <div className="flex-1"><p className="text-body font-semibold text-ink">{title}</p><p className="mt-0.5 text-caption leading-relaxed text-ink-3">{text}</p></div>
            <Button size="sm" onClick={onConnect}>{action}</Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
