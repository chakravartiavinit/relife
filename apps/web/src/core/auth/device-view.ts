import type { DeviceInfo, DeviceListItem } from '@relife/contract'
import type { Device, DeviceMeta } from './devices'

export function toListItem(d: Device, currentId: string | null): DeviceListItem {
  const m = d.meta as DeviceMeta
  return {
    id: d.id, kind: d.kind, name: d.name, scopes: d.scopes, via: d.via, lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(), current: d.id === currentId, legacy: !!m.legacy, appVersion: m.appVersion ?? null, platform: m.platform ?? null,
  }
}

export const toInfo = (d: Device): DeviceInfo => ({ id: d.id, kind: d.kind, name: d.name, scopes: d.scopes })
