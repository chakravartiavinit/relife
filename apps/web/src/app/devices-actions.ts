'use server'

import brand from '@relife/brand/brand.json'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import type { DeviceKind } from '@relife/contract'
import { mayAnswerRequest, visibleRequests } from '@/core/people'
import { getUser, mergeProfile } from '@/core/user'
import { pairBase, type PairBase } from '@/core/auth/base-url'
import { loadReach, type ReachId } from '@/core/auth/reach'
import { listDevices, renameDevice, revokeDevice } from '@/core/auth/devices'
import { toListItem, toWaiting, type WaitingDevice } from '@/core/auth/device-view'
import { approveRequest, createOffer, denyRequest, offerStatus, PairError, pendingRequests, requestById, requestByCode } from '@/core/auth/pairing'
import { cookieName, limitKey, requestOrigin } from '@/core/auth/trust'
import { requireDevice } from '@/core/auth/viewer'
import { formatCode } from '@/core/auth/tokens'
import { revalidatePath } from 'next/cache'

// Server actions behind Settings → Devices, the Connect a device dialog and the approve card. Every one needs a signed-in
// browser (requireDevice), whatever the proxy already checked, and scopes its writes to that device's user. Next checks
// the Origin of an action POST, which is the CSRF guard for approvals and offers.

export type { WaitingDevice }

export type Offer = {
  id: string; code: string; expiresAt: string
  /** The link in the QR, when a phone can reach this server. */
  qrUrl: string | null
  /** Why there is none, or where the address came from. */
  source: PairBase['source']
  /** For the Mac app: this dashboard's own address and the secret. */
  macLink: string
  /** The address the dialog says it pairs with. */
  host: string
  /** The dashboard is open on 127.0.0.1 or localhost. */
  loopback: boolean
}

const SOURCE: Record<ReachId, PairBase['source']> = { origin: 'origin', tailscale: 'tailscale', lan: 'lan', public: 'env' }

/**
 * "Connect a device": a 2-minute single-use offer (flow A). With `choice` (the "Use on your phone" page), the address is that
 * way of reaching the server, taken from the server's own check and only when it is ready: the client never sends a URL.
 * Without it, the address is the best guess (`pairBase`), as in the dialog.
 */
export async function createPairingOffer(choice?: ReachId): Promise<Offer> {
  const device = await requireDevice()
  const h = await headers()
  let base: PairBase
  if (choice) {
    const option = (await loadReach(h)).options.find((o) => o.id === choice)
    if (!option || option.state !== 'ready' || !option.url) throw new Error('That way of reaching this server is not ready yet.')
    base = { url: option.url, source: SOURCE[choice] }
  } else base = await pairBase(h)
  const offer = await createOffer({ userId: device.userId, deviceId: device.id, baseUrl: base.url })
  const origin = requestOrigin(h)
  return {
    id: offer.id, code: formatCode(offer.userCode), expiresAt: offer.expiresAt.toISOString(),
    qrUrl: base.url ? `${base.url}/pair#s=${offer.secret}` : null, source: base.source,
    macLink: `relife://pair?server=${encodeURIComponent(origin)}&s=${offer.secret}`, host: new URL(origin).host,
    loopback: /^(127\.0\.0\.1|localhost|\[::1\])$/.test(new URL(origin).hostname),
  }
}

/** "Check again" on the phone page: the ways a phone can reach this server, with Tailscale asked afresh. */
export async function reachStatus() {
  await requireDevice()
  return loadReach(await headers(), { fresh: true })
}

/** What happened to an offer: waiting, or who joined (the sheet shows "Connected: Safari on iPhone · Remove"). */
export async function offerState(id: string) {
  const device = await requireDevice()
  const s = await offerStatus(device.userId, z.uuid().parse(id))
  if (!s) return null
  return { status: s.status, device: s.deviceId ? { id: s.deviceId, name: s.deviceName ?? 'Device', kind: s.kind ?? ('browser' as DeviceKind) } : null }
}

/** Devices waiting to be approved (flow B), for the list and the banner. */
export async function waitingDevices(): Promise<WaitingDevice[]> {
  await requireDevice()
  return (await visibleRequests(await getUser())).map(toWaiting)
}

/** The code typed into the dialog (what a device is showing): the waiting device it belongs to, or why not. */
export async function findWaitingByCode(code: string): Promise<{ ok: true; device: WaitingDevice } | { ok: false; error: string }> {
  await requireDevice()
  const bucket = limitKey(await headers())
  try {
    const p = await requestByCode(z.string().max(40).parse(code), bucket)
    return p ? { ok: true, device: toWaiting(p) } : { ok: false, error: `No device is showing that code. Check it, or open ${brand.name} on the device again.` }
  } catch (e) {
    if (e instanceof PairError) return { ok: false, error: e.message }
    throw e
  }
}

export async function waitingById(id: string): Promise<WaitingDevice | null> {
  await requireDevice()
  const p = await requestById(z.uuid().parse(id))
  // By id only for the owner: a member finds a device by the code it shows (findWaitingByCode).
  return p && (await mayAnswerRequest(await getUser(), p)) ? toWaiting(p) : null
}

const NOT_YOURS = 'This request is not yours to answer. Type the code the device is showing.'

export async function approveDevice(id: string, code?: string) {
  const device = await requireDevice()
  const waiting = await requestById(z.uuid().parse(id))
  if (waiting && !(await mayAnswerRequest(await getUser(), waiting, z.string().max(40).optional().parse(code)))) return { ok: false as const, error: NOT_YOURS }
  const p = await approveRequest({ id: z.uuid().parse(id), userId: device.userId, deviceId: device.id })
  revalidatePath('/you/settings/devices')
  return p ? { ok: true as const, name: p.deviceName ?? 'Device' } : { ok: false as const, error: 'This request expired or was already answered. Ask the device to connect again.' }
}

export async function denyDevice(id: string, code?: string) {
  const device = await requireDevice()
  const waiting = await requestById(z.uuid().parse(id))
  if (waiting && !(await mayAnswerRequest(await getUser(), waiting, z.string().max(40).optional().parse(code)))) return { ok: false }
  const ok = await denyRequest({ id: z.uuid().parse(id), userId: device.userId })
  revalidatePath('/you/settings/devices')
  return { ok }
}

export async function renameMyDevice(id: string, name: string) {
  const device = await requireDevice()
  const ok = await renameDevice(device.userId, z.uuid().parse(id), z.string().trim().min(1).max(80).parse(name))
  revalidatePath('/you/settings/devices')
  return { ok }
}

/** Disconnect a device. Its own browser signs out: the cookie goes too. */
export async function disconnectDevice(id: string) {
  const device = await requireDevice()
  const target = z.uuid().parse(id)
  const ok = await revokeDevice(device.userId, target)
  const self = target === device.id
  if (ok && self) {
    const jar = await cookies()
    jar.delete(cookieName(false))
    jar.delete(cookieName(true))
  }
  revalidatePath('/you/settings/devices')
  return { ok, self }
}

/** The signed-in list (rows with `current` set for this browser). Used to refresh the page's list in place. */
export async function deviceList() {
  const device = await requireDevice()
  return (await listDevices(device.userId)).map((d) => toListItem(d, device.id))
}

/** Settings → Devices: "Require sign-in on this Mac" turns loopback trust off (a browser on this Mac then has to connect too). */
export async function setRequireSignIn(on: boolean) {
  await requireDevice()
  const user = await getUser()
  await mergeProfile(user.id, { requireSignIn: z.boolean().parse(on) }) // one key, merged in SQL: no lost concurrent write
  revalidatePath('/you/settings/devices')
  return { ok: true as const }
}
