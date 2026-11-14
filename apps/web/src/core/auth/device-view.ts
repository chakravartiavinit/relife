import type { DeviceInfo, DeviceKind, DeviceListItem, Scope } from '@relife/contract'
import type { Pairing, PairingMeta } from './pairing'
import { formatCode } from './tokens'
import type { Device, DeviceMeta } from './devices'

export function toListItem(d: Device, currentId: string | null): DeviceListItem {
  const m = d.meta as DeviceMeta
  return {
    id: d.id, kind: d.kind, name: d.name, scopes: d.scopes, via: d.via, lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(), current: d.id === currentId, legacy: !!m.legacy, appVersion: m.appVersion ?? null, platform: m.platform ?? null,
  }
}

export const toInfo = (d: Device): DeviceInfo => ({ id: d.id, kind: d.kind, name: d.name, scopes: d.scopes })

/** A device waiting to be approved (flow B), as the Devices page, the banner and the approve page show it. */
export type WaitingDevice = {
  id: string; kind: DeviceKind; name: string; platform: string | null; scopes: Scope[]; code: string; ip: string; via: string | null; askedAt: string; expiresAt: string
}

export function toWaiting(p: Pairing): WaitingDevice {
  const m = p.meta as PairingMeta
  return {
    id: p.id, kind: p.kind ?? 'browser', name: p.deviceName ?? 'Device', platform: m.platform ?? null, scopes: p.scopes, code: formatCode(p.userCode ?? ''),
    ip: m.requesterIp ?? 'local', via: m.via ?? null, askedAt: p.createdAt.toISOString(), expiresAt: p.expiresAt.toISOString(),
  }
}
