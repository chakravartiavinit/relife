import type { Device } from './devices'

// A looked-up device is trusted from memory for 30 s, so the check on every request is not a query. Kept on globalThis
// so the proxy and the route handlers (separate module graphs in one process) share it, and a revoke clears both.

type Entry = { device: Device; until: number }
const g = globalThis as unknown as { __relifeDevices?: Map<string, Entry> }
const map = () => (g.__relifeDevices ??= new Map())

export const cacheGet = (hash: string, now = Date.now()) => {
  const e = map().get(hash)
  if (e && e.until > now) return e.device
  map().delete(hash)
  return undefined
}
export const cachePut = (hash: string, device: Device, ms: number, now = Date.now()) => { map().set(hash, { device, until: now + ms }) }
export function forgetDevice(id: string) {
  for (const [k, v] of map()) if (v.device.id === id) map().delete(k)
}
