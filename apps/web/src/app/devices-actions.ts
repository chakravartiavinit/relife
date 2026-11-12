'use server'

import brand from '@relife/brand/brand.json'
import { cookies, headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DeviceKind } from '@relife/contract'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { pairBase } from '@/core/auth/base-url'
import { listDevices, renameDevice, revokeDevice } from '@/core/auth/devices'
import { toListItem, toWaiting, type WaitingDevice } from '@/core/auth/device-view'
import { approveRequest, createOffer, denyRequest, offerStatus, PairError, pendingRequests, requestById, requestByCode } from '@/core/auth/pairing'
import { requestOrigin } from '@/core/auth/request'
import { clientIp, cookieName } from '@/core/auth/trust'
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
  source: 'origin' | 'env' | 'tailscale' | 'none'
  /** For the Mac app: this dashboard's own address and the secret. */
  macLink: string
  /** The address the dialog says it pairs with. */
  host: string
  /** The dashboard is open on 127.0.0.1 or localhost. */
  loopback: boolean
}

/** "Connect a device": a 2-minute single-use offer (flow A). */
export async function createPairingOffer(): Promise<Offer> {
  const device = await requireDevice()
  const h = await headers()
  const base = await pairBase(h)
  const offer = await createOffer({ userId: device.userId, deviceId: device.id, baseUrl: base.url })
  const origin = requestOrigin(h)
  return {
    id: offer.id, code: formatCode(offer.userCode), expiresAt: offer.expiresAt.toISOString(),
    qrUrl: base.url ? `${base.url}/pair#s=${offer.secret}` : null, source: base.source,
    macLink: `relife://pair?server=${encodeURIComponent(origin)}&s=${offer.secret}`, host: new URL(origin).host,
    loopback: /^(127\.0\.0\.1|localhost|\[::1\])$/.test(new URL(origin).hostname),
  }
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
  return (await pendingRequests()).map(toWaiting)
}

/** The code typed into the dialog (what a device is showing): the waiting device it belongs to, or why not. */
export async function findWaitingByCode(code: string): Promise<{ ok: true; device: WaitingDevice } | { ok: false; error: string }> {
  await requireDevice()
  const ip = clientIp(await headers())
  try {
    const p = await requestByCode(z.string().max(40).parse(code), ip)
    return p ? { ok: true, device: toWaiting(p) } : { ok: false, error: `No device is showing that code. Check it, or open ${brand.name} on the device again.` }
  } catch (e) {
    if (e instanceof PairError) return { ok: false, error: e.message }
    throw e
  }
}

export async function waitingById(id: string): Promise<WaitingDevice | null> {
  await requireDevice()
  const p = await requestById(z.uuid().parse(id))
  return p ? toWaiting(p) : null
}

export async function approveDevice(id: string) {
  const device = await requireDevice()
  const p = await approveRequest({ id: z.uuid().parse(id), userId: device.userId, deviceId: device.id })
  revalidatePath('/settings/devices')
  return p ? { ok: true as const, name: p.deviceName ?? 'Device' } : { ok: false as const, error: 'This request expired or was already answered. Ask the device to connect again.' }
}

export async function denyDevice(id: string) {
  const device = await requireDevice()
  const ok = await denyRequest({ id: z.uuid().parse(id), userId: device.userId })
  revalidatePath('/settings/devices')
  return { ok }
}

export async function renameMyDevice(id: string, name: string) {
  const device = await requireDevice()
  const ok = await renameDevice(device.userId, z.uuid().parse(id), z.string().trim().min(1).max(80).parse(name))
  revalidatePath('/settings/devices')
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
  revalidatePath('/settings/devices')
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
  const [u] = await db.select({ profile: schema.users.profile }).from(schema.users).where(eq(schema.users.id, user.id))
  await db.update(schema.users).set({ profile: { ...u?.profile, requireSignIn: z.boolean().parse(on) } }).where(eq(schema.users.id, user.id))
  const { clearUserCache } = await import('@/core/user')
  clearUserCache()
  revalidatePath('/settings/devices')
  return { ok: true as const }
}
